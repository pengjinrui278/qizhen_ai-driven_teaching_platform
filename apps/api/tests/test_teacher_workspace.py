"""教师/TA 端（Assignment Workspace）垂直切片测试。

覆盖：学生请求挂载工作区（匿名参与码落库）、工作区生命周期、聚合总览、
AI 候选现象生成、TA 三选一校准、教师最终决定、周报隐私红线。

隐私红线（全部测试共同遵守）：教师/TA 端可见的任何响应都不得包含
``answer`` / ``response_json`` / ``request_payload`` 类键，也不得出现任何
``participant_code`` 的字面值——只允许 distinct 计数。
"""

import pytest
from sqlalchemy import update

from mirror_api.domain import CourseMirrorRequest, InteractionMode
from mirror_api.llm import StubMirrorModel
from mirror_api.mirror_service import MirrorError, MirrorPipeline
from mirror_api.models import AssignmentWorkspace, MirrorEvent

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
