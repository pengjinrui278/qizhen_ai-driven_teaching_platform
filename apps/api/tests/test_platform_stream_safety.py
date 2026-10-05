"""平台流式并发回归：独立临时库、合成题目、受控离线模型。"""
import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from threading import BoundedSemaphore, Event, Lock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from test_platform import HEADERS, account_client, attempt, register

from mirror_api import course_stream
from mirror_api.llm import StubMirrorModel
from mirror_api.main import _auth_attempts, app, configure
from mirror_api.models import LearningEvidenceRow, MirrorEvent
from mirror_api.seed import seed_profiles


@pytest.fixture
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("MIRROR_LLM_PROVIDER", "stub")
    monkeypatch.setenv("MIRROR_ALLOW_STUB_LEARNING", "true")
    configure(app, "sqlite:///" + str(tmp_path / "stream.sqlite"))
    _auth_attempts.clear()
    with app.state.session_factory() as db:
        seed_profiles(db)
    yield TestClient(app, headers=HEADERS)
    app.state.engine.dispose()


@pytest.fixture
def workers(monkeypatch):
    pool = ThreadPoolExecutor(max_workers=4)
    class Futures(list):
        four_submitted = Event()
    futures = Futures()
    class Tracked:
        def submit(self, fn):
            future = pool.submit(fn)
            futures.append(future)
            if len(futures) == 4:
                futures.four_submitted.set()
            return future
    monkeypatch.setattr(course_stream, "_workers", Tracked())
    monkeypatch.setattr(course_stream, "_slots", BoundedSemaphore(4))
    yield futures
    pool.shutdown(wait=True)


def frames(response):
    return [(p.splitlines()[0][7:], json.loads(p.split("data: ", 1)[1]))
            for p in response.text.split("\n\n") if p.startswith("event: ")]


def all_slots_free():
    acquired = []
    try:
        for _ in range(4):
            ok = course_stream._slots.acquire(blocking=False)
            acquired.append(ok)
        assert all(acquired)
        assert not course_stream._slots.acquire(blocking=False)
    finally:
        for ok in acquired:
            if ok:
                course_stream._slots.release()


class ControlledModel(StubMirrorModel):
    name = "offline-controlled"
    def __init__(self):
        self.calls = 0
        self.entered = Event()
        self.release = Event()
        self.lock = Lock()
        self.fail_once = False

    def generate(self, context):
        with self.lock:
            self.calls += 1
        self.entered.set()
        assert self.release.wait(10), "测试未释放模型"
        if self.fail_once:
            self.fail_once = False
            raise RuntimeError("PRIVATE_PROVIDER_BODY")
        return super().generate(context)


@pytest.mark.parametrize("mixed", [False, True])
def test_concurrent_replays_generate_and_persist_once(isolated, workers, mixed):
    _, cookies = register(isolated, "parallel_owner")
    aid = attempt(isolated)
    body = {"request_id": "parallel-request-1", "message": "合成问题", "mode": "chat"}
    model = ControlledModel()
    app.state.pipeline.model = model
    def post(index):
        with account_client(cookies) as client:
            suffix = "" if mixed and index == 3 else "/stream"
            return client.post(f"/api/v2/attempts/{aid}/messages{suffix}", json=body)
    with ThreadPoolExecutor(max_workers=4) as callers:
        pending = [callers.submit(post, i) for i in range(4)]
        try:
            assert model.entered.wait(5)
            if not mixed:
                assert workers.four_submitted.wait(5)
        finally:
            model.release.set()
        results = [f.result(timeout=15) for f in pending]
    assert all(r.status_code == 200 for r in results)
    terminals = [("done", r.json()) if mixed and i == 3 else frames(r)[-1]
                 for i, r in enumerate(results)]
    assert all(t == terminals[0] and t[0] == "done" for t in terminals)
    assert model.calls == 1
    with app.state.session_factory() as db:
        events = db.scalars(select(MirrorEvent)).all()
        assert len(events) == 1
        evidence = db.scalars(select(LearningEvidenceRow)).all()
        assert len(evidence) == len(terminals[0][1]["evidence"])
    for f in workers:
        f.result(timeout=5)
    all_slots_free()


def test_database_failure_rolls_back_and_allows_retry(isolated, workers):
    register(isolated, "db_retry_owner")
    aid = attempt(isolated)
    body = {"request_id": "db-failure-retry", "message": "合成问题", "mode": "chat"}
    model = ControlledModel()
    model.release.set()
    app.state.pipeline.model = model
    failed_once = False
    def fail_evidence_flush(db, flush_context, instances):
        nonlocal failed_once
        # Event has already been flushed, but its evidence transaction has not
        # committed. A failure here must roll back both sides.
        if not failed_once and any(isinstance(row, LearningEvidenceRow) for row in db.new):
            failed_once = True
            raise RuntimeError("synthetic database failure")
    session_class = app.state.session_factory.class_
    event.listen(session_class, "before_flush", fail_evidence_flush)
    url = f"/api/v2/attempts/{aid}/messages/stream"
    try:
        failed = isolated.post(url, json=body)
    finally:
        event.remove(session_class, "before_flush", fail_evidence_flush)
    assert failed_once
    assert frames(failed)[-1][0] == "error"
    with app.state.session_factory() as db:
        assert db.scalars(select(MirrorEvent)).all() == []
        assert db.scalars(select(LearningEvidenceRow)).all() == []
    replay = isolated.post(url, json=body)
    assert frames(replay)[-1][0] == "done"
    assert model.calls == 2
    assert len(isolated.get(f"/api/v2/attempts/{aid}").json()["events"]) == 1
    for f in workers:
        f.result(timeout=5)
    all_slots_free()


