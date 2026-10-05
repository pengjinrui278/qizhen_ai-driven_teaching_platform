"""学习证据生命周期回归：独立临时 SQLite、合成题目、stub，不导入教材。"""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from test_platform import COURSE, HEADERS, account_client, attempt, message, register

from mirror_api import memory
from mirror_api.main import _auth_attempts, app, configure
from mirror_api.models import LearningEvidenceRow
from mirror_api.platform_models import Hypothesis, Observation
from mirror_api.seed import seed_profiles


@pytest.fixture()
def learning_client(tmp_path, monkeypatch):
    monkeypatch.setenv("MIRROR_LLM_PROVIDER", "stub")
    monkeypatch.setenv("MIRROR_ALLOW_STUB_LEARNING", "true")
    monkeypatch.setenv("MIRROR_STAFF_INVITE_CODE", "test-team-invite")
    configure(app, "sqlite:///" + str(tmp_path / "learning.sqlite"))
    _auth_attempts.clear()
    with app.state.session_factory() as db:
        seed_profiles(db)
    with TestClient(app, headers=HEADERS) as client:
        yield client
    app.state.engine.dispose()


def report(client, key="learning-feedback-01", outcome="still_stuck"):
    aid = attempt(client, "合成练习：说明一个命题成立需要哪些条件。")
    result = message(client, aid, "event-" + key, text="请提供一个思考方向")
    assert result.status_code == 200, result.text
    body = {"request_id": key, "outcome": outcome, "theme": "conditions", "note": "合成学生反馈"}
    response = client.post(f"/api/v2/attempts/{aid}/feedback", json=body)
    assert response.status_code == 200, response.text
    oid = "feedback:" + key
    return aid, body, oid, hashlib.sha256(oid.encode()).hexdigest()


def correct(client, oid, disputed=True):
    return client.patch(
        f"/api/v2/observations/{oid}",
        json={"disputed": disputed, "note": "撤回这条合成反馈" if disputed else "恢复原反馈"},
    )


def evidence(eid):
    with app.state.session_factory() as db:
        row = db.get(LearningEvidenceRow, eid)
        return (
            None
            if row is None
            else {
                "observation": row.observation,
                "stage": row.reasoning_stage,
                "sources": row.source_event_ids,
                "request_id": row.request_id,
            }
        )


def test_correction_removes_old_support_from_diagnosis_and_context(learning_client):
    user, _ = register(learning_client, "learning_correction")
    _, _, first, _ = report(learning_client, "learning-feedback-first")
    _, _, second, _ = report(learning_client, "learning-feedback-second")
    before = learning_client.get("/api/v2/memory").json()
    assert before["hypotheses"][0]["status"] == "worth_attention"
    for oid in (first, second):
        result = correct(learning_client, oid)
        assert result.status_code == 200
        assert all(
            oid not in h["supporting"] + h["contradicting"] for h in result.json()["hypotheses"]
        )
        with app.state.session_factory() as db:
            context = memory.context_for(db, user["id"], COURSE)
            assert context.relevant_hypotheses == []
    assert result.json()["hypotheses"] == []
    with app.state.session_factory() as db:
        assert memory.context_for(db, user["id"], COURSE).relevant_knowledge_states == []


def test_correction_removes_opposing_evidence_from_diagnosis(learning_client):
    register(learning_client, "learning_opposing")
    report(learning_client, "learning-support-01")
    report(learning_client, "learning-support-02")
    _, _, oid, _ = report(learning_client, "learning-opposing-01", "independent_success")
    assert learning_client.get("/api/v2/memory").json()["hypotheses"][0]["status"] == "improving"
    result = correct(learning_client, oid)
    assert result.status_code == 200
    hypothesis = result.json()["hypotheses"][0]
    assert hypothesis["status"] == "worth_attention"
    assert hypothesis["contradicting"] == []


