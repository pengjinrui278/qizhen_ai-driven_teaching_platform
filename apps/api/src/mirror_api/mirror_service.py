"""通用 Course Mirror 请求管线（阶段 1 基座版）。

流程：协议校验 → 课程/教材 Profile 定位 → 题目与知识检索（授权门控）
→ 提示级别决策 → 模型网关生成 → 学科 Harness 检查 → 事件与学习证据落库。

设计约束：

- 任何模型（占位或真实大模型）都必须走这条管线，不能绕过契约；
- ``request_id`` 幂等：重复请求直接回放首次结果；
- 学习证据只是草稿（observation），不打分、不贴标签。
"""

from __future__ import annotations

import re
import uuid
import threading
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
from .models import (
    AssignmentWorkspace,
    Course,
    CourseProfileRow,
    LearningEvidenceRow,
    MirrorEvent,
    ProblemHint,
)
from .retrieval import (
    course_pack_ids,
    find_problem,
    knowledge_for_problem,
    rag_allowed,
    runtime_allowed,
    search_knowledge,
    search_textbook_chunks,
)

HINT_MODES = (InteractionMode.FIRST_HINT, InteractionMode.NEXT_HINT)
MAX_HINT_LEVEL = 7
_LOCKS = [threading.RLock() for _ in range(64)]


