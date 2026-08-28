"""阶段 1 检索：以精确匹配 + 关键词为主。

向量混合检索（pgvector）在模型网关接入嵌入能力后叠加到这一层，
接口保持不变。所有返回都执行授权门控：

- 知识节点：``source.allowed_for_rag`` 为真才可被检索/引用；
- 题目：``rights.allowed_for_runtime`` 为真才可在运行时使用。
"""

from __future__ import annotations

import re

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .domain import ProblemInput
from .models import CoursePack, KnowledgeNode, Problem, ProblemKnowledge, TextbookChunk

# 查询词切分：中英文/数字保留；中文按字级二元组（bigram）切分，避免整句无法匹配
_CJK_RE = re.compile(r"[一-龥]")
_ALNUM_RE = re.compile(r"[a-zA-Z0-9]+")


def _query_tokens(text: str) -> list[str]:
    """把查询拆成有效检索 token（中文 bigram + 英文单词/数字）。"""
    seen: set[str] = set()
    result: list[str] = []

    # 英文/数字原词保留
    for token in _ALNUM_RE.findall(text):
        if token not in seen:
            seen.add(token)
            result.append(token)

    # 中文按字级 bigram 切分
    chars = _CJK_RE.findall(text)
    for i in range(len(chars) - 1):
        bigram = chars[i] + chars[i + 1]
        if bigram not in seen:
            seen.add(bigram)
            result.append(bigram)

    return result


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


def search_textbook_chunks(
    session: Session, course_id: str, text: str, limit: int = 3
) -> list[TextbookChunk]:
    """按关键词搜索某课程的教材文本块（仅返回授权允许 RAG 的块）。

    策略：先把查询拆成有效 token，再按任一 token 做 ilike 匹配，
    命中 token 越多的块排名越靠前。
    """
    tokens = _query_tokens(text)
    if not tokens:
        return []

    conditions = [
        or_(
            TextbookChunk.title.ilike(f"%{token}%"),
            TextbookChunk.content.ilike(f"%{token}%"),
        )
        for token in tokens
    ]
    rows = session.execute(
        select(TextbookChunk)
        .where(TextbookChunk.course_id == course_id, or_(*conditions))
        .limit(limit * 3)
    ).scalars()

    allowed = [row for row in rows if rag_allowed_chunk(row)]

    def score(chunk: TextbookChunk) -> int:
        haystack = f"{chunk.title or ''} {chunk.content}"
        return sum(1 for token in tokens if token in haystack)

    allowed.sort(key=score, reverse=True)
    return allowed[:limit]


def rag_allowed_chunk(chunk: TextbookChunk) -> bool:
    return bool(chunk.source.get("allowed_for_rag"))
