"""Synthetic provider responses only: stop semantics, safe diagnostics, no paid retries."""
import copy
import logging

import httpx
import pytest

from mirror_api.domain import CourseMirrorRequest
from mirror_api.llm import MirrorContext, OpenAICompatibleModel
from mirror_api.mirror_service import MirrorPipeline
from mirror_api.model_transport import ModelError, complete
from mirror_api.models import LearningEvidenceRow, MirrorEvent


@pytest.mark.parametrize("reason", ["length", "content_filter", "tool_calls", "function_call", None, "secret-provider-text"])
def test_incomplete_answers_not_retried_or_saved(session, monkeypatch, caplog, reason):
    calls = []

    def post(url, **kwargs):
        calls.append(copy.deepcopy(kwargs["json"]))
        return httpx.Response(200, json={
            "choices": [{"finish_reason": reason, "message": {"content": "PRIVATE_PARTIAL_ANSWER"}}],
            "usage": {"completion_tokens": 8192, "completion_tokens_details": {"reasoning_tokens": 8100}},
            "private": "PRIVATE_PROVIDER_METADATA",
        })

    monkeypatch.setattr(httpx, "post", post)
    model = OpenAICompatibleModel("https://api.deepseek.com", "PRIVATE_SECRET", "fixture", max_tokens=8192)
    request = CourseMirrorRequest(
        request_id="incomplete-request", course_id="mathematical_analysis",
        course_profile_id="chen-jixiu-3e", problem={"text": "PRIVATE_STUDENT_QUESTION"},
        interaction_mode="full_solution", participant_code="synthetic", attempt_id="synthetic",
    )
    with caplog.at_level(logging.WARNING, logger="mirror_api.model_transport"), pytest.raises(ModelError) as caught:
        MirrorPipeline(model).handle(session, request)
    assert caught.value.status_code == 502
    assert len(calls) == 1 and calls[0]["max_tokens"] == 8192
    assert session.query(MirrorEvent).count() == 0
    assert session.query(LearningEvidenceRow).count() == 0
    record = caplog.records[-1]
    assert record.finish_reason == ("unknown" if reason == "secret-provider-text" else "missing" if reason is None else reason)
    assert record.completion_tokens == 8192 and record.reasoning_tokens == 8100
    assert record.token_limit == 8192
    assert record.reasoning_effort == "high"
    for secret in ("PRIVATE_", "secret-provider-text"):
        assert secret not in str(record.__dict__)
        assert secret not in str(caught.value)


@pytest.mark.parametrize("base", ["https://api.deepseek.com", "https://api.deepseek.com/v1"])
def test_reasoning_configuration_does_not_change_budget_or_retry(base, monkeypatch):
    payloads = []

    def post(url, **kwargs):
        payloads.append(kwargs["json"])
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": "合成完整回答"}}]})

    monkeypatch.setattr(httpx, "post", post)
    model = OpenAICompatibleModel(base, "fixture", "fixture", max_tokens=8192, reasoning_effort="high")
    context = MirrorContext(course_name="数分", mirror_name="助手", course_id="mathematical_analysis", interaction_mode="full_solution")
    assert model.generate(context) == "合成完整回答"
    assert len(payloads) == 1
    assert payloads[0]["thinking"] == {"type": "enabled"}
    assert payloads[0]["max_tokens"] == 8192
    assert payloads[0]["reasoning_effort"] == "high"


@pytest.mark.parametrize("value", [
    {"choices": []}, {"choices": [{"finish_reason": "stop", "message": {"content": " "}}]},
    {"choices": [{"finish_reason": "stop", "message": {"content": ["not text"]}}]},
])
def test_invalid_success_payload_never_returns_answer(monkeypatch, value):
    calls = []

    def post(*args, **kwargs):
        calls.append(1)
        return httpx.Response(200, json=value)

    monkeypatch.setattr(httpx, "post", post)
    with pytest.raises(ModelError):
        complete("https://example.invalid", "fixture", {}, 1)
    assert calls == [1]


def test_same_request_can_succeed_after_truncation_without_duplicate_event(session, monkeypatch):
    calls = []

    def post(*args, **kwargs):
        calls.append(1)
        return httpx.Response(200, json={"choices": [{
            "finish_reason": "length" if len(calls) == 1 else "stop",
            "message": {"content": "合成流程：检查条件，再列关系，最后回代验证。"},
        }]})

    monkeypatch.setattr(httpx, "post", post)
    request = CourseMirrorRequest(request_id="retry-on-user-action", course_id="mathematical_analysis",
        course_profile_id="chen-jixiu-3e", problem={"text": "合成题"}, interaction_mode="full_solution")
    pipeline = MirrorPipeline(OpenAICompatibleModel("https://example.invalid", "fixture", "fixture"))
    with pytest.raises(ModelError):
        pipeline.handle(session, request)
    assert calls == [1] and session.query(MirrorEvent).count() == 0
    response = pipeline.handle(session, request)
    assert response.hint_level == 3
    assert pipeline.handle(session, request).answer == response.answer
    assert calls == [1, 1] and session.query(MirrorEvent).count() == 1