class MirrorError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class MirrorPipeline:
    def __init__(self, model: LanguageModel):
        self.model = model

    def handle(self, session: Session, request: CourseMirrorRequest) -> CourseMirrorResponse:
        key=(request.participant_code,request.attempt_id,request.course_id)
        with _LOCKS[hash(key)%len(_LOCKS)]:
            return self._handle(session,request)

    def _handle(self, session: Session, request: CourseMirrorRequest) -> CourseMirrorResponse:
        existing = session.get(MirrorEvent, request.request_id)
        if existing is not None:
            old = existing.request_payload
            if (existing.participant_code != request.participant_code
                or existing.course_id != request.course_id
                or existing.profile_id != request.course_profile_id
                or old.get("attempt_id") != request.attempt_id
                or old.get("interaction_mode") != request.interaction_mode.value
                or old.get("problem") != request.problem.model_dump(mode="json")
                or old.get("message", "") != request.message):
                raise MirrorError(409, "请求编号已用于另一次操作，请勿复用")
            return CourseMirrorResponse.model_validate(existing.response_json)

        course = session.get(Course, request.course_id)
        if course is None:
            raise MirrorError(404, f"课程不存在：{request.course_id}")
        profile = session.get(CourseProfileRow, (request.course_id, request.course_profile_id))
        if profile is None:
            raise MirrorError(404, f"课程 Profile 不存在：{request.course_profile_id}")

        # 工作区校验只对新事件生效（回放检查在上面已返回）：
        # 已落库 request_id 的回放无条件成功，即使工作区后来被关闭。
        self._validate_workspace(session, request)

        pack_ids = course_pack_ids(session, request.course_id, request.course_profile_id)
        uncertainty: list[str] = []
        if not pack_ids:
            uncertainty.append("该课程尚未导入任何 CoursePack，回答仅能依据通用策略。")

        problem = find_problem(session, pack_ids, request.problem)
        is_student_upload = problem is not None and problem.provenance == "student_submitted"
        if problem is not None and not runtime_allowed(problem):
            # 学生上传题允许进入管线（渐进提示 / 完整解答门控），但给出提示
            if is_student_upload and problem.review.get("owner_id") == request.participant_code:
                uncertainty.append("该题为同学上传，正在审核中，仅提供渐进提示。")
            else:
                uncertainty.append("命中的题目授权范围不允许运行时使用，已按未命中处理。")
                problem = None

        retrieval_query=(request.message+" "+(request.problem.text or ""))[:2200]
        if problem is not None and request.interaction_mode is not InteractionMode.CHAT:
            knowledge = [node for node in knowledge_for_problem(session, problem) if rag_allowed(node)]
        else:
            knowledge = [
                node
                for node in search_knowledge(session, pack_ids, retrieval_query)
                if rag_allowed(node)
            ]

        # 补充教材文本块（授权 RAG 门控后）作为额外上下文
        chunks = search_textbook_chunks(
            session, request.course_id,
            retrieval_query or (problem.statement if problem else ""), limit=3
        )

        hint_level, hints_exhausted = self._decide_hint_level(session, request, problem)

        dynamic_hints = bool(getattr(self.model, "dynamic_hints", False)) and request.course_id != "ai_literacy"
        hints: list[dict] = []
        if problem is not None and not dynamic_hints:
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
            course_id=request.course_id,
            course_name=course.display_name,
            mirror_name=course.mirror_name,
            interaction_mode=request.interaction_mode.value,
            hint_level=hint_level,
            hints_exhausted=hints_exhausted,
            dynamic_hints=dynamic_hints,
            problem_statement=problem.statement if problem else request.problem.text,
            hints=hints,
            solution_paths=list(problem.solution_paths) if problem else [],
            knowledge=[
                {"knowledge_id": node.knowledge_id, "title": node.title, "statement": node.statement,
                 "conditions": node.conditions, "prerequisites": node.prerequisites,
                 "locator": node.source.get("locator") or node.title}
                for node in knowledge
            ]
            + [
                {"knowledge_id": chunk.chunk_id, "title": chunk.title or chunk.source_id, "statement": chunk.content}
                for chunk in chunks
            ],
            common_mistakes=list(problem.common_mistakes) if problem else [],
            student_context=request.student_context.model_dump(),
            message=request.message,
            history=request.history,
        )
        answer = self.model.generate(context)

        citations = [
            CourseCitation(
                source_id=node.coursepack_id,
                knowledge_id=node.knowledge_id,
                locator=node.source.get("locator") or node.title,
            )
            for node in knowledge
        ] + [
            CourseCitation(
                source_id=chunk.source_id,
                knowledge_id=chunk.chunk_id,
                locator=chunk.locator or chunk.title,
            )
            for chunk in chunks
        ]

        harness = self._run_harness(profile.harnesses, request, problem, answer, citations)
        if harness.status == "failed":
            answer = "这次生成的内容没有通过检查，已停止展示。请换一种问法，或请教师/TA核对。"
            uncertainty.append("原始生成内容已被阻断，不能作为学习依据。")
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
            model=self.model.name,
            decision={
                "policy_version": "course-student-v2",
                "context": request.student_context.model_dump(),
                "attempt_id": request.attempt_id,
                "coursepack": problem.coursepack_id if problem else None,
            },
        )

        session.add(
            MirrorEvent(
                request_id=request.request_id,
                course_id=request.course_id,
                profile_id=request.course_profile_id,
                interaction_mode=request.interaction_mode.value,
                problem_ref=problem.problem_id if problem else None,
                hint_level=hint_level,
                participant_code=request.participant_code,
                assignment_workspace_id=request.assignment_workspace_id,
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

    def _validate_workspace(self, session: Session, request: CourseMirrorRequest) -> None:
        if request.assignment_workspace_id is None:
            return
        workspace = session.get(AssignmentWorkspace, request.assignment_workspace_id)
        if workspace is None:
            raise MirrorError(404, f"作业工作区不存在：{request.assignment_workspace_id}")
        if workspace.status != "open":
            raise MirrorError(404, "作业工作区已关闭，不再接收新请求")
        if workspace.course_id != request.course_id:
            raise MirrorError(400, "作业工作区所属课程与请求课程不一致")
        if workspace.profile_id != request.course_profile_id:
            raise MirrorError(400, "Sandbox教材版本与请求不一致")
        if not request.participant_code:
            raise MirrorError(400, "挂到作业工作区的请求必须携带匿名参与码")

    def _decide_hint_level(self, session, request, problem) -> tuple[int | None, bool]:
        """返回 (本次提示级别, 提示阶梯是否已用完)。"""
        if request.interaction_mode not in HINT_MODES:
            return None, False
        if request.interaction_mode is InteractionMode.FIRST_HINT:
            return 1, False
        past = session.execute(
            select(MirrorEvent).where(
                MirrorEvent.course_id == request.course_id,
                MirrorEvent.profile_id == request.course_profile_id,
                MirrorEvent.participant_code == request.participant_code,
                MirrorEvent.problem_ref == (problem.problem_id if problem else None),
                MirrorEvent.interaction_mode.in_([mode.value for mode in HINT_MODES]),
            )
        ).scalars().all()
        past_max = max((row.hint_level or 0 for row in past
                        if row.request_payload.get("attempt_id") == request.attempt_id
                        and row.response_json.get("harness", {}).get("status") != "failed"), default=0)
        if getattr(self.model, "dynamic_hints", False) and request.course_id != "ai_literacy":
            return min(past_max + 1, MAX_HINT_LEVEL), False
        max_available = session.execute(
            select(func.max(ProblemHint.level)).where(
                ProblemHint.coursepack_id == problem.coursepack_id,
                ProblemHint.problem_id == problem.problem_id,
            )
        ).scalar() if problem else MAX_HINT_LEVEL
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

        # 动态安全栏：学生上传题的提示中禁止出现直接答案表达。
        if request.interaction_mode in HINT_MODES and problem is not None and problem.provenance == "student_submitted":
            direct_answer_patterns = [
                r"答案是\s*[：:]",
                r"(?<!不)等于\s*[：:]",
                r"(?<!不)为\s*[：:]",
                r"[\d\s]+\s*[=＝]\s*[\d\s]+",
            ]
            leaked = any(re.search(p, answer) for p in direct_answer_patterns)
            checks.append(
                HarnessCheck(
                    name="dynamic_hint_safety",
                    status="failed" if leaked else "passed",
                    detail="上传题提示包含直接答案表达" if leaked else "上传题提示未直接泄露答案",
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
