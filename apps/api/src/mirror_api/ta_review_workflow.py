"""Offline, immutable review-state prototype; no worker, model call or DB side effects.

Actor roles must come from the authenticated service, never from a request body.
Snapshots are prototypes, not a durable queue; callers must supply current
version/expiry/deletion facts again on restore and before persistence.
"""
from dataclasses import asdict, dataclass, replace
from typing import Literal

State = Literal["submitted", "retrieving", "analysing", "awaiting_ta", "awaiting_teacher",
                "confirmed", "rejected", "cancelled", "failed"]
STATES = {"submitted", "retrieving", "analysing", "awaiting_ta", "awaiting_teacher",
          "confirmed", "rejected", "cancelled", "failed"}


@dataclass(frozen=True)
class ReviewWorkflow:
    submission_id: str
    content_version: str
    require_teacher: bool = True
    state: State = "submitted"
    revision: int = 0
    candidate_id: str | None = None
    conclusion: str | None = None
    ta_actor: str | None = None
    ta_decision: str | None = None
    teacher_actor: str | None = None
    teacher_decision: str | None = None

    def start(self, *, eligible: bool, current_version: str):
        if self.state != "submitted":
            raise ValueError("workflow already started")
        return replace(self, state="retrieving" if eligible and current_version == self.content_version
                       else "cancelled", revision=self.revision + 1)

    def evidence_ready(self):
        if self.state != "retrieving":
            raise ValueError("not retrieving")
        return replace(self, state="analysing", revision=self.revision + 1)

    def candidate_ready(self, *, version: str, candidate_id: str, conclusion: str):
        # Late model results cannot re-open a cancelled/reviewed/awaiting workflow.
        if self.state != "analysing" or version != self.content_version:
            return self
        if not candidate_id or not conclusion.strip():
            raise ValueError("empty candidate")
        return replace(self, state="awaiting_ta", candidate_id=candidate_id,
                       conclusion=conclusion, revision=self.revision + 1)

    def decide_ta(self, *, actor_id: str, role: str, decision: str, conclusion: str | None = None):
        if role not in {"ta", "teacher"} or not actor_id:
            raise PermissionError("staff decision required")
        if decision not in {"confirmed", "modified", "rejected"}:
            raise ValueError("unsupported TA decision")
        replacement = conclusion if decision == "modified" else self.conclusion
        if decision == "modified" and (not replacement or not replacement.strip()):
            raise ValueError("modified conclusion required")
        if self.ta_actor == actor_id and self.ta_decision == decision and replacement == self.conclusion:
            return self
        if self.state != "awaiting_ta":
            raise ValueError("not awaiting TA")
        target = "rejected" if decision == "rejected" else (
            "awaiting_teacher" if self.require_teacher else "confirmed")
        return replace(self, state=target, conclusion=replacement, ta_actor=actor_id,
                       ta_decision=decision, revision=self.revision + 1)

    def decide_teacher(self, *, actor_id: str, role: str, decision: str):
        if role != "teacher" or not actor_id:
            raise PermissionError("teacher decision required")
        if decision not in {"accepted", "rejected"}:
            raise ValueError("unsupported teacher decision")
        if self.teacher_actor == actor_id and self.teacher_decision == decision:
            return self
        if self.state != "awaiting_teacher":
            raise ValueError("not awaiting teacher")
        return replace(self, state="confirmed" if decision == "accepted" else "rejected",
                       teacher_actor=actor_id, teacher_decision=decision, revision=self.revision + 1)

    def cancel(self):
        if self.state == "cancelled":
            return self
        return replace(self, state="cancelled", candidate_id=None, conclusion=None,
                       revision=self.revision + 1)

    def fail(self):
        if self.state not in {"retrieving", "analysing"}:
            raise ValueError("only automated nodes can fail")
        return replace(self, state="failed", revision=self.revision + 1)

    def confirmed_output(self):
        if (self.state != "confirmed" or self.ta_decision not in {"confirmed", "modified"}
                or not self.ta_actor or (self.require_teacher and
                (self.teacher_decision != "accepted" or not self.teacher_actor))):
            return None
        return {"submission_id": self.submission_id, "content_version": self.content_version,
                "candidate_id": self.candidate_id, "conclusion": self.conclusion,
                "ta_actor": self.ta_actor, "teacher_actor": self.teacher_actor}

    def snapshot(self):
        return asdict(self)

    @classmethod
    def restore(cls, snapshot, *, current_version: str, deleted=False, expired=False):
        workflow = cls(**snapshot)
        if workflow.state not in STATES or workflow.revision < 0:
            raise ValueError("invalid snapshot state")
        if deleted or expired or current_version != workflow.content_version:
            return workflow.cancel()
        return workflow
