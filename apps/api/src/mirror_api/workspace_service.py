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

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from .domain import TaDecisionRequest, TeacherDecisionRequest, WorkspaceCreateRequest
from .llm import LanguageModel, MirrorContext
from .mirror_service import MirrorError
from .models import (
    AssignmentWorkspace,
    Course,
    CourseProfileRow,
    MirrorEvent,
    WorkspaceFinding,
)

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


# ------------------------------------------------- AI 候选现象 + 两级决策链


def generate_candidate_findings(
    session: Session, workspace_id: str, model: LanguageModel
) -> list[WorkspaceFinding]:
    """基于聚合统计产出班级现象候选（假设式），落库供 TA 校准。

    - 直接调模型网关，不走学生请求管线、不落 mirror_events；
    - 生成时刻的聚合快照冻结进 ``basis``：报告数字一律读快照，
      工作区事件后续增长不影响已生成候选的可复现性；
    - 红线自检：模型输出的行里若出现该工作区任何参与码取值，整行丢弃。
    """
    workspace = get_workspace(session, workspace_id)
    overview = workspace_overview(session, workspace_id)
    if overview["requests"] == 0:
        raise MirrorError(409, "工作区还没有任何学生请求，无法生成候选现象")

    course = session.get(Course, workspace.course_id)
    context = MirrorContext(
        course_name=course.display_name,
        mirror_name=course.mirror_name,
        interaction_mode="teacher_candidate_insight",
        workspace_stats=overview,
    )
    raw = model.generate(context)

    codes = {
        code
        for code in session.execute(
            select(MirrorEvent.participant_code)
            .where(
                MirrorEvent.assignment_workspace_id == workspace_id,
                MirrorEvent.participant_code.is_not(None),
            )
            .distinct()
        ).scalars()
    }

    findings: list[WorkspaceFinding] = []
    for phenomenon in _parse_phenomena(raw):
        if any(code and code in phenomenon for code in codes):
            continue  # 泄露参与码的行一律丢弃
        finding = WorkspaceFinding(
            finding_id=uuid.uuid4().hex,
            workspace_id=workspace_id,
            phenomenon=phenomenon,
            basis=overview,
            generator=model.name,
        )
        session.add(finding)
        findings.append(finding)
    session.commit()
    return findings


_NUMBERED_LINE = re.compile(r"^\d+[.、)]\s*(.+)$")


def _parse_phenomena(raw: str) -> list[str]:
    """按 “- ” 行拆分模型输出；兜底编号行；再兜底整体作为一条。"""
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    bullets = [line[2:].strip() for line in lines if line.startswith("- ")]
    bullets = [item for item in bullets if item]
    if bullets:
        return bullets
    numbered = [
        match.group(1).strip()
        for line in lines
        if (match := _NUMBERED_LINE.match(line)) and match.group(1).strip()
    ]
    if numbered:
        return numbered
    text = raw.strip()
    return [text] if text else []


def get_finding(session: Session, finding_id: str) -> WorkspaceFinding:
    finding = session.get(WorkspaceFinding, finding_id)
    if finding is None:
        raise MirrorError(404, f"候选现象不存在：{finding_id}")
    return finding


def finding_public(finding: WorkspaceFinding) -> dict:
    return {
        "finding_id": finding.finding_id,
        "workspace_id": finding.workspace_id,
        "phenomenon": finding.phenomenon,
        "basis": finding.basis,
        "generator": finding.generator,
        "ta_status": finding.ta_status,
        "ta_note": finding.ta_note,
        "ta_decided_at": finding.ta_decided_at.isoformat() if finding.ta_decided_at else None,
        "teacher_status": finding.teacher_status,
        "teacher_note": finding.teacher_note,
        "teacher_decided_at": finding.teacher_decided_at.isoformat()
        if finding.teacher_decided_at
        else None,
        "created_at": finding.created_at.isoformat() if finding.created_at else None,
    }


def list_findings(session: Session, workspace_id: str) -> list[dict]:
    get_workspace(session, workspace_id)  # 未知工作区直接 404
    findings = (
        session.execute(
            select(WorkspaceFinding)
            .where(WorkspaceFinding.workspace_id == workspace_id)
            .order_by(WorkspaceFinding.created_at)
        )
        .scalars()
        .all()
    )
    return [finding_public(finding) for finding in findings]


def decide_ta(session: Session, finding_id: str, request: TaDecisionRequest) -> WorkspaceFinding:
    """TA 三选一校准（确认存在问题 / AI 判断有误 / 忽略）。

    教师尚未处理时允许改判覆盖；留痕取最后一次决策、时间与备注。
    """
    finding = get_finding(session, finding_id)
    if finding.teacher_status != "pending":
        raise MirrorError(409, "该现象已由教师做过最终决定，TA 不能改判")
    finding.ta_status = request.decision
    finding.ta_note = request.note
    finding.ta_decided_at = datetime.now(UTC)
    session.commit()
    return finding


def decide_teacher(
    session: Session, finding_id: str, request: TeacherDecisionRequest
) -> WorkspaceFinding:
    """教师最终决定（接受进周报 / 忽略）：仅对 TA 已确认且未处理的候选生效。"""
    finding = get_finding(session, finding_id)
    if finding.ta_status != "confirmed":
        raise MirrorError(409, "教师只能对 TA 确认过的候选现象做最终决定")
    if finding.teacher_status != "pending":
        raise MirrorError(409, "该现象已由教师处理过")
    finding.teacher_status = request.decision
    finding.teacher_note = request.note
    finding.teacher_decided_at = datetime.now(UTC)
    session.commit()
    return finding
