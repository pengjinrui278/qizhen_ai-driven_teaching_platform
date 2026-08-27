"""阶段 1 检索：以精确匹配 + 关键词为主。

向量混合检索（pgvector）在模型网关接入嵌入能力后叠加到这一层，
接口保持不变。所有返回都执行授权门控：

- 知识节点：``source.allowed_for_rag`` 为真才可被检索/引用；
- 题目：``rights.allowed_for_runtime`` 为真才可在运行时使用。
"""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .domain import ProblemInput
from .models import CoursePack, KnowledgeNode, Problem, ProblemKnowledge


def course_pack_ids(session: Session, course_id: str, profile_id: str) -> list[str]:
    rows = session.execute(
        select(CoursePack.coursepack_id).where(
            CoursePack.course_id == course_id, CoursePack.profile_id == profile_id
        )
    ).scalars()
    return list(rows)


def find_problem(session: Session, pack_ids: list[str], problem: ProblemInput) -> Problem | None:
    if not pack_ids:
        return None
    if problem.problem_id:
        row = session.execute(
            select(Problem).where(
                Problem.coursepack_id.in_(pack_ids), Problem.problem_id == problem.problem_id
            )
        ).scalars().first()
        if row is not None:
            return row
    if problem.text:
        exact = session.execute(
            select(Problem).where(
                Problem.coursepack_id.in_(pack_ids), Problem.statement == problem.text.strip()
            )
        ).scalars().first()
        if exact is not None:
            return exact
        fuzzy = session.execute(
            select(Problem).where(
                Problem.coursepack_id.in_(pack_ids), Problem.statement.ilike(f"%{problem.text.strip()}%")
            )
        ).scalars().first()
        if fuzzy is not None:
            return fuzzy
    return None


def knowledge_for_problem(session: Session, problem: Problem) -> list[KnowledgeNode]:
    rows = session.execute(
        select(KnowledgeNode)
        .join(
            ProblemKnowledge,
            (ProblemKnowledge.coursepack_id == KnowledgeNode.coursepack_id)
            & (ProblemKnowledge.knowledge_id == KnowledgeNode.knowledge_id),
        )
        .where(
            ProblemKnowledge.coursepack_id == problem.coursepack_id,
            ProblemKnowledge.problem_id == problem.problem_id,
        )
    ).scalars()
    return list(rows)


def search_knowledge(
    session: Session, pack_ids: list[str], text: str, limit: int = 5
) -> list[KnowledgeNode]:
    if not pack_ids or not text.strip():
        return []
    needle = text.strip()
    rows = session.execute(
        select(KnowledgeNode)
        .where(
            KnowledgeNode.coursepack_id.in_(pack_ids),
            or_(
                KnowledgeNode.title.ilike(f"%{needle}%"),
                KnowledgeNode.statement.ilike(f"%{needle}%"),
            ),
        )
        .limit(limit)
    ).scalars()
    return list(rows)


def rag_allowed(node: KnowledgeNode) -> bool:
    return bool(node.source.get("allowed_for_rag"))


def runtime_allowed(problem: Problem) -> bool:
    return bool(problem.rights.get("allowed_for_runtime"))
