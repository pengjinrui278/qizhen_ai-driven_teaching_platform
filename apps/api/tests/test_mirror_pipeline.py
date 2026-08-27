"""通用 Course Mirror 请求管线测试：提示阶梯、幂等、授权门控、HTTP 端点。"""

import pytest
from fastapi.testclient import TestClient

from mirror_api.config import REPO_ROOT
from mirror_api.coursepack import import_coursepack
from mirror_api.domain import CourseMirrorRequest, InteractionMode
from mirror_api.llm import StubMirrorModel
from mirror_api.mirror_service import MirrorError, MirrorPipeline
from mirror_api.models import LearningEvidenceRow, MirrorEvent, Problem
from mirror_api.seed import seed_profiles

SAMPLE_PACK = REPO_ROOT / "coursepacks" / "mathematical_analysis" / "chen-jixiu-3e"
COURSE = "mathematical_analysis"
PROFILE = "chen-jixiu-3e"
PROBLEM_ID = "demo_limit_uniqueness_01"


def make_request(
    request_id: str, mode: str, problem_id: str | None = None, text: str | None = None
) -> CourseMirrorRequest:
    return CourseMirrorRequest(
        request_id=request_id,
        course_id=COURSE,
        course_profile_id=PROFILE,
        problem={"problem_id": problem_id, "text": text} if (problem_id or text) else {},
        interaction_mode=InteractionMode(mode),
    )


# ---------------------------------------------------------------- 管线行为


def test_hint_ladder_climbs_level_by_level(session):
    pipeline = MirrorPipeline(StubMirrorModel())

    first = pipeline.handle(session, make_request("req-1", "first_hint", problem_id=PROBLEM_ID))
    assert first.hint_level == 1
    assert "第 1 级" in first.answer
    assert "尝试用同一个足够靠后的数列项连接" in first.answer
    assert {c.knowledge_id for c in first.citations} == {
        "concept_sequence_limit",
        "theorem_limit_uniqueness",
    }
    checks = {c.name: c for c in first.harness.checks}
    assert checks["answer_leakage"].status == "passed"
    assert checks["citation_presence"].status == "passed"
    # 仍有已登记未实现的学科 Harness，因此总体不能判为 passed
    assert first.harness.status == "not_run"
    assert session.get(MirrorEvent, "req-1") is not None

    second = pipeline.handle(session, make_request("req-2", "next_hint", problem_id=PROBLEM_ID))
    assert second.hint_level == 2
    assert "怎样让这个数列项同时足够接近" in second.answer

    # 提示阶梯用完后不再升级
    third = pipeline.handle(session, make_request("req-3", "next_hint", problem_id=PROBLEM_ID))
    assert third.hint_level == 2
    assert "提示阶梯已经用完" in third.answer


def test_no_hint_leakage_on_any_problem(session):
    """语料质量红线：每道题的首级提示都不得泄露解法关键步骤。"""
    pipeline = MirrorPipeline(StubMirrorModel())
    problems = session.query(Problem).all()
    assert len(problems) >= 10
    for index, problem in enumerate(problems):
        response = pipeline.handle(
            session, make_request(f"leak-{index}", "first_hint", problem_id=problem.problem_id)
        )
        checks = {c.name: c for c in response.harness.checks}
        assert checks["answer_leakage"].status == "passed", problem.problem_id


def test_unknown_problem_falls_back_without_citations(session):
    pipeline = MirrorPipeline(StubMirrorModel())
    response = pipeline.handle(
        session, make_request("req-unknown", "first_hint", text="完全没有见过的一道题")
    )
    assert response.answer_type == "fallback_guidance"
    assert response.citations == []
    assert response.hint_level is None
    citation_check = next(c for c in response.harness.checks if c.name == "citation_presence")
    assert citation_check.status == "uncertain"


def test_request_id_is_idempotent(session):
    pipeline = MirrorPipeline(StubMirrorModel())
    first = pipeline.handle(session, make_request("dup-1", "first_hint", problem_id=PROBLEM_ID))
    replay = pipeline.handle(session, make_request("dup-1", "first_hint", problem_id=PROBLEM_ID))
    assert replay.answer == first.answer
    assert session.query(MirrorEvent).filter_by(request_id="dup-1").count() == 1


def test_missing_course_raises_404(session):
    pipeline = MirrorPipeline(StubMirrorModel())
    bad = make_request("req-x", "first_hint", text="任意")
    bad.course_id = "not_a_course"
    with pytest.raises(MirrorError) as excinfo:
        pipeline.handle(session, bad)
    assert excinfo.value.status_code == 404


def test_evidence_rows_are_persisted(session):
    pipeline = MirrorPipeline(StubMirrorModel())
    pipeline.handle(session, make_request("req-ev", "first_hint", problem_id=PROBLEM_ID))
    rows = session.query(LearningEvidenceRow).filter_by(request_id="req-ev").all()
    assert {row.event_type for row in rows} == {"help_request_received", "problem_engaged"}
    assert all(row.strength == "weak" for row in rows)


# ---------------------------------------------------------------- 授权门控


def test_runtime_right_blocks_problem_use(rights_session):
    pipeline = MirrorPipeline(StubMirrorModel())
    response = pipeline.handle(
        rights_session, make_request("req-locked", "first_hint", problem_id="locked_problem")
    )
    assert any("授权" in item for item in response.uncertainty)
    assert response.answer_type == "fallback_guidance"


def test_rag_right_blocks_citation(rights_session):
    pipeline = MirrorPipeline(StubMirrorModel())
    response = pipeline.handle(
        rights_session, make_request("req-rag", "concept_explanation", text="未开放检索的节点")
    )
    assert response.citations == []


# ---------------------------------------------------------------- HTTP 端点


def test_http_endpoints(tmp_path):
    from mirror_api.main import app, configure

    configure(app, f"sqlite:///{tmp_path / 'api.sqlite'}")
    factory = app.state.session_factory
    with factory() as db:
        seed_profiles(db)
        import_coursepack(db, SAMPLE_PACK)

    client = TestClient(app)
    payload = make_request("http-1", "first_hint", problem_id=PROBLEM_ID).model_dump(mode="json")
    response = client.post("/api/v1/course-mirror/requests", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["request_id"] == "http-1"
    assert body["hint_level"] == 1

    missing = client.post(
        "/api/v1/course-mirror/requests",
        json=make_request("http-2", "first_hint", text="任意").model_dump(mode="json")
        | {"course_id": "not_a_course"},
    )
    assert missing.status_code == 404

    packs = client.get("/api/v1/coursepacks")
    assert packs.status_code == 200
    assert [item["coursepack_id"] for item in packs.json()] == ["analysis-chen-jixiu-3e"]
