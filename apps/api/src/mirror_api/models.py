"""阶段 1 数据库模型（单一事实来源）。

说明：

- JSON 列暂用 SQLAlchemy 通用 ``JSON`` 类型（在 PostgreSQL 上落为 TEXT），
  等检索/查询压力上来后再迁移 JSONB；向量列目前为占位的
  ``embedding_json``，真正接入嵌入模型后改用 pgvector（基础设施已就绪）。
- 所有课程材料都带来源与授权字段（见 data-rights.md）：
  检索只允许使用 ``allowed_for_rag=True`` 的条目，运行时呈现只允许
  ``allowed_for_runtime=True`` 的条目。
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Course(Base):
    __tablename__ = "courses"

    course_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(128))
    mirror_name: Mapped[str] = mapped_column(String(128))
    stage: Mapped[str] = mapped_column(String(32))  # flagship / extension
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CourseProfileRow(Base):
    __tablename__ = "course_profiles"

    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.course_id"), primary_key=True
    )
    profile_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    knowledge_forms: Mapped[list] = mapped_column(JSON, default=list)
    capabilities: Mapped[list] = mapped_column(JSON, default=list)
    harnesses: Mapped[list] = mapped_column(JSON, default=list)
    source_refs: Mapped[list] = mapped_column(JSON, default=list)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CoursePack(Base):
    __tablename__ = "coursepacks"

    coursepack_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.course_id"), index=True)
    profile_id: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32))  # schema_trial / review / published
    textbook: Mapped[dict] = mapped_column(JSON, default=dict)
    content_policy: Mapped[str] = mapped_column(Text, default="")
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class KnowledgeNode(Base):
    __tablename__ = "knowledge_nodes"

    coursepack_id: Mapped[str] = mapped_column(
        ForeignKey("coursepacks.coursepack_id"), primary_key=True
    )
    knowledge_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    type: Mapped[str] = mapped_column(String(32))  # definition / theorem / ...
    title: Mapped[str] = mapped_column(String(256))
    statement: Mapped[str] = mapped_column(Text)
    prerequisites: Mapped[list] = mapped_column(JSON, default=list)
    relations: Mapped[list] = mapped_column(JSON, default=list)
    conditions: Mapped[list] = mapped_column(JSON, default=list)
    conclusion: Mapped[str | None] = mapped_column(Text, nullable=True)
    common_misuses: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[dict] = mapped_column(JSON, default=dict)  # 来源与授权（检索门控）
    review: Mapped[dict] = mapped_column(JSON, default=dict)
    embedding_json: Mapped[str | None] = mapped_column(Text, nullable=True)


class Problem(Base):
    __tablename__ = "problems"

    coursepack_id: Mapped[str] = mapped_column(
        ForeignKey("coursepacks.coursepack_id"), primary_key=True
    )
    problem_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    type: Mapped[str] = mapped_column(String(32))
    provenance: Mapped[str] = mapped_column(String(64))
    statement: Mapped[str] = mapped_column(Text)
    answer_type: Mapped[str] = mapped_column(String(32))
    solution_paths: Mapped[list] = mapped_column(JSON, default=list)
    common_mistakes: Mapped[list] = mapped_column(JSON, default=list)
    rights: Mapped[dict] = mapped_column(JSON, default=dict)  # 运行时/RAG/Eval/训练门控
    review: Mapped[dict] = mapped_column(JSON, default=dict)


class ProblemHint(Base):
    __tablename__ = "problem_hints"
    __table_args__ = (
        ForeignKeyConstraint(
            ["coursepack_id", "problem_id"],
            ["problems.coursepack_id", "problems.problem_id"],
        ),
    )

    coursepack_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    problem_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    level: Mapped[int] = mapped_column(Integer, primary_key=True)
    hint_type: Mapped[str] = mapped_column(String(32))
    content: Mapped[str] = mapped_column(Text)


class ProblemKnowledge(Base):
    __tablename__ = "problem_knowledge"
    __table_args__ = (
        ForeignKeyConstraint(
            ["coursepack_id", "problem_id"],
            ["problems.coursepack_id", "problems.problem_id"],
        ),
    )

    coursepack_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    problem_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    knowledge_id: Mapped[str] = mapped_column(String(128), primary_key=True)


class AssignmentWorkspace(Base):
    """作业工作区：某课程 × 某教学班 × 某次作业 × 时间窗口，用完即关闭。

    学生事件通过 ``join_code`` 加入后挂载到工作区；教师/TA 端只消费
    工作区的聚合统计与候选现象，永远不接触事件里的回答内容。
    """

    __tablename__ = "assignment_workspaces"

    workspace_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.course_id"), index=True)
    profile_id: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(256))
    class_label: Mapped[str] = mapped_column(String(128), default="")
    join_code: Mapped[str] = mapped_column(String(32), unique=True)
    status: Mapped[str] = mapped_column(String(16), default="open")  # open / closed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WorkspaceFinding(Base):
    """班级现象候选：AI 产出 → TA 三选一校准 → 教师最终决定，全程留痕。

    ``basis`` 是生成时刻的聚合快照：报告数字一律读快照而不重查，
    保证工作区事件继续增长时周报仍可复现。
    """

    __tablename__ = "workspace_findings"

    finding_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("assignment_workspaces.workspace_id"), index=True
    )
    phenomenon: Mapped[str] = mapped_column(Text)
    basis: Mapped[dict] = mapped_column(JSON, default=dict)
    generator: Mapped[str] = mapped_column(String(128))  # 生成模型名（model.name）
    ta_status: Mapped[str] = mapped_column(String(16), default="candidate")
    ta_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    ta_decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    teacher_status: Mapped[str] = mapped_column(String(16), default="pending")
    teacher_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TextbookChunk(Base):
    """教材文本块：经授权的课程 PDF / 电子教材切分后的 RAG 语料。

    每个块都携带完整的来源与授权字段（allowed_for_rag / allowed_for_eval /
    allowed_for_training / retention_policy / license_note），检索与运行时
    必须按授权门控使用。
    """

    __tablename__ = "textbook_chunks"

    chunk_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    course_id: Mapped[str] = mapped_column(String(64), index=True)
    source_id: Mapped[str] = mapped_column(String(128), index=True)
    locator: Mapped[str | None] = mapped_column(String(256), nullable=True)
    title: Mapped[str | None] = mapped_column(String(256), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    source: Mapped[dict] = mapped_column(JSON, default=dict)
    embedding_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MirrorEvent(Base):
    __tablename__ = "mirror_events"

    request_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    course_id: Mapped[str] = mapped_column(String(64), index=True)
    profile_id: Mapped[str] = mapped_column(String(64))
    interaction_mode: Mapped[str] = mapped_column(String(32))
    problem_ref: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    hint_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 匿名参与码（学生端自动生成的随机码，不含姓名/学号）；
    # 教师端只允许对它做 distinct 计数，禁止按人拆分或展示取值。
    participant_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    assignment_workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("assignment_workspaces.workspace_id"), nullable=True, index=True
    )
    request_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    response_json: Mapped[dict] = mapped_column(JSON, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LearningEvidenceRow(Base):
    __tablename__ = "learning_evidence"

    evidence_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    request_id: Mapped[str] = mapped_column(ForeignKey("mirror_events.request_id"), index=True)
    course_id: Mapped[str] = mapped_column(String(64), index=True)
    event_type: Mapped[str] = mapped_column(String(64))
    observation: Mapped[str] = mapped_column(Text)
    reasoning_stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    related_knowledge_ids: Mapped[list] = mapped_column(JSON, default=list)
    strength: Mapped[str] = mapped_column(String(16))
    source_event_ids: Mapped[list] = mapped_column(JSON, default=list)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
