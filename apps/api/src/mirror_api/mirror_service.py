"""通用 Course Mirror 请求管线（阶段 1 基座版）。

流程：协议校验 → 课程/教材 Profile 定位 → 题目与知识检索（授权门控）
→ 提示级别决策 → 模型网关生成 → 学科 Harness 检查 → 事件与学习证据落库。

设计约束：

- 任何模型（占位或真实大模型）都必须走这条管线，不能绕过契约；
- ``request_id`` 幂等：重复请求直接回放首次结果；
- 学习证据只是草稿（observation），不打分、不贴标签。
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .domain import (
    CourseCitation,
    CourseMirrorRequest,
    CourseMirrorResponse,
    HarnessCheck,
    HarnessResult,
    InteractionMode,
    LearningEvidenceDraft,
)
from .llm import LanguageModel, MirrorContext
from .models import Course, CourseProfileRow, LearningEvidenceRow, MirrorEvent, ProblemHint
from .retrieval import (
    course_pack_ids,
    find_problem,
    knowledge_for_problem,
    rag_allowed,
    runtime_allowed,
    search_knowledge,
)

HINT_MODES = (InteractionMode.FIRST_HINT, InteractionMode.NEXT_HINT)
MAX_HINT_LEVEL = 7


class MirrorError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class MirrorPipeline:
    def __init__(self, model: LanguageModel):
        self.model = model

    def handle(self, session: Session, request: CourseMirrorRequest) -> CourseMirrorResponse:
        existing = session.get(MirrorEvent, request.request_id)
        if existing is not None:
            return CourseMirrorResponse.model_validate(existing.response_json)

        course = session.get(Course, request.course_id)
        if course is None:
            raise MirrorError(404, f"课程不存在：{request.course_id}")
        profile = session.get(CourseProfileRow, (request.course_id, request.course_profile_id))
        if profile is None:
            raise MirrorError(404, f"课程 Profile 不存在：{request.course_profile_id}")

        pack_ids = course_pack_ids(session, request.course_id, request.course_profile_id)
        uncertainty: list[str] = []
        if not pack_ids:
            uncertainty.append("该课程尚未导入任何 CoursePack，回答仅能依据通用策略。")

        problem = find_problem(session, pack_ids, request.problem)
        if problem is not None and not runtime_allowed(problem):
            uncertainty.append("命中的题目授权范围不允许运行时使用，已按未命中处理。")
            problem = None

        if problem is not None:
            knowledge = [node for node in knowledge_for_problem(session, problem) if rag_allowed(node)]
        else:
            knowledge = [
                node
                for node in search_knowledge(session, pack_ids, request.problem.text or "")
                if rag_allowed(node)
            ]

        hint_level, hints_exhausted = self._decide_hint_level(session, request, problem)

        hints: list[dict] = []
        if problem is not None:
            hint_rows = session.execute(
                select(ProblemHint)
                .where(
                    ProblemHint.coursepack_id == problem.coursepack_id,
                    ProblemHint.problem_id == problem.problem_id,
                )
                .order_by(ProblemHint.level)
            ).scalars()
            hints = [
                {"level": row.level, "type": row.hint_type, "content": row.content}
                for row in hint_rows
            ]

        context = MirrorContext(
            course_name=course.display_name,
            mirror_name=course.mirror_name,
            interaction_mode=request.interaction_mode.value,
            hint_level=hint_level,
            hints_exhausted=hints_exhausted,
            problem_statement=problem.statement if problem else request.problem.text,
            hints=hints,
            solution_paths=list(problem.solution_paths) if problem else [],
            knowledge=[
                {"knowledge_id": node.knowledge_id, "title": node.title, "statement": node.statement}
                for node in knowledge
            ],
            common_mistakes=list(problem.common_mistakes) if problem else [],
        )
        answer = self.model.generate(context)

        citations = [
            CourseCitation(
                source_id=node.coursepack_id,
                knowledge_id=node.knowledge_id,
                locator=node.title,
            )
            for node in knowledge
        ]

        harness = self._run_harness(profile.harnesses, request, problem, answer, citations)
        evidence = self._draft_evidence(request, problem, knowledge)

        response = CourseMirrorResponse(
            request_id=request.request_id,
            course_id=request.course_id,
            answer=answer,
            answer_type=self._answer_type(request, problem, knowledge),
            hint_level=hint_level,
            citations=citations,
            harness=harness,
            evidence=evidence,
            uncertainty=uncertainty,
        )

        session.add(
            MirrorEvent(
                request_id=request.request_id,
                course_id=request.course_id,
                profile_id=request.course_profile_id,
                interaction_mode=request.interaction_mode.value,
                problem_ref=problem.problem_id if problem else None,
                hint_level=hint_level,
                request_payload=request.model_dump(mode="json"),
                response_json=response.model_dump(mode="json"),
            )
        )
        # 证据行通过外键引用事件行：ORM 没有关系对象时不保证 flush 顺序，
        # 先 flush 事件，避免子表先于父表落库（PostgreSQL 外键会拒绝）。
        session.flush()
        for draft in evidence:
            session.add(
                LearningEvidenceRow(
                    evidence_id=uuid.uuid4().hex,
                    request_id=request.request_id,
                    course_id=request.course_id,
                    event_type=draft.event_type,
                    observation=draft.observation,
                    reasoning_stage=draft.reasoning_stage,
                    related_knowledge_ids=draft.related_knowledge_ids,
                    strength=draft.strength.value,
                    source_event_ids=draft.source_event_ids,
                    occurred_at=draft.occurred_at,
                )
            )
        session.commit()
        return response

    def _decide_hint_level(self, session, request, problem) -> tuple[int | None, bool]:
        """返回 (本次提示级别, 提示阶梯是否已用完)。"""
        if request.interaction_mode not in HINT_MODES or problem is None:
            return None, False
        if request.interaction_mode is InteractionMode.FIRST_HINT:
            return 1, False
        past_max = session.execute(
            select(func.max(MirrorEvent.hint_level)).where(
                MirrorEvent.course_id == request.course_id,
                MirrorEvent.problem_ref == problem.problem_id,
                MirrorEvent.interaction_mode.in_([mode.value for mode in HINT_MODES]),
            )
        ).scalar()
        max_available = session.execute(
            select(func.max(ProblemHint.level)).where(
                ProblemHint.coursepack_id == problem.coursepack_id,
                ProblemHint.problem_id == problem.problem_id,
            )
        ).scalar()
        cap = min(max_available or MAX_HINT_LEVEL, MAX_HINT_LEVEL)
        if (past_max or 0) >= cap:
            return cap, True
        return min((past_max or 0) + 1, cap), False

    def _answer_type(self, request, problem, knowledge) -> str:
        if problem is not None or knowledge:
            return request.interaction_mode.value
        return "fallback_guidance"

    def _run_harness(self, harness_names, request, problem, answer, citations) -> HarnessResult:
        checks: list[HarnessCheck] = []

        # 平台级安全栏：提示模式严禁泄露解法关键步骤（对所有课程生效）。
        if request.interaction_mode in HINT_MODES and problem is not None:
            leaked_steps = [
                step
                for path in problem.solution_paths
                for step in path.get("key_steps", [])
                if isinstance(step, str) and len(step) > 4 and step in answer
            ]
            checks.append(
                HarnessCheck(
                    name="answer_leakage",
                    status="failed" if leaked_steps else "passed",
                    detail="提示中泄露了解法关键步骤" if leaked_steps else "提示未泄露解法关键步骤",
                )
            )

        checks.append(
            HarnessCheck(
                name="citation_presence",
                status="passed" if citations else "uncertain",
                detail="响应包含课程材料引用"
                if citations
                else "响应未包含课程引用，可能缺少相关课程材料。",
            )
        )

        implemented = {check.name for check in checks}
        for name in harness_names:
            if name in implemented:
                continue
            checks.append(
                HarnessCheck(
                    name=name,
                    status="not_run",
                    detail="阶段 1 基座仅登记该 Harness，学科检查待实现。",
                )
            )

        statuses = [check.status for check in checks]
        if "failed" in statuses:
            overall = "failed"
        elif "uncertain" in statuses:
            overall = "uncertain"
        elif statuses and all(status == "passed" for status in statuses):
            overall = "passed"
        else:
            overall = "not_run"
        return HarnessResult(status=overall, checks=checks)

    def _draft_evidence(self, request, problem, knowledge) -> list[LearningEvidenceDraft]:
        now = datetime.now(UTC)
        drafts = [
            LearningEvidenceDraft(
                event_type="help_request_received",
                observation="本次会话收到一次课程帮助请求；尚不能据此形成长期能力判断。",
                strength="weak",
                source_event_ids=[request.request_id],
                occurred_at=now,
            )
        ]
        if problem is not None:
            drafts.append(
                LearningEvidenceDraft(
                    event_type="problem_engaged",
                    observation=(
                        f"学生在题目 {problem.problem_id} 上请求了"
                        f"{request.interaction_mode.value}；涉及知识节点见关联列表。"
                    ),
                    related_knowledge_ids=[node.knowledge_id for node in knowledge],
                    strength="weak",
                    source_event_ids=[request.request_id],
                    occurred_at=now,
                )
            )
        return drafts
