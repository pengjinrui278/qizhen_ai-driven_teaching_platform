"""可纠正的观察→假设→最小个人上下文；不从题型或求助次数推断能力。"""
import uuid
import re
from datetime import UTC, datetime

from sqlalchemy import select

from .domain import MinimalStudentContext
from .platform_models import Hypothesis, Observation

THEMES = {
    "conditions": ("定理条件", "近期在定理适用条件上可能需要额外核对"),
    "quantifiers": ("量词与依赖", "近期在量词顺序与变量依赖上可能需要额外核对"),
    "construction": ("辅助对象", "近期在自主确定辅助对象时可能需要提示"),
}


def detect_theme(message):
    # 只认学生明确表达的困难，不根据题干的知识标签推断。
    if not any(w in message for w in ("不会", "不懂", "不理解", "不明白", "卡", "不知道", "困惑")):
        return None
    for theme, words in [
        ("conditions", ("条件", "能用", "适用")),
        ("quantifiers", ("量词", "任意", "存在", "依赖", "ε", "δ", "epsilon", "delta")),
        ("construction", ("构造", "辅助", "怎么想")),
    ]:
        if any(w in message for w in words):
            return theme
    if re.search(r"(?<![a-zA-Z])N(?![a-zA-Z])", message):
        return "quantifiers"
    return None


def add_observation(db, user, course, attempt, kind, theme, text, direction="neutral",
                    source="interaction", strength="weak", observation_id=None):
    oid = observation_id or uuid.uuid4().hex
    old = db.get(Observation, oid)
    if old:
        return old
    row = Observation(id=oid, account_id=user, course_id=course, attempt_id=attempt,
                      kind=kind, theme=theme, text=text, direction=direction,
                      source=source, strength=strength)
    db.add(row)
    db.flush()
    rebuild(db, user, course)
    return row


def rebuild(db, user, course):
    rows = db.execute(select(Observation).where(
        Observation.account_id == user, Observation.course_id == course,
        Observation.disputed.is_(False)
    ).order_by(Observation.created_at)).scalars().all()
    for theme, (_, statement) in THEMES.items():
        support = [r for r in rows if r.theme == theme and r.direction == "support"]
        contra = [r for r in rows if r.theme == theme and r.direction == "contradict"]
        if not support and not contra:
            old = db.get(Hypothesis, f"{user}:{course}:{theme}")
            if old:
                db.delete(old)
            continue
        independent_attempts = len({r.attempt_id or r.id for r in support})
        status = "emerging"
        sufficiency = "不足"
        if independent_attempts >= 2:
            status, sufficiency = "worth_attention", "有限：跨次自述或作品证据"
        if contra:
            status = "improving" if support else "weakened"
        if len(contra) >= len(support) and contra:
            status = "weakened"
        hid = f"{user}:{course}:{theme}"
        row = db.get(Hypothesis, hid)
        if not row:
            row = Hypothesis(id=hid, account_id=user, course_id=course, theme=theme)
            db.add(row)
        row.statement = statement
        row.supporting = [r.id for r in support]
        row.contradicting = [r.id for r in contra]
        row.status = status
        row.sufficiency = sufficiency
        row.updated_at = datetime.now(UTC)
    db.flush()


def context_for(db, user, course):
    hypotheses = db.execute(select(Hypothesis).where(
        Hypothesis.account_id == user, Hypothesis.course_id == course,
        Hypothesis.status.in_(["worth_attention", "improving"])
    ).order_by(Hypothesis.updated_at.desc()).limit(5)).scalars().all()
    recent=db.execute(select(Observation).where(
        Observation.account_id==user,Observation.course_id==course,
        Observation.disputed.is_(False)
    ).order_by(Observation.created_at.desc()).limit(12)).scalars().all()
    labels={"continued":"自报可以继续","solved":"自报完成，独立性未验证",
            "still_stuck":"自报仍有困难","independent_success":"自报独立完成，尚需任务证据",
            "student_question":"明确提出困惑","artifact_review":"教学团队作品判断","ta_review":"教学团队作品判断",
            "independent_test":"独立任务记录"}
    summaries=[f"{THEMES.get(r.theme,('学习环节',))[0]}：{labels.get(r.kind,'已记录反馈')}；"
               f"证据来源={r.source}，强度={r.strength}，"
               f"{'支持关注' if r.direction=='support' else '相反证据' if r.direction=='contradict' else '中性记录'}"
               for r in recent]
    return MinimalStudentContext(
        relevant_hypotheses=[h.statement + "；证据有限，可修正" for h in hypotheses],
        relevant_knowledge_states=summaries,
        recent_help_pattern=[f"{THEMES[h.theme][0]}：支持记录{len(h.supporting)}条；相反证据{len(h.contradicting)}条；非掌握结论"
                             for h in hypotheses],
    )


def memory_view(db, user):
    observations = db.execute(select(Observation).where(
        Observation.account_id == user).order_by(Observation.created_at.desc())).scalars().all()
    hypotheses = db.execute(select(Hypothesis).where(
        Hypothesis.account_id == user).order_by(Hypothesis.updated_at.desc())).scalars().all()
    return {
        "observations": [{"id": r.id, "course_id": r.course_id, "attempt_id": r.attempt_id,
                          "kind": r.kind, "theme": r.theme, "text": r.text,
                          "direction": r.direction, "source": r.source,
                          "strength": r.strength, "disputed": r.disputed,
                          "correction": r.correction, "created_at": r.created_at.isoformat()}
                         for r in observations],
        "hypotheses": [{"id": h.id, "course_id": h.course_id, "theme": h.theme,
                        "statement": h.statement, "supporting": h.supporting,
                        "contradicting": h.contradicting, "status": h.status,
                        "sufficiency": h.sufficiency} for h in hypotheses],
    }
