"""R4 durable history checks against a synthetic file database, never the main DB."""
import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import test_platform_stream_safety as safety
from fastapi.testclient import TestClient
from test_platform import HEADERS, account_client, attempt, message, register

from mirror_api.main import app, configure
from mirror_api.models import MirrorEvent
from mirror_api.platform_models import Attempt

isolated = safety.isolated
workers = safety.workers


def test_new_conversation_refresh_and_backend_reconstruction_preserve_history(isolated):
    _, cookies = register(isolated, "history_owner")
    old = attempt(isolated, "合成旧会话")
    result = message(isolated, old, "history-original-001")
    assert result.status_code == 200
    before = isolated.get(f"/api/v2/attempts/{old}").json()
    new = attempt(isolated, "合成新会话")
    assert isolated.get(f"/api/v2/attempts/{new}").json()["events"] == []
    database_url = str(app.state.engine.url)
    # Reconstruct engine, session factory and pipeline against the same isolated file.
    app.state.engine.dispose()
    configure(app, database_url)
    with account_client(cookies) as reopened:
        assert {r["id"] for r in reopened.get("/api/v2/attempts").json()} == {old, new}
        assert reopened.get(f"/api/v2/attempts/{old}").json() == before
        assert message(reopened, old, "history-original-001").json() == result.json()
        assert len(reopened.get(f"/api/v2/attempts/{old}").json()["events"]) == 1


def test_inflight_and_failed_reply_do_not_create_empty_saved_messages(isolated, workers):
    _, cookies = register(isolated, "history_pending")
    aid = attempt(isolated)
    assert message(isolated, aid, "history-completed-001").status_code == 200
    before = isolated.get(f"/api/v2/attempts/{aid}").json()
    model = safety.ControlledModel()
    model.fail_once = True
    app.state.pipeline.model = model
    body = {"request_id": "history-failed-001", "message": "合成未完成消息", "mode": "chat"}
    def post():
        with account_client(cookies) as sender:
            return sender.post(f"/api/v2/attempts/{aid}/messages/stream", json=body)
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(post)
        try:
            assert model.entered.wait(5)
            assert isolated.get(f"/api/v2/attempts/{aid}").json() == before
            assert isolated.get("/api/v2/attempts").json()[0]["id"] == aid
        finally:
            model.release.set()
        failed = pending.result(timeout=10)
    assert safety.frames(failed)[-1][0] == "error"
    assert not any(kind == "done" for kind, _ in safety.frames(failed))
    assert isolated.get(f"/api/v2/attempts/{aid}").json() == before
    retried = post()
    assert safety.frames(retried)[-1][0] == "done"
    assert model.calls == 2
    assert len(isolated.get(f"/api/v2/attempts/{aid}").json()["events"]) == 2


def test_logout_old_cookie_and_account_switch_never_expose_history(isolated):
    _, cookies = register(isolated, "history_logout")
    aid = attempt(isolated)
    assert message(isolated, aid, "logout-private-message").status_code == 200
    assert isolated.post("/api/v2/auth/logout").status_code == 200
    with account_client(cookies) as revoked:
        assert revoked.get("/api/v2/attempts").status_code == 401
        assert revoked.get(f"/api/v2/attempts/{aid}").status_code == 401
    register(isolated, "history_switched")
    assert isolated.get("/api/v2/attempts").json() == []
    assert isolated.get(f"/api/v2/attempts/{aid}").status_code == 404
    assert isolated.get("/api/v2/me/export").json()["interactions"] == []
    with TestClient(app, headers=HEADERS) as anonymous:
        assert anonymous.get(f"/api/v2/attempts/{aid}").status_code == 401


def test_done_frame_observed_only_after_independent_connection_sees_commit(isolated, workers):
    _, cookies = register(isolated, "history_commit")
    aid = attempt(isolated)
    body = {"request_id": "commit-before-done", "message": "合成提交顺序", "mode": "chat"}
    path = f"/api/v2/attempts/{aid}/messages/stream"
    observations = []
    async def run():
        delivered = False
        never_disconnect = asyncio.Event()
        async def receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": json.dumps(body).encode(), "more_body": False}
            await never_disconnect.wait()
            return {"type": "http.disconnect"}
        async def send(frame):
            content = frame.get("body", b"")
            if b"event: done" in content:
                with app.state.session_factory() as separate:
                    saved = separate.get(MirrorEvent, body["request_id"])
                    assert saved is not None
                    assert saved.request_payload["attempt_id"] == aid
                    observations.append(saved.response_json)
        scope = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.0"},
                 "http_version": "1.1", "method": "POST", "scheme": "http", "path": path,
                 "raw_path": path.encode(), "query_string": b"", "root_path": "",
                 "server": ("testserver", 80), "client": ("testclient", 123),
                 "headers": [(b"host", b"testserver"), (b"content-type", b"application/json"),
                             (b"x-mirror-request", b"1"),
                             (b"cookie", "; ".join(f"{k}={v}" for k, v in cookies.items()).encode())]}
        await asyncio.wait_for(app(scope, receive, send), timeout=10)
    asyncio.run(run())
    assert len(observations) == 1
    assert isolated.get(f"/api/v2/attempts/{aid}").json()["events"][0]["response"] == observations[0]


def test_legacy_seven_level_history_is_not_rewritten_on_read(isolated):
    register(isolated, "history_legacy")
    aid = attempt(isolated)
    assert message(isolated, aid, "legacy-seven-event").status_code == 200
    with app.state.session_factory() as db:
        event = db.get(MirrorEvent, "legacy-seven-event")
        event.hint_level = 7
        event.response_json = {**event.response_json, "hint_level": 7, "hints_exhausted": True}
        original = event.response_json
        db.commit()
    assert isolated.get(f"/api/v2/attempts/{aid}").json()["events"][0]["response"] == original
    assert message(isolated, aid, "legacy-seven-event").json() == original
    with app.state.session_factory() as db:
        assert db.get(MirrorEvent, "legacy-seven-event").hint_level == 7


def test_list_cap_does_not_delete_older_sessions_but_needs_pagination_contract(isolated):
    user, _ = register(isolated, "history_over_limit")
    base = datetime.now(UTC) - timedelta(hours=1)
    with app.state.session_factory() as db:
        for i in range(101):
            db.add(Attempt(id=f"synthetic-attempt-{i:03}", account_id=user["id"],
                           course_id="mathematical_analysis", profile_id="chen-jixiu-3e",
                           problem={"text": "合成列表容量验证"}, created_at=base + timedelta(seconds=i)))
        db.commit()
    listed = isolated.get("/api/v2/attempts").json()
    assert len(listed) == 100
    assert listed[0]["id"] == "synthetic-attempt-100"
    assert not any(row["id"] == "synthetic-attempt-000" for row in listed)
    assert isolated.get("/api/v2/attempts/synthetic-attempt-000").status_code == 200
