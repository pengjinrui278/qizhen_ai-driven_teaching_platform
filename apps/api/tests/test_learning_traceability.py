"""R4：在独立 SQLite 验证会话与证据两条链；不代表浏览器或 3011 联调。"""

import hashlib
from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from test_learning_corrections import correct, evidence, report
from test_learning_corrections import (
    learning_client as learning_client,  # noqa: PLC0414 -- pytest fixture export
)
from test_platform import COURSE, account_client, attempt, message, register

from mirror_api import memory, sandboxes
from mirror_api.main import app, configure
from mirror_api.models import LearningEvidenceRow, MirrorEvent
from mirror_api.platform_models import Attempt, Audit


def detail(client, aid):
    response = client.get(f"/api/v2/attempts/{aid}")
    assert response.status_code == 200, response.text
    return response.json()


def test_new_attempt_and_api_reassembly_preserve_history_and_source_chain(learning_client):
    user, cookies = register(learning_client, "r4_persist")
    aid, body, oid, eid = report(learning_client, "r4-persistent-feedback")
    original = detail(learning_client, aid)
    original_evidence = evidence(eid)
    other = attempt(learning_client, "另一道合成练习，不覆盖原题。")
    assert other != aid
    # 新 session/cookie 客户端模拟重新打开页面；再重装服务层验证不是进程缓存。
    database_url = str(app.state.engine.url)
    app.state.engine.dispose()
    configure(app, database_url)
    with account_client(cookies) as restored:
        listed = restored.get("/api/v2/attempts")
        assert listed.status_code == 200
        assert {aid, other} <= {row["id"] for row in listed.json()}
        assert detail(restored, aid) == original
        replay = restored.post(f"/api/v2/attempts/{aid}/feedback", json=body)
        assert replay.status_code == 200
        assert evidence(eid) == original_evidence
    with app.state.session_factory() as db:
        derived = db.get(LearningEvidenceRow, eid)
        event = db.get(MirrorEvent, derived.request_id)
        stored = db.get(Attempt, aid)
        assert event.participant_code == stored.account_id == user["id"]
        assert event.request_payload["attempt_id"] == aid
        assert stored.problem == original["problem"]
        assert all(
            event.request_payload["problem"][key] == value for key, value in stored.problem.items()
        )
        assert derived.source_event_ids == [event.request_id, oid]
        assert event.request_id == original["events"][0]["request_id"]
        assert derived.strength == "weak"


def test_later_feedback_stays_on_its_turn_when_more_messages_arrive(learning_client):
    register(learning_client, "r4_later_feedback")
    aid, _, _, first_eid = report(learning_client, "r4-first-feedback")
    first = evidence(first_eid)
    rid = "r4-second-message"
    assert message(learning_client, aid, rid, text="说明另一个关键关系").status_code == 200
    body = {"request_id": "r4-second-feedback", "outcome": "solved", "theme": "conditions"}
    oid = "feedback:" + body["request_id"]
    eid = hashlib.sha256(oid.encode()).hexdigest()
    assert learning_client.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 200
    saved = evidence(eid)
    assert saved["request_id"] == rid and saved["sources"] == [rid, oid]
    assert (
        message(learning_client, aid, "r4-third-message", text="说明如何检查条件").status_code
        == 200
    )
    assert learning_client.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 200
    assert evidence(eid) == saved
    assert evidence(first_eid) == first
    assert [e["request_id"] for e in detail(learning_client, aid)["events"]] == [
        first["request_id"],
        rid,
        "r4-third-message",
    ]


def test_message_retry_keeps_one_event_and_one_set_of_weak_evidence(learning_client):
    user, _ = register(learning_client, "r4_message_retry")
    aid = attempt(learning_client)
    rid = "r4-retry-message"
    first = message(learning_client, aid, rid, text="给出一个思考方向")
    assert first.status_code == 200
    with app.state.session_factory() as db:
        ids = set(
            db.scalars(
                select(LearningEvidenceRow.evidence_id).where(LearningEvidenceRow.request_id == rid)
            )
        )
    for _ in range(2):
        retried = message(learning_client, aid, rid, text="给出一个思考方向")
        assert retried.status_code == 200 and retried.json() == first.json()
    assert len(detail(learning_client, aid)["events"]) == 1
    with app.state.session_factory() as db:
        rows = db.scalars(
            select(LearningEvidenceRow).where(LearningEvidenceRow.request_id == rid)
        ).all()
        assert ids and {r.evidence_id for r in rows} == ids
        assert all(r.strength == "weak" and r.source_event_ids == [rid] for r in rows)
        assert memory.memory_view(db, user["id"]) == {"observations": [], "hypotheses": []}
        assert memory.context_for(db, user["id"], COURSE).relevant_hypotheses == []


def test_missing_from_capped_list_does_not_mean_evidence_was_deleted(learning_client):
    user, _ = register(learning_client, "r4_capped_list")
    aid, _, _, eid = report(learning_client, "r4-old-list-feedback")
    original = detail(learning_client, aid)
    saved = evidence(eid)
    with app.state.session_factory() as db:
        old = db.get(Attempt, aid)
        start = datetime.now(UTC) - timedelta(days=1)
        old.created_at = start
        for i in range(100):
            db.add(
                Attempt(
                    id=f"r4-list-{i}",
                    account_id=user["id"],
                    course_id=old.course_id,
                    profile_id=old.profile_id,
                    problem={"text": "合成练习"},
                    created_at=start + timedelta(minutes=i + 1),
                )
            )
        db.commit()
    listing = learning_client.get("/api/v2/attempts").json()
    # 现有列表只取 100 条；这是边界审查，不要求后续分页实现继续隐藏旧记录。
    if len(listing) == 100:
        assert aid not in {row["id"] for row in listing}
    assert detail(learning_client, aid) == original
    assert evidence(eid) == saved


