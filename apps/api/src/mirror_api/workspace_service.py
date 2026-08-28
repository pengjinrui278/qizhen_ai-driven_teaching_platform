"""教师/TA 端作业工作区服务：生命周期、聚合总览、候选现象、决策链与周报。

隐私红线（模块级，约束本文件所有函数与上游调用方）：

- 只允许对工作区事件做**聚合查询**：``problem_ref / interaction_mode /
  hint_level`` 的分组统计，以及 ``participant_code`` 的 **distinct 计数**；
- ``response_json`` / ``request_payload`` / 任何回答文本**禁止**出现在
  本模块的查询与响应中——教师/TA 端永远不接触学生的对话内容；
- ``participant_code`` 取值只允许在模块内部短暂存在（例如生成候选现象时
  做泄露自检），任何返回的 dict/列表中都不得包含参与码字面值；
- 不做学生个体拆分，不做活跃排行：所有输出都是班级层面的聚合。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from .domain import WorkspaceCreateRequest
from .mirror_service import MirrorError
from .models import AssignmentWorkspace, Course, CourseProfileRow, MirrorEvent

COVERAGE_NOTE_TEMPLATE = "仅覆盖 {n} 名主动参与学生，不外推全班。"
CHANNEL_NOTE = (
    "本报告仅基于学习镜像过程证据（求助交互聚合统计）；"
    "作业作品证据通道尚未接入。"
)


# ---------------------------------------------------------------- 生命周期


def create_workspace(session: Session, request: WorkspaceCreateRequest) -> AssignmentWorkspace:
    course = session.get(Course, request.course_id)
    if course is None:
        raise MirrorError(404, f"课程不存在：{request.course_id}")
    profile = session.get(CourseProfileRow, (request.course_id, request.course_profile_id))
    if profile is None:
        raise MirrorError(404, f"课程 Profile 不存在：{request.course_profile_id}")
    workspace = AssignmentWorkspace(
        workspace_id=uuid.uuid4().hex,
        course_id=request.course_id,
        profile_id=request.course_profile_id,
        title=request.title,
        class_label=request.class_label,
        join_code=_unused_join_code(session),
    )
    session.add(workspace)
    session.commit()
    return workspace


def _unused_join_code(session: Session) -> str:
    while True:
        code = uuid.uuid4().hex[:8].upper()
        exists = session.execute(
            select(AssignmentWorkspace.join_code).where(AssignmentWorkspace.join_code == code)
        ).first()
        if exists is None:
            return code


def join_workspace(session: Session, join_code: str) -> AssignmentWorkspace:
    normalized = join_code.strip().upper()
    workspace = session.execute(
        select(AssignmentWorkspace).where(AssignmentWorkspace.join_code == normalized)
    ).scalar_one_or_none()
    if workspace is None:
        raise MirrorError(404, "加入码不正确：找不到对应的作业工作区")
    if workspace.status != "open":
        raise MirrorError(409, "该作业工作区已关闭，不再接受加入")
    return workspace


def close_workspace(session: Session, workspace_id: str) -> AssignmentWorkspace:
    workspace = get_workspace(session, workspace_id)
    if workspace.status == "closed":
        raise MirrorError(409, "作业工作区已经关闭过了")
    workspace.status = "closed"
    workspace.closed_at = datetime.now(UTC)
    session.commit()
    return workspace


def get_workspace(session: Session, workspace_id: str) -> AssignmentWorkspace:
    workspace = session.get(AssignmentWorkspace, workspace_id)
    if workspace is None:
        raise MirrorError(404, f"作业工作区不存在：{workspace_id}")
    return workspace


def workspace_public(workspace: AssignmentWorkspace, participants: int) -> dict:
    """工作区对外字段（含参与人数）；不含任何事件内容。"""
    return {
        "workspace_id": workspace.workspace_id,
        "course_id": workspace.course_id,
        "profile_id": workspace.profile_id,
        "title": workspace.title,
        "class_label": workspace.class_label,
        "join_code": workspace.join_code,
        "status": workspace.status,
        "participants": participants,
        "created_at": workspace.created_at.isoformat() if workspace.created_at else None,
        "closed_at": workspace.closed_at.isoformat() if workspace.closed_at else None,
    }


def participant_count(session: Session, workspace_id: str) -> int:
    """参与人数 = 参与码 distinct 计数（唯一允许的参与码用法）。"""
    return (
        session.execute(
            select(func.count(func.distinct(MirrorEvent.participant_code))).where(
                MirrorEvent.assignment_workspace_id == workspace_id
            )
        ).scalar()
        or 0
    )


def list_workspaces(session: Session, course_id: str | None) -> list[dict]:
    statement = select(AssignmentWorkspace).order_by(AssignmentWorkspace.created_at.desc())
    if course_id:
        statement = statement.where(AssignmentWorkspace.course_id == course_id)
    workspaces = session.execute(statement).scalars().all()
    return [workspace_public(item, participant_count(session, item.workspace_id)) for item in workspaces]


# ---------------------------------------------------------------- 聚合总览


def workspace_overview(session: Session, workspace_id: str) -> dict:
    """班级层面聚合总览：参与人数、请求数、逐题统计与覆盖声明。

    返回值中不含任何参与码取值、回答内容或请求原文。
    """
    workspace = get_workspace(session, workspace_id)
    base_filter = MirrorEvent.assignment_workspace_id == workspace_id

    per_problem_rows = session.execute(
        select(
            MirrorEvent.problem_ref,
            func.count(MirrorEvent.request_id),
            func.count(func.distinct(MirrorEvent.participant_code)),
            func.max(MirrorEvent.hint_level),
            func.sum(case((MirrorEvent.interaction_mode == "full_solution", 1), else_=0)),
        )
        .where(base_filter)
        .group_by(MirrorEvent.problem_ref)
    ).all()
    per_problem = [
        {
            "problem_ref": problem_ref,
            "requests": requests,
            "participants": participants,
            "max_hint_level": max_hint or 0,
            "full_solution_requests": full_solutions or 0,
        }
        for problem_ref, requests, participants, max_hint, full_solutions in per_problem_rows
    ]
    per_problem.sort(key=lambda item: (-item["participants"], item["problem_ref"] or ""))

    participants = participant_count(session, workspace_id)
    total_requests = (
        session.execute(select(func.count(MirrorEvent.request_id)).where(base_filter)).scalar() or 0
    )
    return {
        "workspace_id": workspace_id,
        "title": workspace.title,
        "class_label": workspace.class_label,
        "status": workspace.status,
        "participants": participants,
        "requests": total_requests,
        "per_problem": per_problem,
        "coverage_note": COVERAGE_NOTE_TEMPLATE.format(n=participants),
    }
