"""AI literacy isolation with synthetic accounts and a mocked model transport."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from mirror_api.main import _auth_attempts, app, configure
from mirror_api.models import AssignmentWorkspace, LearningEvidenceRow, MirrorEvent
from mirror_api.platform_models import Account, Attempt, Hypothesis, Observation
from mirror_api.seed import seed_profiles


@pytest.fixture()
def ai_client(tmp_path, monkeypatch):
    monkeypatch.setenv("MIRROR_LLM_PROVIDER", "stub")
    monkeypatch.setenv("MIRROR_LLM_API_KEY", "offline-fixture")
    monkeypatch.setenv("MIRROR_LLM_BASE_URL", "https://example.invalid")
    monkeypatch.setenv("MIRROR_LLM_MODEL", "fixture")
    configure(app, f"sqlite:///{tmp_path / 'agent-ai.sqlite'}")
    with app.state.session_factory() as db:
        seed_profiles(db)
    _auth_attempts.clear()
    with TestClient(app, headers={"X-Mirror-Request": "1"}) as client:
        result = client.post("/api/v2/auth/register", json={
            "username": "agent_ai_fixture", "password": "offline-test-password",
            "nickname": "合成账号", "role": "student",
        })
        assert result.status_code == 200, result.text
        yield client
    app.state.engine.dispose()


def test_direct_answer_without_course_assessment_or_workspace(ai_client, monkeypatch):
    monkeypatch.setenv("MIRROR_LLM_PROVIDER", "openai_compatible")
    calls = []

    def complete(base, key, payload, timeout):
        calls.append(payload)
        return "知识表示是把知识组织为计算机可处理的形式；例如用规则表达条件与结论。"

    monkeypatch.setattr("mirror_api.ai_learning.complete", complete)
    sid = ai_client.post("/api/v2/ai/sessions").json()["id"]
    response = ai_client.post(f"/api/v2/ai/sessions/{sid}/messages", json={
        "request_id": "agent-ai-direct", "text": "我完全不会，请直接解释知识表示并给一个例子。",
    })
    assert response.status_code == 200, response.text
    assert response.json()["citations"] == []
    assert "知识表示是" in response.json()["answer"]
    system = calls[0]["messages"][0]["content"]
    assert "直接清楚地回答，可给出完整解答" in system
    assert "不使用提示阶梯或强制反问" in system
    assert "无证据时明确是一般知识解释" in system
    assert "本轮提示等级" not in system
    with app.state.session_factory() as db:
        for model in (MirrorEvent, LearningEvidenceRow, Attempt, Observation, Hypothesis, AssignmentWorkspace):
            assert db.query(model).count() == 0


def test_new_ai_course_attempt_is_rejected(ai_client):
    response = ai_client.post("/api/v2/attempts", json={"course_id": "ai_literacy", "text": "知识表示"})
    assert response.status_code == 400


@pytest.mark.parametrize("stream", [False, True])
def test_legacy_ai_attempt_cannot_create_course_evidence(ai_client, stream):
    # Simulate a previously persisted attempt, without copying any real database.
    with app.state.session_factory() as db:
        uid = db.scalar(select(Account.id).where(Account.username == "agent_ai_fixture"))
        db.add(Attempt(id="legacy-ai", account_id=uid, course_id="ai_literacy",
                       profile_id="competition-default", problem={"text": "知识表示"}))
        db.commit()
    suffix = "/stream" if stream else ""
    response = ai_client.post("/api/v2/attempts/legacy-ai/messages" + suffix, json={
        "request_id": "agent-ai-legacy", "mode": "first_hint", "message": "请解释知识表示。",
    })
    with app.state.session_factory() as db:
        counts = (db.query(MirrorEvent).count(), db.query(LearningEvidenceRow).count())
        assert counts == (0, 0)
    if stream and response.status_code == 200:
        assert "event: error" in response.text and '"status": 410' in response.text
    else:
        assert response.status_code == 410
