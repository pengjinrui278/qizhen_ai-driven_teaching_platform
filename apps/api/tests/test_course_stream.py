import json
import httpx
import pytest
from test_platform import pilot, register, attempt, app
from mirror_api.model_transport import ModelError, complete


def frames(response):
    return [(part.splitlines()[0].removeprefix("event: "),
             json.loads(part.split("data: ", 1)[1]))
            for part in response.text.split("\n\n") if part.startswith("event:")]


def test_stream_is_authenticated_and_replayable(pilot):
    register(pilot, "stream_student")
    aid = attempt(pilot)
    body = {"request_id": "stream-test-once", "mode": "first_hint", "message": "我不懂条件"}
    response = pilot.post(f"/api/v2/attempts/{aid}/messages/stream", json=body)
    assert response.status_code == 200
    assert response.headers["x-accel-buffering"] == "no"
    events = frames(response)
    assert [data["stage"] for kind, data in events if kind == "progress"] == [
        "queued", "retrieving", "generating", "checking"]
    assert events[-1][0] == "done"
    assert all("answer" not in data for kind, data in events if kind != "done")
    replay = pilot.post(f"/api/v2/attempts/{aid}/messages/stream", json=body)
    assert frames(replay)[-1] == events[-1]
    assert len(pilot.get(f"/api/v2/attempts/{aid}").json()["events"]) == 1
    register(pilot, "stream_other")
    assert pilot.post(f"/api/v2/attempts/{aid}/messages/stream", json=body).status_code == 404


def test_stream_error_never_contains_provider_details(pilot):
    register(pilot, "stream_failure")
    aid = attempt(pilot)
    class Broken:
        name = "test"
        def generate(self, context):
            raise RuntimeError("PRIVATE_PROVIDER_BODY")
    app.state.pipeline.model = Broken()
    response = pilot.post(f"/api/v2/attempts/{aid}/messages/stream", json={
        "request_id": "stream-failure-1", "mode": "chat", "message": "问题"})
    assert frames(response)[-1][0] == "error"
    assert "PRIVATE_PROVIDER_BODY" not in response.text
    assert not pilot.get(f"/api/v2/attempts/{aid}").json()["events"]


@pytest.mark.parametrize("error", [httpx.ConnectError, httpx.ConnectTimeout])
def test_connection_failure_retries_only_once(monkeypatch, error):
    calls = []
    def post(*args, **kwargs):
        calls.append(1)
        raise error("PRIVATE_PROVIDER_BODY")
    monkeypatch.setattr(httpx, "post", post)
    with pytest.raises(ModelError) as exc:
        complete("https://example.invalid", "fixture", {}, 1)
    assert len(calls) == 2
    assert "PRIVATE_PROVIDER_BODY" not in str(exc.value)


def test_photo_related_extracts_concepts_from_end(pilot, monkeypatch):
    register(pilot, "photo_concepts")
    seen = []
    monkeypatch.setattr("mirror_api.platform_api.retrieval.search_textbook_chunks",
                        lambda db, course, query, limit: seen.append(query) or [])
    result = pilot.post("/api/v2/textbooks/related", json={"course_id": "mathematical_analysis",
        "text": "题目背景和条件" * 100 + "讨论一致收敛"})
    assert result.status_code == 200 and seen == ["一致收敛"]
