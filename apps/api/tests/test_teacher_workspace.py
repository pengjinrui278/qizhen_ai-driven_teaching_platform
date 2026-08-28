"""教师/TA 端（Assignment Workspace）垂直切片测试。

覆盖：学生请求挂载工作区（匿名参与码落库）、工作区生命周期、聚合总览、
AI 候选现象生成、TA 三选一校准、教师最终决定、周报隐私红线。

隐私红线（全部测试共同遵守）：教师/TA 端可见的任何响应都不得包含
``answer`` / ``response_json`` / ``request_payload`` 类键，也不得出现任何
``participant_code`` 的字面值——只允许 distinct 计数。
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

from mirror_api.config import REPO_ROOT
from mirror_api.coursepack import import_coursepack
from mirror_api.domain import CourseMirrorRequest, InteractionMode, WorkspaceCreateRequest
from mirror_api.llm import StubMirrorModel
from mirror_api.mirror_service import MirrorError, MirrorPipeline
from mirror_api.models import AssignmentWorkspace, MirrorEvent
from mirror_api.seed import seed_profiles
from mirror_api.workspace_service import (
    close_workspace,
    create_workspace,
    join_workspace,
    list_workspaces,
)

SAMPLE_PACK = REPO_ROOT / "coursepacks" / "mathematical_analysis" / "chen-jixiu-3e"
COURSE = "mathematical_analysis"
OTHER_COURSE = "linear_algebra_analytic_geometry"
PROFILE = "chen-jixiu-3e"
PROBLEM_ID = "demo_limit_uniqueness_01"


def make_workspace(
    session,
    workspace_id: str = "ws-test-1",
    course_id: str = COURSE,
    status: str = "open",
    join_code: str = "TEST1234",
) -> AssignmentWorkspace:
    row = AssignmentWorkspace(
        workspace_id=workspace_id,
        course_id=course_id,
        profile_id=PROFILE,
        title="第一章作业",
        class_label="数分甲班",
        join_code=join_code,
        status=status,
    )
    session.add(row)
    session.commit()
    return row


def make_request(
    request_id: str,
    mode: str,
    problem_id: str | None = None,
    participant_code: str | None = None,
    workspace_id: str | None = None,
) -> CourseMirrorRequest:
    return CourseMirrorRequest(
        request_id=request_id,
        course_id=COURSE,
        course_profile_id=PROFILE,
        problem={"problem_id": problem_id} if problem_id else {},
        interaction_mode=InteractionMode(mode),
        participant_code=participant_code,
        assignment_workspace_id=workspace_id,
    )


# ---------------------------------------------------- 学生请求挂载工作区


def test_workspace_request_persists_participant_code_and_workspace(session):
    make_workspace(session)
    pipeline = MirrorPipeline(StubMirrorModel())
    pipeline.handle(
        session,
        make_request(
            "ws-req-1",
            "first_hint",
            problem_id=PROBLEM_ID,
            participant_code="stu-alpha",
            workspace_id="ws-test-1",
        ),
    )
    event = session.get(MirrorEvent, "ws-req-1")
    assert event.participant_code == "stu-alpha"
    assert event.assignment_workspace_id == "ws-test-1"


def test_workspace_validation_matrix(session):
    make_workspace(session)
    make_workspace(session, workspace_id="ws-closed", status="closed", join_code="CLOSED01")
    make_workspace(session, workspace_id="ws-other-course", course_id=OTHER_COURSE, join_code="OTHR0001")
    pipeline = MirrorPipeline(StubMirrorModel())

    def expect_40x(request_id: str, workspace_id: str, participant_code: str | None):
        with pytest.raises(MirrorError) as excinfo:
            pipeline.handle(
                session,
                make_request(
                    request_id,
                    "first_hint",
                    problem_id=PROBLEM_ID,
                    participant_code=participant_code,
                    workspace_id=workspace_id,
                ),
            )
        return excinfo.value.status_code

    assert expect_40x("v-missing", "no-such-workspace", "stu-alpha") == 404
    assert expect_40x("v-closed", "ws-closed", "stu-alpha") == 404
    assert expect_40x("v-course", "ws-other-course", "stu-alpha") == 400
    assert expect_40x("v-nocode", "ws-test-1", None) == 400


def test_replay_succeeds_after_workspace_closed(session):
    """幂等语义优先：已落库 request_id 的回放无条件成功，即使工作区已关闭。"""
    make_workspace(session)
    pipeline = MirrorPipeline(StubMirrorModel())
    request = make_request(
        "ws-replay",
        "first_hint",
        problem_id=PROBLEM_ID,
        participant_code="stu-alpha",
        workspace_id="ws-test-1",
    )
    first = pipeline.handle(session, request)

    session.execute(
        update(AssignmentWorkspace)
        .where(AssignmentWorkspace.workspace_id == "ws-test-1")
        .values(status="closed")
    )
    session.commit()

    replay = pipeline.handle(session, request)
    assert replay.answer == first.answer
    assert session.query(MirrorEvent).filter_by(request_id="ws-replay").count() == 1


# ---------------------------------------------------- 工作区生命周期


def test_workspace_lifecycle(session):
    workspace = create_workspace(
        session,
        WorkspaceCreateRequest(
            course_id=COURSE, course_profile_id=PROFILE, title="第一章作业", class_label="数分甲班"
        ),
    )
    assert workspace.status == "open"
    assert len(workspace.join_code) == 8

    # 加入码大小写不敏感
    joined = join_workspace(session, workspace.join_code.lower())
    assert joined.workspace_id == workspace.workspace_id

    listed = list_workspaces(session, COURSE)
    assert [item["workspace_id"] for item in listed] == [workspace.workspace_id]
    assert listed[0]["participants"] == 0

    with pytest.raises(MirrorError) as excinfo:
        join_workspace(session, "NOPE0000")
    assert excinfo.value.status_code == 404

    close_workspace(session, workspace.workspace_id)
    with pytest.raises(MirrorError) as excinfo:
        join_workspace(session, workspace.join_code)
    assert excinfo.value.status_code == 409
    with pytest.raises(MirrorError) as excinfo:
        close_workspace(session, workspace.workspace_id)
    assert excinfo.value.status_code == 409


def test_create_workspace_validates_course_and_profile(session):
    with pytest.raises(MirrorError) as excinfo:
        create_workspace(
            session,
            WorkspaceCreateRequest(course_id="no-such-course", course_profile_id=PROFILE, title="作业"),
        )
    assert excinfo.value.status_code == 404
    with pytest.raises(MirrorError) as excinfo:
        create_workspace(
            session,
            WorkspaceCreateRequest(
                course_id=COURSE, course_profile_id="no-such-profile", title="作业"
            ),
        )
    assert excinfo.value.status_code == 404


# ---------------------------------------------------- 聚合总览 + 隐私红线


def test_overview_endpoint_numbers_and_privacy(tmp_path):
    from mirror_api.main import app, configure

    configure(app, f"sqlite:///{tmp_path / 'teacher.sqlite'}")
    with app.state.session_factory() as db:
        seed_profiles(db)
        import_coursepack(db, SAMPLE_PACK)

    client = TestClient(app)
    created = client.post(
        "/api/v1/workspaces",
        json={
            "course_id": COURSE,
            "course_profile_id": PROFILE,
            "title": "第一章作业",
            "class_label": "数分甲班",
        },
    )
    assert created.status_code == 200
    body = created.json()
    workspace_id = body["workspace_id"]
    join_code = body["join_code"]
    assert body["status"] == "open"

    joined = client.post("/api/v1/workspaces/join", json={"join_code": join_code})
    assert joined.status_code == 200
    assert joined.json()["workspace_id"] == workspace_id

    # 模拟 3 名学生的求助：同一题，两人要提示（其中一人要到第 2 级），一人要完整解答
    def mirror(request_id, participant_code, mode):
        payload = make_request(
            request_id, mode, problem_id=PROBLEM_ID,
            participant_code=participant_code, workspace_id=workspace_id,
        ).model_dump(mode="json")
        response = client.post("/api/v1/course-mirror/requests", json=payload)
        assert response.status_code == 200

    mirror("ov-1", "stu-alpha", "first_hint")
    mirror("ov-2", "stu-alpha", "next_hint")
    mirror("ov-3", "stu-beta", "first_hint")
    mirror("ov-4", "stu-gamma", "full_solution")

    overview = client.get(f"/api/v1/workspaces/{workspace_id}/overview")
    assert overview.status_code == 200
    stats = overview.json()
    assert stats["participants"] == 3
    assert stats["requests"] == 4
    row = stats["per_problem"][0]
    assert row["problem_ref"] == PROBLEM_ID
    assert row["participants"] == 3
    assert row["requests"] == 4
    assert row["max_hint_level"] == 2
    assert row["full_solution_requests"] == 1
    assert "3 名主动参与学生" in stats["coverage_note"]

    # 隐私红线：总览响应不含参与码取值，也不含回答内容相关键
    text = overview.text
    for code in ("stu-alpha", "stu-beta", "stu-gamma"):
        assert code not in text
    for key in ("answer", "response_json", "request_payload"):
        assert key not in stats

    # 关闭后不再接受新请求，但总览仍可读
    closed = client.post(f"/api/v1/workspaces/{workspace_id}/close")
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"
    denied = client.post(
        "/api/v1/course-mirror/requests",
        json=make_request(
            "ov-5", "first_hint", problem_id=PROBLEM_ID,
            participant_code="stu-delta", workspace_id=workspace_id,
        ).model_dump(mode="json"),
    )
    assert denied.status_code == 404
    assert client.get(f"/api/v1/workspaces/{workspace_id}/overview").status_code == 200