@pytest.mark.parametrize("role", ["student", "teacher"])
def test_persisted_private_history_and_evidence_are_not_shared(learning_client, role):
    _, cookies = register(learning_client, "r4_private_owner")
    aid, body, oid, eid = report(learning_client, "r4-private-feedback")
    before = evidence(eid)
    register(learning_client, "r4_private_other", role=role)
    assert learning_client.get(f"/api/v2/attempts/{aid}").status_code == 404
    assert learning_client.get("/api/v2/attempts").json() == []
    assert learning_client.get("/api/v2/memory").json() == {"observations": [], "hypotheses": []}
    assert correct(learning_client, oid).status_code == 404
    assert learning_client.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 404
    assert evidence(eid) == before
    with account_client(cookies) as owner:
        assert detail(owner, aid)["events"]


def test_correction_failure_rolls_back_observation_hypothesis_evidence_and_audit(
    learning_client, monkeypatch
):
    user, _ = register(learning_client, "r4_correction_rollback")
    _, _, oid, eid = report(learning_client, "r4-rollback-feedback")
    before = learning_client.get("/api/v2/memory").json()
    saved = evidence(eid)
    with app.state.session_factory() as db:
        audit_ids = set(db.scalars(select(Audit.id)))

    def fail_after_audit(*args, **kwargs):
        original_audit(*args, **kwargs)
        raise RuntimeError("r4 injected transaction failure")

    original_audit = sandboxes.audit
    with monkeypatch.context() as patch:
        patch.setattr(sandboxes, "audit", fail_after_audit)
        with pytest.raises(RuntimeError, match="r4 injected"):
            correct(learning_client, oid)
    assert learning_client.get("/api/v2/memory").json() == before
    assert evidence(eid) == saved
    with app.state.session_factory() as db:
        assert set(db.scalars(select(Audit.id))) == audit_ids
        assert memory.memory_view(db, user["id"])["observations"][0]["disputed"] is False


def test_correcting_one_course_does_not_change_another_courses_sources(learning_client):
    user, _ = register(learning_client, "r4_course_isolation")
    _, _, oid, _ = report(learning_client, "r4-course-first")
    course = "linear_algebra_analytic_geometry"
    response = learning_client.post(
        "/api/v2/attempts", json={"course_id": course, "text": "合成练习：检查向量线性关系。"}
    )
    assert response.status_code == 200
    aid = response.json()["id"]
    assert (
        message(learning_client, aid, "r4-other-course-message", text="提供一个方向").status_code
        == 200
    )
    body = {
        "request_id": "r4-other-course-feedback",
        "outcome": "still_stuck",
        "theme": "conditions",
    }
    assert learning_client.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 200
    eid = hashlib.sha256(("feedback:" + body["request_id"]).encode()).hexdigest()
    saved = evidence(eid)
    before = detail(learning_client, aid)
    with app.state.session_factory() as db:
        original = [
            h for h in memory.memory_view(db, user["id"])["hypotheses"] if h["course_id"] == course
        ]
    assert correct(learning_client, oid).status_code == 200
    assert evidence(eid) == saved
    assert detail(learning_client, aid) == before
    with app.state.session_factory() as db:
        assert [
            h for h in memory.memory_view(db, user["id"])["hypotheses"] if h["course_id"] == course
        ] == original


@pytest.mark.parametrize("raw_level", [3, 7])
def test_unversioned_historical_level_and_evidence_are_not_rewritten(learning_client, raw_level):
    user, _ = register(learning_client, "r4_legacy_level")
    aid = attempt(learning_client)
    rid = "r4-legacy-hint"
    assert message(learning_client, aid, rid, text="提供方向").status_code == 200
    with app.state.session_factory() as db:
        # 构造已有历史记录，不用当前生成策略猜测旧量表，也不新增版本字段。
        event = db.get(MirrorEvent, rid)
        response = deepcopy(event.response_json)
        response["hint_level"] = raw_level
        draft = next(e for e in response["evidence"] if e["event_type"] == "hint_requested")
        draft["reasoning_stage"] = f"hint_{raw_level}"
        draft["observation"] = "历史原始提示记录；量表版本未标注，不代表能力。"
        event.hint_level = raw_level
        event.response_json = response
        row = db.scalars(
            select(LearningEvidenceRow).where(
                LearningEvidenceRow.request_id == rid,
                LearningEvidenceRow.event_type == "hint_requested",
            )
        ).one()
        row.reasoning_stage = draft["reasoning_stage"]
        row.observation = draft["observation"]
        eid = row.evidence_id
        db.commit()
    before = evidence(eid)
    assert detail(learning_client, aid)["events"][0]["response"]["hint_level"] == raw_level
    retry = message(learning_client, aid, rid, text="提供方向")
    assert retry.status_code == 200 and retry.json()["hint_level"] == raw_level
    assert evidence(eid) == before
    with app.state.session_factory() as db:
        assert db.get(MirrorEvent, rid).response_json == response
        assert memory.context_for(db, user["id"], COURSE).relevant_hypotheses == []
        assert memory.memory_view(db, user["id"])["hypotheses"] == []