def test_failure_retry_and_cross_user_replay(isolated, workers):
    _, owner_cookies = register(isolated, "retry_owner")
    aid = attempt(isolated)
    body = {"request_id": "failure-retry-1", "message": "合成问题", "mode": "chat"}
    model = ControlledModel()
    model.release.set()
    model.fail_once = True
    app.state.pipeline.model = model
    url = f"/api/v2/attempts/{aid}/messages/stream"
    failed = isolated.post(url, json=body)
    assert frames(failed)[-1][0] == "error"
    assert "PRIVATE_PROVIDER_BODY" not in failed.text
    with app.state.session_factory() as db:
        assert db.scalars(select(MirrorEvent)).all() == []
        assert db.scalars(select(LearningEvidenceRow)).all() == []
    retried = isolated.post(url, json=body)
    assert frames(retried)[-1][0] == "done"
    assert frames(isolated.post(url, json=body))[-1] == frames(retried)[-1]
    assert model.calls == 2
    changed = isolated.post(url, json={**body, "message": "不同问题"})
    assert frames(changed)[-1][1]["status"] == 409
    register(isolated, "other_student")
    assert isolated.post(url, json=body).status_code == 404
    other_aid = attempt(isolated)
    conflict = isolated.post(f"/api/v2/attempts/{other_aid}/messages/stream", json=body)
    assert frames(conflict)[-1][1]["status"] == 409
    assert "answer" not in frames(conflict)[-1][1]
    with TestClient(app, headers=HEADERS) as anonymous:
        assert anonymous.post(url, json=body).status_code == 401
    assert model.calls == 2
    with account_client(owner_cookies) as owner:
        assert len(owner.get(f"/api/v2/attempts/{aid}").json()["events"]) == 1
    for f in workers:
        f.result(timeout=5)
    all_slots_free()


def test_capacity_and_worker_errors_release_slots(workers):
    release = Event()
    def work(progress):
        assert release.wait(5)
        raise RuntimeError("offline failure")
    try:
        for _ in range(4):
            course_stream.response_stream(work)
        with pytest.raises(HTTPException) as exc:
            course_stream.response_stream(work)
        assert exc.value.status_code == 429
    finally:
        release.set()
    for f in workers:
        f.result(timeout=5)
    all_slots_free()


def test_executor_rejection_releases_slot(workers, monkeypatch):
    def reject(fn):
        raise RuntimeError("executor closed")
    monkeypatch.setattr(course_stream._workers, "submit", reject)
    with pytest.raises(HTTPException) as exc:
        course_stream.response_stream(lambda progress: {})
    assert exc.value.status_code == 503
    all_slots_free()


def test_asgi_disconnect_finishes_persistence_and_replays(isolated, workers):
    _, cookies = register(isolated, "disconnect_owner")
    aid = attempt(isolated)
    body = {"request_id": "disconnect-request", "message": "合成问题", "mode": "chat"}
    model = ControlledModel()
    app.state.pipeline.model = model
    path = f"/api/v2/attempts/{aid}/messages/stream"

    async def disconnect_after_progress():
        sent_body = False
        progress_sent = asyncio.Event()
        async def receive():
            nonlocal sent_body
            if not sent_body:
                sent_body = True
                return {"type": "http.request", "body": json.dumps(body).encode(),
                        "more_body": False}
            await progress_sent.wait()
            return {"type": "http.disconnect"}
        async def send(message):
            if message["type"] == "http.response.body" and b"event: progress" in message.get("body", b""):
                progress_sent.set()
        scope = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.0"},
                 "http_version": "1.1", "method": "POST", "scheme": "http",
                 "path": path, "raw_path": path.encode(), "query_string": b"",
                 "root_path": "", "server": ("testserver", 80), "client": ("testclient", 123),
                 "headers": [(b"host", b"testserver"), (b"content-type", b"application/json"),
                             (b"x-mirror-request", b"1"),
                             (b"cookie", "; ".join(f"{k}={v}" for k, v in cookies.items()).encode())]}
        await asyncio.wait_for(app(scope, receive, send), timeout=5)
        assert progress_sent.is_set()

    try:
        asyncio.run(disconnect_after_progress())
        assert model.entered.wait(5)
    finally:
        model.release.set()
    for f in workers:
        f.result(timeout=5)
    replay = isolated.post(path, json=body)
    assert frames(replay)[-1][0] == "done"
    assert model.calls == 1
    assert len(isolated.get(f"/api/v2/attempts/{aid}").json()["events"]) == 1
    for f in workers:
        f.result(timeout=5)
    all_slots_free()


@pytest.mark.parametrize("failure", [False, True])
def test_slow_or_absent_consumer_cannot_block_worker(workers, monkeypatch, failure):
    # Bound the old blocking put so the regression fails without hanging pytest.
    class DeadlineQueue(Queue):
        def put(self, item, block=True, timeout=None):
            return super().put(item, block=block, timeout=0.2 if block else None)
    monkeypatch.setattr(course_stream, "Queue", DeadlineQueue)
    persisted = Event()
    def work(progress):
        for i in range(64):
            progress(str(i))
        if failure:
            raise RuntimeError("offline failure")
        persisted.set()
        return {"saved": True}
    response = course_stream.response_stream(work)
    workers[0].result(timeout=5)
    assert persisted.is_set() is not failure
    async def consume():
        return [frame async for frame in response.body_iterator]
    output = asyncio.run(consume())
    assert len(output) <= 17  # queued + bounded queue
    assert output[-1].startswith("event: error" if failure else "event: done")
    all_slots_free()
