from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


class InteractionMode(StrEnum):
    FIRST_HINT = "first_hint"
    NEXT_HINT = "next_hint"
    FULL_SOLUTION = "full_solution"
    SOLUTION_REVIEW = "solution_review"
    CONCEPT_EXPLANATION = "concept_explanation"


class EvidenceStrength(StrEnum):
    WEAK = "weak"
    MEDIUM = "medium"
    STRONG = "strong"


class SourceRights(BaseModel):
    allowed_for_runtime: bool = True
    allowed_for_rag: bool = False
    allowed_for_eval: bool = False
    allowed_for_training: bool = False
    license_note: str


class SourceRef(BaseModel):
    source_id: str
    title: str
    locator: str | None = None
    rights: SourceRights


class MinimalStudentContext(BaseModel):
    relevant_knowledge_states: list[str] = Field(default_factory=list, max_length=12)
    relevant_hypotheses: list[str] = Field(default_factory=list, max_length=5)
    recent_help_pattern: list[str] = Field(default_factory=list, max_length=5)


class ProblemInput(BaseModel):
    text: str | None = None
    image_ids: list[str] = Field(default_factory=list)
    problem_id: str | None = None


class CourseMirrorRequest(BaseModel):
    request_id: str
    course_id: str
    course_profile_id: str
    student_context: MinimalStudentContext = Field(default_factory=MinimalStudentContext)
    problem: ProblemInput
    interaction_mode: InteractionMode
    assignment_workspace_id: str | None = None


class CourseCitation(BaseModel):
    source_id: str
    knowledge_id: str | None = None
    locator: str | None = None


class HarnessCheck(BaseModel):
    name: str
    status: Literal["passed", "failed", "uncertain", "not_run"]
    detail: str


class HarnessResult(BaseModel):
    status: Literal["passed", "failed", "uncertain", "not_run"]
    checks: list[HarnessCheck] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class LearningEvidenceDraft(BaseModel):
    event_type: str
    observation: str
    reasoning_stage: str | None = None
    related_knowledge_ids: list[str] = Field(default_factory=list)
    strength: EvidenceStrength = EvidenceStrength.WEAK
    source_event_ids: list[str] = Field(default_factory=list)
    occurred_at: datetime


class CourseMirrorResponse(BaseModel):
    request_id: str
    course_id: str
    answer: str
    answer_type: str
    hint_level: int | None = Field(default=None, ge=1, le=7)
    citations: list[CourseCitation] = Field(default_factory=list)
    harness: HarnessResult
    evidence: list[LearningEvidenceDraft] = Field(default_factory=list)
    uncertainty: list[str] = Field(default_factory=list)


class CourseProfile(BaseModel):
    course_id: str
    display_name: str
    mirror_name: str
    stage: Literal["flagship", "extension"]
    profile_id: str
    knowledge_forms: list[str]
    capabilities: list[str]
    harnesses: list[str]
    source_refs: list[SourceRef] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

