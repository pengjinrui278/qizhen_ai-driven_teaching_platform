"""内测版增量表：不改写旧事件表，旧数据库可无损建表升级。"""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, utcnow


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    nickname: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(16), default="student")
    status: Mapped[str] = mapped_column(String(16), default="active")
    retention_days: Mapped[int] = mapped_column(Integer, default=180)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(64), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Attempt(Base):
    __tablename__ = "student_attempts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(64), index=True)
    course_id: Mapped[str] = mapped_column(String(64), index=True)
    profile_id: Mapped[str] = mapped_column(String(64))
    problem: Mapped[dict] = mapped_column(JSON, default=dict)
    sandbox_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Observation(Base):
    __tablename__ = "student_observations"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(64), index=True)
    course_id: Mapped[str] = mapped_column(String(64), index=True)
    attempt_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    kind: Mapped[str] = mapped_column(String(40))
    theme: Mapped[str] = mapped_column(String(40))
    text: Mapped[str] = mapped_column(Text)
    direction: Mapped[str] = mapped_column(String(16), default="neutral")
    source: Mapped[str] = mapped_column(String(32), default="interaction")
    strength: Mapped[str] = mapped_column(String(16), default="weak")
    disputed: Mapped[bool] = mapped_column(Boolean, default=False)
    correction: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Hypothesis(Base):
    __tablename__ = "student_hypotheses"
    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(64), index=True)
    course_id: Mapped[str] = mapped_column(String(64))
    theme: Mapped[str] = mapped_column(String(40))
    statement: Mapped[str] = mapped_column(Text)
    supporting: Mapped[list] = mapped_column(JSON, default=list)
    contradicting: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="emerging")
    sufficiency: Mapped[str] = mapped_column(String(32), default="不足")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SandboxPolicy(Base):
    __tablename__ = "sandbox_policies"
    workspace_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(64), index=True)
    retention_hours: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    class_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assignment: Mapped[str] = mapped_column(Text, default="")
    frozen_report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SandboxMember(Base):
    __tablename__ = "sandbox_members"
    workspace_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    role: Mapped[str] = mapped_column(String(16), default="student")


class Submission(Base):
    __tablename__ = "assignment_submissions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String(64), index=True)
    account_id: Mapped[str] = mapped_column(String(64), index=True)
    text: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(32), default="artifact")
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False)
    review: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Audit(Base):
    __tablename__ = "decision_audit"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    actor_id: Mapped[str] = mapped_column(String(64))
    target: Mapped[str] = mapped_column(String(160), index=True)
    action: Mapped[str] = mapped_column(String(64))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CourseRevision(Base):
    __tablename__ = "course_revisions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    coursepack_id: Mapped[str] = mapped_column(String(128), index=True)
    actor_id: Mapped[str] = mapped_column(String(64))
    content: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(24), default="draft")
    evaluation: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
