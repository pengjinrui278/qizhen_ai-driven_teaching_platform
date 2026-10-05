"""Legacy course writes are gone; owners can still read/export their history."""
import pytest
import test_platform_stream_safety as safety_fixtures
from test_platform import register

from mirror_api.main import app
from mirror_api.models import AssignmentWorkspace, LearningEvidenceRow, MirrorEvent
from mirror_api.platform_models import Attempt, Hypothesis, Observation

isolated = safety_fixtures.isolated


@pytest.mark.parametrize("suffix", ["messages", "messages/stream", "feedback"])
def test_legacy_ai_write_is_gone_after_ownership_check(isolated, monkeypatch, suffix):
    user, _ = register(isolated, "legacy_owner")
    with app.state.session_factory() as db:
        db.add(Attempt(id="old-ai", account_id=user["id"], course_id="ai_literacy",
                       profile_id="competition-default", problem={"text": "合成历史概念问题"}))
        db.commit()
    def never(*args, **kwargs):
        raise AssertionError("legacy write must not invoke course pipeline")
    monkeypatch.setattr(app.state.pipeline, "handle", never)
    body = {"request_id": "legacy-write-001", "message": "不会条件", "mode": "chat"}
    if suffix == "feedback":
        body = {"request_id": "legacy-write-001", "outcome": "still_stuck", "theme": "conditions"}
    url = f"/api/v2/attempts/old-ai/{suffix}"
    response = isolated.post(url, json=body)
    assert response.status_code == 410 and "detail" in response.json()
    assert isolated.get("/api/v2/attempts/old-ai").status_code == 200
    exported = isolated.get("/api/v2/me/export").json()
    assert any(a["id"] == "old-ai" for a in exported["attempts"])
    with app.state.session_factory() as db:
        for model in (MirrorEvent, LearningEvidenceRow, Observation, Hypothesis, AssignmentWorkspace):
            assert db.query(model).count() == 0
    register(isolated, "legacy_other")
    assert isolated.post(url, json=body).status_code == 404


def test_independent_ai_session_still_works_without_course_evidence(isolated, monkeypatch):
    register(isolated, "independent_ai")
    monkeypatch.setenv("MIRROR_LLM_PROVIDER", "openai_compatible")
    monkeypatch.setenv("MIRROR_LLM_API_KEY", "synthetic-test-key")
    monkeypatch.setenv("MIRROR_LLM_BASE_URL", "https://example.invalid")
    monkeypatch.setenv("MIRROR_LLM_MODEL", "synthetic")
    monkeypatch.setattr("mirror_api.ai_learning.complete", lambda *a, **k: "合成直接解释。")
    sid = isolated.post("/api/v2/ai/sessions").json()["id"]
    result = isolated.post(f"/api/v2/ai/sessions/{sid}/messages", json={
        "request_id": "independent-ai-001", "text": "直接解释知识表示"})
    assert result.status_code == 200 and result.json()["answer"] == "合成直接解释。"
    with app.state.session_factory() as db:
        for model in (MirrorEvent, LearningEvidenceRow, Observation, Hypothesis, Attempt):
            assert db.query(model).count() == 0