@pytest.mark.parametrize("outcome", ["still_stuck", "independent_success", "solved"])
def test_correction_retracts_linked_learning_evidence(learning_client, outcome):
    register(learning_client, "learning_linked")
    _, _, oid, eid = report(learning_client, outcome=outcome)
    assert oid in evidence(eid)["sources"]
    assert correct(learning_client, oid).status_code == 200
    # CR-learning-001 提议：撤回派生行；Observation 留作可更正的来源记录。
    assert evidence(eid) is None


def test_exact_retry_is_idempotent_even_after_correction(learning_client):
    register(learning_client, "learning_retry")
    aid, body, oid, eid = report(learning_client)
    original = evidence(eid)
    for _ in range(2):
        assert (
            learning_client.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 200
        )
    assert evidence(eid) == original
    assert correct(learning_client, oid).status_code == 200
    assert correct(learning_client, oid).status_code == 200
    assert learning_client.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 200
    with app.state.session_factory() as db:
        assert db.get(Observation, oid).disputed
        assert len(db.scalars(select(Observation)).all()) == 1
        assert db.scalars(select(Hypothesis)).all() == []


def test_retry_does_not_resurrect_retracted_evidence(learning_client):
    register(learning_client, "learning_replay")
    aid, body, oid, eid = report(learning_client)
    assert correct(learning_client, oid).status_code == 200
    # 模拟 CR-learning-001 撤回派生行后，平台重试路径仍不能重新插入它。
    with app.state.session_factory() as db:
        row = db.get(LearningEvidenceRow, eid)
        if row is not None:
            db.delete(row)
        db.commit()
    assert learning_client.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 200
    assert evidence(eid) is None


@pytest.mark.parametrize("changed", [{"theme": "construction"}, {"note": "不同的反馈内容"}])
def test_changed_payload_is_not_an_idempotent_retry(learning_client, changed):
    register(learning_client, "learning_conflict")
    aid, body, _, eid = report(learning_client)
    original = evidence(eid)
    response = learning_client.post(f"/api/v2/attempts/{aid}/feedback", json={**body, **changed})
    assert response.status_code == 409
    assert evidence(eid) == original


@pytest.mark.parametrize("role", ["student", "teacher"])
def test_other_account_cannot_correct_read_or_reuse_feedback(learning_client, role):
    _, cookies = register(learning_client, "learning_owner")
    with account_client(cookies) as owner:
        aid, body, oid, eid = report(owner)
        original = evidence(eid)
        register(learning_client, "learning_other", role=role)
        assert correct(learning_client, oid).status_code == 404
        assert learning_client.get(f"/api/v2/attempts/{aid}").status_code == 404
        assert learning_client.get("/api/v2/memory").json() == {
            "observations": [],
            "hypotheses": [],
        }
        other_aid = attempt(learning_client)
        assert (
            learning_client.post(f"/api/v2/attempts/{other_aid}/feedback", json=body).status_code
            == 409
        )
        assert evidence(eid) == original
        assert not owner.get("/api/v2/memory").json()["observations"][0]["disputed"]


def test_restore_observation_rebuilds_diagnosis(learning_client):
    register(learning_client, "learning_restore")
    _, _, oid, _ = report(learning_client)
    assert correct(learning_client, oid).json()["hypotheses"] == []
    result = correct(learning_client, oid, disputed=False)
    assert result.status_code == 200
    assert result.json()["hypotheses"][0]["supporting"] == [oid]


def test_account_deletion_removes_own_evidence_but_preserves_other_user(learning_client):
    user, cookies = register(learning_client, "learning_delete")
    with account_client(cookies) as owner:
        _, _, oid, eid = report(owner, "learning-delete-01")
        register(learning_client, "learning_survivor")
        _, _, other_oid, other_eid = report(learning_client, "learning-survive-01")
        original = evidence(other_eid)
        result = owner.post(
            "/api/v2/me/delete", json={"password": "test-only-password", "confirmed": True}
        )
        assert result.status_code == 200, result.text
        assert evidence(eid) is None
        assert evidence(other_eid) == original
        with app.state.session_factory() as db:
            assert db.get(Observation, oid) is None
            assert db.get(Observation, other_oid) is not None
            assert memory.memory_view(db, user["id"]) == {"observations": [], "hypotheses": []}


