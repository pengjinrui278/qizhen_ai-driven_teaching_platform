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


@pytest.mark.parametrize("path,method", [
    ("/api/v1/student-uploads", "post"),
    ("/api/v1/student-uploads/analysis-chen-jixiu-3e/private/review", "post"),
    ("/api/v1/student-uploads/pending", "get"),
])
def test_legacy_private_upload_management_is_retired(app_client, path, method):
    # 私人提问与共享贡献已分离；旧匿名审批不能再改变题库授权。
    response = getattr(app_client, method)(path)
    assert response.status_code == 410
    assert "Sandbox" in response.json()["detail"]
    # 完整v2贡献/私人解答/审校发布闭环由test_platform覆盖。
