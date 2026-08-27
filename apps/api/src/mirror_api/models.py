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


class MirrorEvent(Base):
    __tablename__ = "mirror_events"

    request_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    course_id: Mapped[str] = mapped_column(String(64), index=True)
    profile_id: Mapped[str] = mapped_column(String(64))
    interaction_mode: Mapped[str] = mapped_column(String(32))
    problem_ref: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    hint_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
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