def test_same_feedback_id_cannot_move_to_another_attempt(learning_client):
    register(learning_client, "learning_attempt_conflict")
    _, body, _, eid = report(learning_client)
    original = evidence(eid)
    second = attempt(learning_client)
    assert learning_client.post(f"/api/v2/attempts/{second}/feedback", json=body).status_code == 409
    assert evidence(eid) == original


def test_deleting_observation_and_rebuilding_removes_old_diagnosis(learning_client):
    user, _ = register(learning_client, "learning_delete_observation")
    _, _, oid, _ = report(learning_client)
    with app.state.session_factory() as db:
        memory.add_observation(
            db,
            "other-synthetic-user",
            COURSE,
            "other-attempt",
            "still_stuck",
            "conditions",
            "另一用户的合成反馈",
            "support",
        )
        other_before = memory.memory_view(db, "other-synthetic-user")
        db.delete(db.get(Observation, oid))
        db.flush()
        memory.rebuild(db, user["id"], COURSE)
        db.commit()
        assert memory.memory_view(db, user["id"]) == {"observations": [], "hypotheses": []}
        assert memory.context_for(db, user["id"], COURSE).relevant_knowledge_states == []
        assert memory.memory_view(db, "other-synthetic-user") == other_before


def test_restore_recreates_retracted_derived_evidence(learning_client):
    register(learning_client, "learning_restore_evidence")
    aid, _, oid, eid = report(learning_client)
    original = evidence(eid)
    assert correct(learning_client, oid).status_code == 200
    with app.state.session_factory() as db:
        # 模拟平台完成撤回派生行后的状态。
        row = db.get(LearningEvidenceRow, eid)
        if row is not None:
            db.delete(row)
        db.commit()
    assert (
        message(learning_client, aid, "learning-before-restore", text="另一个思考方向").status_code
        == 200
    )
    for _ in range(2):
        assert correct(learning_client, oid, disputed=False).status_code == 200
        assert evidence(eid) == original


@pytest.mark.xfail(
    strict=True, raises=AssertionError, reason="CR-learning-003：缺少单条观察删除接口"
)
def test_delete_one_observation_through_api(learning_client):
    register(learning_client, "learning_delete_single")
    _, _, oid, eid = report(learning_client)
    # 提议接口，尚未批准；此用例不能代表已实现的契约。
    result = learning_client.delete(f"/api/v2/observations/{oid}")
    assert result.status_code == 200
    assert evidence(eid) is None
    assert learning_client.get("/api/v2/memory").json() == {"observations": [], "hypotheses": []}


@pytest.mark.parametrize("changed", [False, True], ids=["same-body", "conflicting-body"])
def test_feedback_without_prior_event_never_links_a_later_event(learning_client, changed):
    register(learning_client, "learning_delayed")
    aid = attempt(learning_client)
    body = {
        "request_id": "learning-delayed-01",
        "outcome": "still_stuck",
        "theme": "conditions",
        "note": "原始反馈",
    }
    # 尚无 MirrorEvent：当前路由只写 Observation。
    assert learning_client.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 200
    assert (
        message(learning_client, aid, "learning-delayed-event", text="给一个思考方向").status_code
        == 200
    )
    response = learning_client.post(
        f"/api/v2/attempts/{aid}/feedback",
        json={**body, "theme": "construction", "note": "改变后的反馈"} if changed else body,
    )
    # R2 已批准、R4 延续：不能用后发生的轮次冒充反馈当时的出处。
    assert response.status_code == (409 if changed else 200)
    oid = "feedback:" + body["request_id"]
    with app.state.session_factory() as db:
        observation = db.get(Observation, oid)
        derived = db.get(LearningEvidenceRow, hashlib.sha256(oid.encode()).hexdigest())
        assert observation.theme == "conditions"
        assert observation.text.endswith("原始反馈")
        assert derived is None
