"""Sandbox期限从教师确认创建时起计，到期冻结报告并清理班级临时内容。"""
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select

from .auth import aware
from .models import AssignmentWorkspace, MirrorEvent, WorkspaceFinding
from .platform_models import Attempt, Audit, SandboxMember, SandboxPolicy, Submission
from .workspace_service import build_report


def audit(db, actor, target, action, detail=None):
    db.add(Audit(id=uuid.uuid4().hex, actor_id=actor, target=target,
                 action=action, detail=detail or {}))


def access(db, user, sid, staff=False, owner=False):
    policy = db.get(SandboxPolicy, sid)
    if not policy:
        raise HTTPException(404, "Sandbox不存在")
    member = db.get(SandboxMember, (sid, user.id))
    if policy.owner_id != user.id:
        if owner or not member or (staff and member.role != "ta"):
            raise HTTPException(403, "你无权访问这个Sandbox")
    if not policy.purged_at and aware(policy.expires_at)<=datetime.now(UTC):
        close(db,policy,"lifecycle-worker",purge=True)
    return policy


def snapshot(db, sid):
    report = build_report(db, sid)
    policy = db.get(SandboxPolicy, sid)
    submissions = db.execute(select(Submission).where(Submission.workspace_id == sid)).scalars().all()
    distinct = {s.account_id for s in submissions if s.source == "artifact" and not s.synthetic}
    tests = {s.account_id for s in submissions if s.source == "independent" and not s.synthetic}
    confirmed = [s for s in submissions if s.review.get("decision") == "confirmed" and not s.synthetic]
    report.update({
        "class_size": policy.class_size,
        "artifact_participants": len(distinct),
        "independent_participants": len(tests),
        "confirmed_issues": len(confirmed),
        "synthetic_submissions": sum(s.synthetic for s in submissions),
        "channel_note": "求助过程、作业作品、独立表现分开统计；作品正确不等于独立掌握。合成作品不计入真实作品与独立表现人数或教学建议。",
        "teaching_actions": [
            {"theme": theme, "count": sum(s.review.get("theme") == theme for s in confirmed),
             "suggestion": suggestion}
            for theme, suggestion in [
                ("conditions", "习题课对照两个条件不同的例子，讨论定理何时能用。"),
                ("quantifiers", "让学生比较量词次序，并解释N或δ可以依赖哪些量。"),
                ("construction", "先讨论辅助对象应满足的性质，再比较两种构造。"),
            ] if any(s.review.get("theme") == theme for s in confirmed)
        ],
        "frozen_at": datetime.now(UTC).isoformat(),
    })
    return report


def close(db, policy, actor, purge=False):
    ws = db.get(AssignmentWorkspace, policy.workspace_id)
    if policy.frozen_report is None:
        policy.frozen_report = snapshot(db, ws.workspace_id)
    ws.status = "closed"
    ws.closed_at = ws.closed_at or datetime.now(UTC)
    if purge and policy.purged_at is None:
        # 个人交互归个人保留；移除所有班级关联，包括JSON副本。
        events = db.execute(select(MirrorEvent).where(
            MirrorEvent.assignment_workspace_id == ws.workspace_id)).scalars().all()
        for event in events:
            event.assignment_workspace_id = None
            event.request_payload = {**event.request_payload, "assignment_workspace_id": None}
        for attempt in db.execute(select(Attempt).where(
                Attempt.sandbox_id == ws.workspace_id)).scalars():
            attempt.sandbox_id = None
        targets = {ws.workspace_id}
        targets.update(db.execute(select(Submission.id).where(Submission.workspace_id==ws.workspace_id)).scalars())
        targets.update(db.execute(select(WorkspaceFinding.finding_id).where(WorkspaceFinding.workspace_id==ws.workspace_id)).scalars())
        # 审批前后快照可能含作品原文；到期只保留动作，不保留临时内容副本。
        for row in db.execute(select(Audit).where(Audit.target.in_(targets))).scalars():
            row.detail={"purged":True}
        db.query(Submission).filter_by(workspace_id=ws.workspace_id).delete()
        db.query(SandboxMember).filter_by(workspace_id=ws.workspace_id).delete()
        db.query(WorkspaceFinding).filter_by(workspace_id=ws.workspace_id).delete()
        # 只保留聚合报告及政策，不保留临时作业题干。
        policy.assignment = ""
        policy.purged_at = datetime.now(UTC)
    audit(db, actor, ws.workspace_id, "purged" if purge else "closed")
    db.commit()


def cleanup(db, now=None):
    now = now or datetime.now(UTC)
    policies = db.execute(select(SandboxPolicy).where(
        SandboxPolicy.purged_at.is_(None))).scalars().all()
    count = 0
    for policy in policies:
        if aware(policy.expires_at) <= now:
            close(db, policy, "lifecycle-worker", purge=True)
            count += 1
    return count
