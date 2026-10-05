"""Safe platform diagnostics classify only observable errors, never invent finish_reason."""
import hashlib
import logging

import pytest
import test_platform_stream_safety as safety
from fastapi.testclient import TestClient
from test_platform import HEADERS, attempt, register

from mirror_api.main import app
from mirror_api.model_transport import ModelError

isolated = safety.isolated
workers = safety.workers


@pytest.mark.parametrize("stream", [False, True])
@pytest.mark.parametrize("status,category", [(429, "rate_limited"), (504, "timeout"),
                                            (502, "upstream_incomplete_or_invalid"),
                                            (503, "upstream_unavailable")])
def test_error_diagnostics_are_bounded_and_do_not_capture_private_text(
        isolated, workers, caplog, stream, status, category):
    register(isolated, "diagnostic_student")
    aid = attempt(isolated)
    calls = []
    class Failing:
        name = "synthetic-model"
        def generate(self, context):
            calls.append(1)
            raise ModelError(status, "合成安全错误")
    app.state.pipeline.model = Failing()
    raw_id = "PRIVATE_REQUEST\ninjected_log"
    body = {"request_id": raw_id, "mode": "chat", "message": "PRIVATE_PROMPT"}
    with caplog.at_level(logging.INFO, logger="mirror_api.course_requests"):
        response = isolated.post(f"/api/v2/attempts/{aid}/messages" + ("/stream" if stream else ""), json=body)
    if stream:
        assert safety.frames(response)[-1][1]["status"] == status
    else:
        assert response.status_code == status
    records = [r for r in caplog.records if r.name == "mirror_api.course_requests"]
    assert len(records) == 1 and len(calls) == 1
    record = records[0]
    assert record.outcome == category and record.response_status == status
    assert record.processing_elapsed_ms >= 0
    assert record.request_key == hashlib.sha256(raw_id.encode()).hexdigest()
    assert len(record.trace_id) == 32
    assert record.exc_info is None
    assert not any(value in str(record.__dict__) for value in (raw_id, "PRIVATE_PROMPT", aid))
    assert not hasattr(record, "finish_reason") and not hasattr(record, "usage")
    assert isolated.get(f"/api/v2/attempts/{aid}").json()["events"] == []


def test_success_and_replay_share_hash_but_not_trace_id(isolated, caplog):
    register(isolated, "diagnostic_replay")
    aid = attempt(isolated)
    body = {"request_id": "diagnostic-replay-001", "message": "合成请求", "mode": "chat"}
    with caplog.at_level(logging.INFO, logger="mirror_api.course_requests"):
        for _ in range(2):
            assert isolated.post(f"/api/v2/attempts/{aid}/messages", json=body).status_code == 200
    records = [r for r in caplog.records if r.name == "mirror_api.course_requests"]
    assert len(records) == 2
    assert records[0].request_key == records[1].request_key
    assert records[0].trace_id != records[1].trace_id
    assert all(r.outcome == "completed" for r in records)


@pytest.mark.parametrize("stream", [False, True])
def test_unexpected_exception_body_is_not_logged(isolated, workers, caplog, stream):
    _, cookies = register(isolated, "diagnostic_unknown")
    aid = attempt(isolated)
    class Broken:
        name = "fixture"
        def generate(self, context):
            raise RuntimeError("PRIVATE_PROVIDER_KEY_AND_REASONING")
    app.state.pipeline.model = Broken()
    with (
        TestClient(app, headers=HEADERS, cookies=cookies, raise_server_exceptions=False) as client,
        caplog.at_level(logging.INFO, logger="mirror_api.course_requests"),
    ):
        response = client.post(f"/api/v2/attempts/{aid}/messages" + ("/stream" if stream else ""),
                               json={"request_id": "diagnostic-unexpected", "message": "合成请求"})
    record = next(r for r in caplog.records if r.name == "mirror_api.course_requests")
    assert record.outcome == "unexpected_failure"
    assert record.response_status == (503 if stream else 500)
    if stream:
        assert safety.frames(response)[-1][1]["status"] == 503
    else:
        assert response.status_code == 500
    assert record.exc_info is None
    assert "PRIVATE_PROVIDER" not in str(record.__dict__) + response.text
