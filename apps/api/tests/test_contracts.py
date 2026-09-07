from fastapi.testclient import TestClient

from mirror_api.main import app
from mirror_api.registry import load_course_profiles

client = TestClient(app)


def test_five_course_mirrors_are_registered() -> None:
    profiles = load_course_profiles()
    assert len(profiles) == 6
    assert profiles["mathematical_analysis"].stage == "flagship"
    assert profiles["ai_literacy"].display_name == "AI 教学"


def test_preview_uses_unified_contract() -> None:
    response = client.post(
        "/api/v1/course-mirror/preview",
        json={
            "request_id": "event-demo-1",
            "course_id": "mathematical_analysis",
            "course_profile_id": "chen-jixiu-3e",
            "problem": {"text": "自编测试问题"},
            "interaction_mode": "first_hint"
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["hint_level"] == 1
    assert payload["evidence"][0]["strength"] == "weak"
    assert payload["harness"]["status"] == "not_run"


def test_every_profile_has_course_specific_harness() -> None:
    for profile in load_course_profiles().values():
        assert profile.harnesses
        assert "learning_evidence" in profile.capabilities

