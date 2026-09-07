"""学生错题上传服务。

负责：题目识别 / 新题入库 / 提示阶梯生成 / 质量评估 / 相似题推荐 /
触发首次提示管线。
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .domain import (
    CourseMirrorRequest,
    InteractionMode,
    ProblemInput,
    ProblemSummary,
    StudentUploadRequest,
    StudentUploadResponse,
)
from .llm import LanguageModel, MirrorContext
from .mirror_service import MirrorPipeline
from .models import (
    Course,
    CoursePack,
    KnowledgeNode,
    Problem,
    ProblemHint,
    ProblemKnowledge,
)
from .retrieval import (
    course_pack_ids,
    find_problem,
    find_similar_problems,
    knowledge_for_problem,
    search_knowledge,
    search_textbook_chunks,
)

_STUDENT_UPLOAD_PACK_PREFIX = "student-uploads-"
_HINT_LADDER_SIZE = 5


class UploadError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _student_pack_id(course_id: str) -> str:
    return f"{_STUDENT_UPLOAD_PACK_PREFIX}{course_id}"


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _ensure_student_pack(session: Session, course_id: str, profile_id: str) -> CoursePack:
    pack_id = _student_pack_id(course_id)
    pack = session.get(CoursePack, pack_id)
    if pack is None:
        pack = CoursePack(
            coursepack_id=pack_id,
            course_id=course_id,
            profile_id=profile_id,
            status="review",
            textbook={},
            content_policy="学生上传错题专用 CoursePack，自动审核 + 人工复核后入库。",
        )
        session.add(pack)
        session.flush()
    return pack


def _extract_knowledge_ids(
    session: Session, pack_ids: list[str], text: str, course_id: str
) -> list[str]:
    """从知识节点和教材块中为上传题关联最相关的知识 ID。"""
    ids: list[str] = []
    seen: set[str] = set()

    for node in search_knowledge(session, pack_ids, text, limit=3):
        if node.knowledge_id not in seen:
            seen.add(node.knowledge_id)
            ids.append(node.knowledge_id)

    for chunk in search_textbook_chunks(session, course_id, text, limit=3):
        # 教材块没有 knowledge_id，可复用 chunk_id 作为弱关联标签
        tag = f"textbook:{chunk.chunk_id}"
        if tag not in seen:
            seen.add(tag)
            ids.append(tag)

    return ids


def _has_math_content(text: str) -> bool:
    """粗略判断文本是否包含数学相关内容。"""
    if re.search(r"[\$\\]", text):  # LaTeX 标记
        return True
    if re.search(r"[0-9]", text) and re.search(r"[+\-*/=^∫∂∑∏αβγθ∞≤≥≠≈]", text):
        return True
    # 数列、函数、极限等常见数学表述
    return bool(
        re.search(
            r"\{[a-zA-Z]_\{?[^}]+\}?\}|数列|收敛|极限|导数|积分|方程|矩阵|向量|证明|求解", text
        )
    )


def assess_quality(
    session: Session,
    problem: Problem,
    pack_ids: list[str],
    course_id: str,
) -> Literal["approved", "pending", "rejected"]:
    """基于规则自动评估上传题质量。"""
    statement = problem.statement or ""

    # 基本过滤
    if len(statement) < 20 or len(statement) > 2000:
        return "rejected"
    if not _has_math_content(statement):
        return "rejected"

    # 课程契合度
    knowledge_hits = len(search_knowledge(session, pack_ids, statement, limit=1))
    textbook_hits = len(search_textbook_chunks(session, course_id, statement, limit=1))

    if knowledge_hits >= 1 and textbook_hits >= 1:
        return "approved"
    return "pending"


def generate_hint_ladder(
    session: Session,
    model: LanguageModel,
    problem: Problem,
    knowledge: list[KnowledgeNode],
    course_name: str,
    mirror_name: str,
) -> list[ProblemHint]:
    """为上传题生成 5 级不泄露答案的提示阶梯。"""
    # 已有提示则复用
    existing = session.execute(
        select(ProblemHint)
        .where(
            ProblemHint.coursepack_id == problem.coursepack_id,
            ProblemHint.problem_id == problem.problem_id,
        )
        .order_by(ProblemHint.level)
    ).scalars().all()
    if existing:
        return list(existing)

    context = MirrorContext(
        course_name=course_name,
        mirror_name=mirror_name,
        interaction_mode="hint_ladder_generation",
        problem_statement=problem.statement,
        knowledge=[
            {"knowledge_id": node.knowledge_id, "title": node.title, "statement": node.statement}
            for node in knowledge
        ],
    )
    raw = model.generate(context)

    hints: list[dict] = []
    try:
        # 模型可能被包裹在 markdown 代码块中
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            hints = parsed
    except (json.JSONDecodeError, TypeError):
        hints = []

    # 若解析失败或数量不足，用确定性兜底提示
    if len(hints) < _HINT_LADDER_SIZE:
        hints = [
            {
                "level": i + 1,
                "type": "direction" if i == 0 else "method" if i < 3 else "condition",
                "content": f"第 {i + 1} 步：先回顾题目涉及的定义与已知条件，把它们逐条写下来。",
            }
            for i in range(_HINT_LADDER_SIZE)
        ]

    result: list[ProblemHint] = []
    for item in hints[:_HINT_LADDER_SIZE]:
        level = int(item.get("level", len(result) + 1))
        result.append(
            ProblemHint(
                coursepack_id=problem.coursepack_id,
                problem_id=problem.problem_id,
                level=level,
                hint_type=item.get("type", "scaffold"),
                content=str(item.get("content", "继续思考这一步。")),
            )
        )
    session.add_all(result)
    session.flush()
    return result


def recognize_or_create_problem(
    session: Session,
    request: StudentUploadRequest,
    pack_ids: list[str],
) -> tuple[Problem, bool]:
    """识别题库已有题；未命中则在学生上传 CoursePack 创建新题。

    返回 (problem, recognized)。
    """
    problem_input = ProblemInput(text=request.problem.text)
    existing = find_problem(session, pack_ids, problem_input)
    if existing is not None:
        return existing, True

    if not request.problem.text or not request.problem.text.strip():
        raise UploadError(400, "题目文本不能为空")

    pack = _ensure_student_pack(session, request.course_id, request.course_profile_id)
    problem_id = f"upload-{uuid.uuid4().hex[:12]}"
    now = _now_iso()

    problem = Problem(
        coursepack_id=pack.coursepack_id,
        problem_id=problem_id,
        type="exercise",
        provenance="student_submitted",
        statement=request.problem.text.strip(),
        answer_type="mixed",
        solution_paths=[],
        common_mistakes=[],
        rights={
            "allowed_for_runtime": False,
            "allowed_for_rag": True,
            "allowed_for_eval": False,
            "allowed_for_training": False,
            "license_note": "学生上传，仅用于当前课程答疑；入库前须经审核",
        },
        review={
            "status": "student_pending",
            "submitted_at": now,
            "reviewer": None,
            "decision_at": None,
            "note": "",
        },
    )
    session.add(problem)
    session.flush()

    # 关联知识点（弱标签）
    knowledge_ids = _extract_knowledge_ids(
        session, pack_ids, problem.statement, request.course_id
    )
    real_knowledge_ids = set(
        session.execute(
            select(KnowledgeNode.knowledge_id).where(
                KnowledgeNode.coursepack_id.in_(pack_ids),
                KnowledgeNode.knowledge_id.in_([k for k in knowledge_ids if not k.startswith("textbook:")]),
            )
        ).scalars().all()
    )
    for kid in knowledge_ids:
        if kid.startswith("textbook:"):
            continue
        if kid in real_knowledge_ids:
            session.add(
                ProblemKnowledge(
                    coursepack_id=problem.coursepack_id,
                    problem_id=problem.problem_id,
                    knowledge_id=kid,
                )
            )
    session.flush()
    return problem, False


def handle_upload(
    session: Session,
    request: StudentUploadRequest,
    model: LanguageModel,
    pipeline: MirrorPipeline,
) -> StudentUploadResponse:
    pack_ids = course_pack_ids(session, request.course_id, request.course_profile_id)
    if not pack_ids:
        raise UploadError(404, "该课程尚未导入任何 CoursePack")

    problem, recognized = recognize_or_create_problem(session, request, pack_ids)

    if not recognized:
        quality = assess_quality(session, problem, pack_ids, request.course_id)
        problem.review["status"] = f"student_{quality}"
        problem.review["decision_at"] = _now_iso()
        if quality == "approved":
            problem.rights["allowed_for_runtime"] = True
            problem.rights["license_note"] = "学生提交，经自动审核后加入课程题库"
        elif quality == "rejected":
            problem.rights["allowed_for_runtime"] = False
            problem.rights["allowed_for_rag"] = False
        session.flush()

        knowledge = knowledge_for_problem(session, problem)
        course = session.get(CoursePack, problem.coursepack_id)
        course_name = course.course_id if course else request.course_id
        mirror_name = "学习镜像"
        course_row = session.get(Course, request.course_id)
        if course_row:
            course_name = course_row.display_name
            mirror_name = course_row.mirror_name
        generate_hint_ladder(session, model, problem, knowledge, course_name, mirror_name)
    else:
        # 命中题库已有题：按运行时授权状态返回 approved / pending
        problem.review["status"] = "student_approved" if problem.rights.get("allowed_for_runtime") else "student_pending"

    quality_status = problem.review.get("status", "student_pending").replace("student_", "")

    # 触发首级提示管线
    mirror_request = CourseMirrorRequest(
        request_id=request.request_id,
        course_id=request.course_id,
        course_profile_id=request.course_profile_id,
        problem=ProblemInput(problem_id=problem.problem_id),
        interaction_mode=InteractionMode.FIRST_HINT,
        participant_code=request.participant_code,
        assignment_workspace_id=request.assignment_workspace_id,
    )
    first_hint = pipeline.handle(session, mirror_request)

    max_hint_level = session.execute(
        select(func.max(ProblemHint.level)).where(
            ProblemHint.coursepack_id == problem.coursepack_id,
            ProblemHint.problem_id == problem.problem_id,
        )
    ).scalar() or 0

    # 相似题推荐
    knowledge_nodes = knowledge_for_problem(session, problem)
    similar = find_similar_problems(
        session,
        pack_ids,
        problem.statement,
        [node.knowledge_id for node in knowledge_nodes],
        limit=3,
        exclude_ref=(problem.coursepack_id, problem.problem_id),
    )

    similar_summaries = []
    for sim in similar:
        sim_max_level = session.execute(
            select(func.max(ProblemHint.level)).where(
                ProblemHint.coursepack_id == sim.coursepack_id,
                ProblemHint.problem_id == sim.problem_id,
            )
        ).scalar() or 0
        similar_summaries.append(
            ProblemSummary(
                problem_id=sim.problem_id,
                coursepack_id=sim.coursepack_id,
                statement=sim.statement,
                answer_type=sim.answer_type,
                max_hint_level=sim_max_level,
            )
        )

    return StudentUploadResponse(
        request_id=request.request_id,
        course_id=request.course_id,
        problem_id=problem.problem_id,
        coursepack_id=problem.coursepack_id,
        recognized=recognized,
        quality_status=quality_status,  # type: ignore[arg-type]
        max_hint_level=max_hint_level,
        first_hint=first_hint,
        similar_problems=similar_summaries,
    )


def approve_student_problem(
    session: Session,
    coursepack_id: str,
    problem_id: str,
    note: str | None,
) -> Problem:
    problem = session.get(Problem, (coursepack_id, problem_id))
    if problem is None:
        raise UploadError(404, "题目不存在")
    if problem.provenance != "student_submitted":
        raise UploadError(400, "只能审校学生上传的题目")

    problem.review = {
        **problem.review,
        "status": "student_approved",
        "reviewer": "manual",
        "decision_at": _now_iso(),
        "note": note or "",
    }
    problem.rights = {
        **problem.rights,
        "allowed_for_runtime": True,
        "license_note": "学生提交，经人工审校后加入课程题库",
    }
    session.commit()
    return problem


def reject_student_problem(
    session: Session,
    coursepack_id: str,
    problem_id: str,
    note: str | None,
) -> Problem:
    problem = session.get(Problem, (coursepack_id, problem_id))
    if problem is None:
        raise UploadError(404, "题目不存在")
    if problem.provenance != "student_submitted":
        raise UploadError(400, "只能审校学生上传的题目")

    problem.review = {
        **problem.review,
        "status": "student_rejected",
        "reviewer": "manual",
        "decision_at": _now_iso(),
        "note": note or "",
    }
    problem.rights = {
        **problem.rights,
        "allowed_for_runtime": False,
        "allowed_for_rag": False,
    }
    session.commit()
    return problem


def list_pending_uploads(
    session: Session,
    course_id: str | None = None,
    limit: int = 50,
) -> list[Problem]:
    query = select(Problem).where(Problem.provenance == "student_submitted")
    if course_id:
        query = query.where(Problem.coursepack_id.like(f"{_STUDENT_UPLOAD_PACK_PREFIX}{course_id}"))
    query = query.order_by(Problem.problem_id).limit(limit)
    return list(session.execute(query).scalars().all())
