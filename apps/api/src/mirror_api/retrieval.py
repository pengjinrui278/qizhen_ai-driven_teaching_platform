"""阶段 1 检索：以精确匹配 + 关键词为主。

向量混合检索（pgvector）在模型网关接入嵌入能力后叠加到这一层，
接口保持不变。所有返回都执行授权门控：

- 知识节点：``source.allowed_for_rag`` 为真才可被检索/引用；
- 题目：``rights.allowed_for_runtime`` 为真才可在运行时使用。
"""

from __future__ import annotations

import re
import math
from collections import Counter

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .domain import ProblemInput
from .models import CoursePack, KnowledgeNode, Problem, ProblemKnowledge, TextbookChunk
from .retrieval_terms import concept_groups

# 查询词切分：中英文/数字保留；中文按字级二元组（bigram）切分，避免整句无法匹配
_CJK_RE = re.compile(r"[一-龥]")
_ALNUM_RE = re.compile(r"[a-zA-Z0-9]+")


def _query_tokens(text: str) -> list[str]:
    """把查询拆成有效检索 token（中文 bigram + 英文单词/数字）。"""
    seen: set[str] = set()
    result: list[str] = []
    for group in concept_groups(text):
        for alias in group:
            if alias not in seen:
                seen.add(alias)
                result.append(alias)

    # 英文/数字原词保留
    for token in _ALNUM_RE.findall(text.casefold()):
        if len(token) < 3 or token.isdigit() or token in {"the", "for", "and", "let", "prove", "frac", "left", "right", "begin", "end"}:
            continue
        if token not in seen:
            seen.add(token)
            result.append(token)

    # 中文按字级 bigram 切分
    stopwords = {"完全","没有","见过","过的","的一","一道","道题","一个","这个","什么","怎么","如何","证明","设有","存在","对于", "请问", "帮我", "一下", "不懂", "理解", "这道", "题目", "需要", "可以", "我们", "这里", "为什", "什么", "尝试"}
    for segment in re.findall(r"[一-龥]+", text):
        for i in range(len(segment) - 1):
            bigram = segment[i:i+2]
            if bigram not in seen and bigram not in stopwords:
                seen.add(bigram)
                result.append(bigram)

    return result


def _rank(rows, text, title_of, body_of, limit):
    """IDF-weighted lexical ranking with concept gates and duplicate removal.

    This deliberately makes no semantic-search claim. A lone variable/number or
    generic instruction must not be enough to retrieve a textbook passage.
    """
    tokens = _query_tokens(text)[:40]
    groups = concept_groups(text)
    documents = [(row, (title_of(row) or "").casefold(), body_of(row).casefold()) for row in rows]
    df = Counter(token for _, title, body in documents for token in tokens if token in title or token in body)
    scored = []
    for row, title, body in documents:
        if groups and not any(alias in title or alias in body for group in groups for alias in group):
            continue
        matched = [token for token in tokens if token in title or token in body]
        if not matched:
            continue
        if not groups and len(tokens) >= 4 and len(matched) < 2 and not any(t in title for t in matched):
            continue
        score = sum(math.log(1 + (len(documents) + 1) / (df[t] + 1)) *
                    (3 * (t in title) + min(body.count(t), 3)) for t in matched)
        score /= 1 + math.log1p(len(body) / 1500)
        scored.append((score, row, re.sub(r"\s+", "", body)))
    scored.sort(key=lambda item: item[0], reverse=True)
    found, seen = [], set()
    for _, row, fingerprint in scored:
        if fingerprint in seen:
            continue
        found.append(row)
        seen.add(fingerprint)
        if len(found) >= max(1, min(limit, 20)):
            break
    return found


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
    if problem.coursepack_id:
        pack_ids = [p for p in pack_ids if p == problem.coursepack_id]
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
        # 相似题不等于同一道题；私人题干只有完整精确匹配才可复用参考解答。
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
    tokens = _query_tokens(text)[:40]
    if not tokens:
        return []
    rows = session.execute(
        select(KnowledgeNode)
        .where(
            KnowledgeNode.coursepack_id.in_(pack_ids),
            or_(*[KnowledgeNode.title.contains(t, autoescape=True) |
                   KnowledgeNode.statement.contains(t, autoescape=True) for t in tokens]),
        )
    ).scalars()
    allowed = [r for r in rows if rag_allowed(r)]
    return _rank(allowed, text, lambda r: r.title, lambda r: r.statement, limit)


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
    tokens = _query_tokens(text)[:40]
    if not tokens:
        return []

    conditions = [
        or_(
            TextbookChunk.title.contains(token, autoescape=True),
            TextbookChunk.content.contains(token, autoescape=True),
        )
        for token in tokens
    ]
    rows = session.execute(
        select(TextbookChunk)
        .where(TextbookChunk.course_id == course_id, or_(*conditions))
    ).scalars()

    allowed = [row for row in rows if rag_allowed_chunk(row)]

    return _rank(allowed, text, lambda r: r.title, lambda r: r.content, limit)


def rag_allowed_chunk(chunk: TextbookChunk) -> bool:
    return bool(chunk.source.get("allowed_for_rag"))


def find_similar_problems(
    session: Session,
    pack_ids: list[str],
    text: str,
    knowledge_ids: list[str],
    limit: int = 3,
    exclude_ref: tuple[str, str] | None = None,
) -> list[Problem]:
    """为上传的错题推荐同类已授权练习题。

    计分：共享 knowledge_id +3；statement 命中查询 token +1。
    只返回 ``rights.allowed_for_runtime`` 为真的题目。
    """
    if not pack_ids or not text.strip():
        return []

    candidates = session.execute(
        select(Problem).where(
            Problem.coursepack_id.in_(pack_ids),
        )
    ).scalars().all()

    tokens = _query_tokens(text)
    knowledge_set = set(knowledge_ids)
    scored: list[tuple[int, Problem]] = []

    for problem in candidates:
        if not runtime_allowed(problem):
            continue
        if exclude_ref and (problem.coursepack_id, problem.problem_id) == exclude_ref:
            continue

        score = 0
        problem_knowledge = session.execute(
            select(ProblemKnowledge.knowledge_id).where(
                ProblemKnowledge.coursepack_id == problem.coursepack_id,
                ProblemKnowledge.problem_id == problem.problem_id,
            )
        ).scalars().all()
        score += len(knowledge_set & set(problem_knowledge)) * 3

        statement = problem.statement or ""
        score += sum(1 for token in tokens if token in statement)

        if score > 0:
            scored.append((score, problem))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [problem for _, problem in scored[:limit]]
