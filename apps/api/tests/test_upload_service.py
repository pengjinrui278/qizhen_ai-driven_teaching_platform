"""学生错题上传服务测试。"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from mirror_api.config import REPO_ROOT
from mirror_api.coursepack import import_coursepack
from mirror_api.db import init_db, make_engine, make_session_factory
from mirror_api.domain import StudentUploadRequest
from mirror_api.llm import StubMirrorModel
from mirror_api.mirror_service import MirrorPipeline
from mirror_api.models import Problem, ProblemHint
from mirror_api.retrieval import course_pack_ids, find_similar_problems, knowledge_for_problem
from mirror_api.seed import seed_profiles
from mirror_api.upload_service import handle_upload

SAMPLE_PACK = REPO_ROOT / "coursepacks" / "mathematical_analysis" / "chen-jixiu-3e"
COURSE = "mathematical_analysis"
PROFILE = "chen-jixiu-3e"
EXISTING_PROBLEM_ID = "demo_limit_uniqueness_01"


def make_upload_request(request_id: str, text: str) -> StudentUploadRequest:
    return StudentUploadRequest(
        request_id=request_id,
        course_id=COURSE,
        course_profile_id=PROFILE,
        problem={"text": text},
    )


@pytest.fixture()
def session(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'upload-test.sqlite'}")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as db:
        seed_profiles(db)
        import_coursepack(db, SAMPLE_PACK)
        yield db


@pytest.fixture()
def app_client(tmp_path):
    from mirror_api.main import app, configure

    configure(app, f"sqlite:///{tmp_path / 'upload-api.sqlite'}")
    factory = app.state.session_factory
    with factory() as db:
        seed_profiles(db)
        import_coursepack(db, SAMPLE_PACK)
    return TestClient(app)


def test_upload_new_problem_creates_record(session):
    pipeline = MirrorPipeline(StubMirrorModel())
    text = "证明：若数列 {a_n} 收敛，则其极限唯一。"
    response = handle_upload(session, make_upload_request("up-1", text), StubMirrorModel(), pipeline)

    assert response.recognized is False
    assert response.quality_status in ("approved", "pending")
    assert response.problem_id.startswith("upload-")
    assert response.max_hint_level == 5
    assert response.first_hint.hint_level == 1
    assert len(response.similar_problems) <= 3

    problem = session.get(Problem, (response.coursepack_id, response.problem_id))
    assert problem is not None
    assert problem.provenance == "student_submitted"
    assert problem.review["status"].startswith("student_")

    hints = session.execute(
        select(ProblemHint).where(
            ProblemHint.coursepack_id == problem.coursepack_id,
            ProblemHint.problem_id == problem.problem_id,
        )
    ).scalars().all()
    assert len(hints) == 5


def test_upload_recognizes_existing_problem(session):
    pipeline = MirrorPipeline(StubMirrorModel())
    # 找到一道已有题，取其 statement 作为上传文本
    existing = session.get(Problem, ("analysis-chen-jixiu-3e", EXISTING_PROBLEM_ID))
    response = handle_upload(
        session,
        make_upload_request("up-2", existing.statement),
        StubMirrorModel(),
        pipeline,
    )
    assert response.recognized is True
    assert response.problem_id == EXISTING_PROBLEM_ID


def test_upload_first_hint_does_not_leak_answer(session):
    pipeline = MirrorPipeline(StubMirrorModel())
    text = "用定义证明 lim_{n→∞} (1/n) = 0。"
    response = handle_upload(session, make_upload_request("up-3", text), StubMirrorModel(), pipeline)
    checks = {c.name: c for c in response.first_hint.harness.checks}
    assert checks["dynamic_hint_safety"].status == "passed"
    assert "答案" not in response.first_hint.answer


def test_find_similar_problems_excludes_self(session):
    pipeline = MirrorPipeline(StubMirrorModel())
    text = "证明：若数列 {a_n} 收敛，则其极限唯一。"
    response = handle_upload(session, make_upload_request("up-4", text), StubMirrorModel(), pipeline)
    problem = session.get(Problem, (response.coursepack_id, response.problem_id))

    pack_ids = course_pack_ids(session, COURSE, PROFILE)
    knowledge = knowledge_for_problem(session, problem)
    similar = find_similar_problems(
        session,
        pack_ids,
        problem.statement,
        [node.knowledge_id for node in knowledge],
        exclude_ref=(problem.coursepack_id, problem.problem_id),
    )
    assert all((p.coursepack_id, p.problem_id) != (problem.coursepack_id, problem.problem_id) for p in similar)


def test_review_approve_makes_problem_public(session, app_client):
    # 通过 API 上传新题
    text = "证明：若数列 {a_n} 收敛，则其极限唯一。"
    upload = app_client.post(
        "/api/v1/student-uploads",
        json=make_upload_request("up-5", text).model_dump(mode="json"),
    )
    assert upload.status_code == 200
    body = upload.json()
    coursepack_id = body["coursepack_id"]
    problem_id = body["problem_id"]

    # 审批前不在 /api/v1/problems 中
    problems_before = app_client.get(
        "/api/v1/problems",
        params={"course_id": COURSE, "course_profile_id": PROFILE},
    )
    assert problem_id not in {item["problem_id"] for item in problems_before.json()}

    # 人工审批
    review = app_client.post(
        f"/api/v1/student-uploads/{coursepack_id}/{problem_id}/review",
        json={"decision": "approved", "note": "符合课程范围"},
    )
    assert review.status_code == 200
    assert review.json()["review"]["status"] == "student_approved"
    assert review.json()["rights"]["allowed_for_runtime"] is True

    # 审批后出现在 /api/v1/problems 中
    problems_after = app_client.get(
        "/api/v1/problems",
        params={"course_id": COURSE, "course_profile_id": PROFILE},
    )
    assert problem_id in {item["problem_id"] for item in problems_after.json()}


def test_review_reject_blocks_problem(session, app_client):
    text = "完全没有数学内容的一段文本"
    upload = app_client.post(
        "/api/v1/student-uploads",
        json=make_upload_request("up-6", text).model_dump(mode="json"),
    )
    assert upload.status_code == 200
    body = upload.json()
    coursepack_id = body["coursepack_id"]
    problem_id = body["problem_id"]

    review = app_client.post(
        f"/api/v1/student-uploads/{coursepack_id}/{problem_id}/review",
        json={"decision": "rejected", "note": "质量不达标"},
    )
    assert review.status_code == 200
    assert review.json()["rights"]["allowed_for_runtime"] is False


def test_pending_upload_can_still_receive_hints(app_client):
    text = "证明：若数列 {a_n} 收敛，则其极限唯一。"
    upload = app_client.post(
        "/api/v1/student-uploads",
        json=make_upload_request("up-7", text).model_dump(mode="json"),
    )
    assert upload.status_code == 200
    body = upload.json()
    problem_id = body["problem_id"]

    next_hint = app_client.post(
        "/api/v1/course-mirror/requests",
        json={
            "request_id": "up-7-next",
            "course_id": COURSE,
            "course_profile_id": PROFILE,
            "problem": {"problem_id": problem_id},
            "interaction_mode": "next_hint",
        },
    )
    assert next_hint.status_code == 200
    assert next_hint.json()["hint_level"] == 2

    full_solution = app_client.post(
        "/api/v1/course-mirror/requests",
        json={
            "request_id": "up-7-full",
            "course_id": COURSE,
            "course_profile_id": PROFILE,
            "problem": {"problem_id": problem_id},
            "interaction_mode": "full_solution",
        },
    )
    assert full_solution.status_code == 200
    assert "尚未完成审校" in full_solution.json()["answer"]
