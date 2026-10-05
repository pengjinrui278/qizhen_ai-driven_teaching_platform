"""R2 approved semantics, including no late linkage; synthetic accounts only."""
import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
import test_platform_stream_safety as safety_fixtures
from sqlalchemy import event, select
from test_platform import account_client, attempt, message, register

from mirror_api import platform_api
from mirror_api.governance import expire_personal
from mirror_api.main import app
from mirror_api.models import LearningEvidenceRow, MirrorEvent
from mirror_api.platform_models import Account, Audit, Hypothesis, Observation

isolated = safety_fixtures.isolated


def setup_feedback(client, *, outcome="still_stuck", with_event=True):
    user, cookies = register(client, "feedback_owner")
    aid = attempt(client, "合成条件问题")
    if with_event:
        assert message(client, aid, "source-event-001").status_code == 200
    body = {"request_id": "feedback-request-001", "outcome": outcome,
            "theme": "conditions", "note": "合成原始反馈"}
    oid = "feedback:" + body["request_id"]
    eid = hashlib.sha256(oid.encode()).hexdigest()
    assert client.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 200
    return user, cookies, aid, body, oid, eid


def correction(client, oid, disputed=True):
    return client.patch(f"/api/v2/observations/{oid}", json={"disputed": disputed, "note": "合成更正"})


def evidence(eid):
    with app.state.session_factory() as db:
        row = db.get(LearningEvidenceRow, eid)
        return None if row is None else (row.request_id, row.observation, row.reasoning_stage,
                                        row.source_event_ids)


@pytest.mark.parametrize("outcome", ["continued", "solved", "still_stuck", "independent_success"])
def test_retract_retry_restore_use_original_source(isolated, outcome):
    _, _, aid, body, oid, eid = setup_feedback(isolated, outcome=outcome)
    original = evidence(eid)
    with app.state.session_factory() as db:
        facts = {r.evidence_id for r in db.scalars(select(LearningEvidenceRow)) if r.evidence_id != eid}
    for _ in range(2):
        assert correction(isolated, oid).status_code == 200
        assert evidence(eid) is None
    assert message(isolated, aid, "source-event-later").status_code == 200
    assert isolated.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 200
    assert evidence(eid) is None
    for _ in range(2):
        assert correction(isolated, oid, False).status_code == 200
        assert evidence(eid) == original
    with app.state.session_factory() as db:
        assert facts <= set(db.scalars(select(LearningEvidenceRow.evidence_id)))
        assert db.query(Observation).count() == 1
        audits = db.scalars(select(Audit)).all()
        assert len([a for a in audits if a.action == "feedback_source"]) == 1
        assert all("合成原始反馈" not in str(a.detail) and "合成更正" not in str(a.detail) for a in audits)


@pytest.mark.parametrize("change", [{"theme": "construction"}, {"note": "不同正文"},
                                    {"outcome": "solved"}])
def test_changed_semantics_are_conflicts(isolated, change):
    _, _, aid, body, _, eid = setup_feedback(isolated)
    original = evidence(eid)
    assert isolated.post(f"/api/v2/attempts/{aid}/feedback", json={**body, **change}).status_code == 409
    assert evidence(eid) == original
    other = attempt(isolated)
    assert isolated.post(f"/api/v2/attempts/{other}/feedback", json=body).status_code == 409


def test_no_initial_event_never_attaches_later(isolated):
    _, _, aid, body, oid, eid = setup_feedback(isolated, with_event=False)
    assert evidence(eid) is None
    assert message(isolated, aid, "source-event-later").status_code == 200
    assert isolated.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 200
    assert evidence(eid) is None
    assert correction(isolated, oid).status_code == 200
    assert correction(isolated, oid, False).status_code == 200
    assert evidence(eid) is None
    assert isolated.post(f"/api/v2/attempts/{aid}/feedback",
                         json={**body, "note": "改变内容"}).status_code == 409


@pytest.mark.parametrize("corrupt", ["missing_event", "other_account", "wrong_attempt",
                                     "wrong_course", "wrong_type", "wrong_oid"])
def test_restore_rejects_untrusted_source(isolated, corrupt):
    _, _, _, _, oid, eid = setup_feedback(isolated)
    assert correction(isolated, oid).status_code == 200
    with app.state.session_factory() as db:
        audit = db.get(Audit, platform_api._source_audit_id(oid))
        if corrupt == "other_account":
            audit.actor_id = "someone-else"
        else:
            field, value = {"missing_event": ("event_id", "missing"),
                            "wrong_attempt": ("attempt_id", "wrong"),
                            "wrong_course": ("course_id", "wrong"),
                            "wrong_type": ("event_type", "hint_requested"),
                            "wrong_oid": ("observation_id", "feedback:wrong")}[corrupt]
            audit.detail = {**audit.detail, field: value}
        db.commit()
    assert correction(isolated, oid, False).status_code == 200
    assert evidence(eid) is None


def test_ownership_and_account_deletion_clean_source_audits(isolated):
    user, cookies, aid, body, oid, eid = setup_feedback(isolated)
    register(isolated, "feedback_other")
    assert correction(isolated, oid).status_code == 404
    assert isolated.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 404
    other = attempt(isolated)
    assert isolated.post(f"/api/v2/attempts/{other}/feedback", json=body).status_code == 409
    with account_client(cookies) as owner:
        assert owner.post("/api/v2/me/delete", json={"password": "test-only-password",
                                                   "confirmed": True}).status_code == 200
    assert evidence(eid) is None
    with app.state.session_factory() as db:
        assert db.get(Observation, oid) is None
        assert db.get(Audit, platform_api._source_audit_id(oid)) is None
        assert db.get(Account, user["id"]).status == "deleted"
    assert isolated.get(f"/api/v2/attempts/{other}").status_code == 200


def test_expiry_removes_source_association(isolated):
    _, _, _, _, oid, _ = setup_feedback(isolated)
    with app.state.session_factory() as db:
        db.get(Observation, oid).created_at = datetime.now(UTC) - timedelta(days=1000)
        db.commit()
        expire_personal(db)
        assert db.get(Audit, platform_api._source_audit_id(oid)) is None


@pytest.mark.parametrize("stage", ["flush", "commit"])
def test_correction_rolls_back_all_changes(isolated, stage):
    _, _, _, _, oid, eid = setup_feedback(isolated)
    original = evidence(eid)
    session_class = app.state.session_factory.class_
    def fail(db, *args):
        raise RuntimeError("injected transaction failure")
    event_name = "before_flush" if stage == "flush" else "before_commit"
    event.listen(session_class, event_name, fail)
    try:
        with pytest.raises(RuntimeError, match="injected transaction failure"):
            correction(isolated, oid)
    finally:
        event.remove(session_class, event_name, fail)
    assert evidence(eid) == original
    with app.state.session_factory() as db:
        assert not db.get(Observation, oid).disputed
        assert db.query(Audit).filter_by(action="observation_correction").count() == 0


def test_concurrent_retries_and_retraction_do_not_resurrect(isolated):
    _, cookies, aid, body, oid, eid = setup_feedback(isolated)
    def request(retract):
        with account_client(cookies) as client:
            return (correction(client, oid) if retract else
                    client.post(f"/api/v2/attempts/{aid}/feedback", json=body)).status_code
    with ThreadPoolExecutor(max_workers=4) as pool:
        statuses = list(pool.map(request, [False, True, False, True]))
    assert statuses == [200] * 4
    assert evidence(eid) is None
    with app.state.session_factory() as db:
        assert db.get(Observation, oid).disputed
        assert db.query(Hypothesis).count() == 0
        assert db.query(MirrorEvent).count() == 1


def test_legacy_source_is_adopted_and_nonfeedback_evidence_is_preserved(isolated):
    _, _, _, _, oid, eid = setup_feedback(isolated)
    original = evidence(eid)
    with app.state.session_factory() as db:
        db.delete(db.get(Audit, platform_api._source_audit_id(oid)))
        db.commit()
    assert correction(isolated, oid).status_code == 200
    assert evidence(eid) is None
    assert correction(isolated, oid, False).status_code == 200
    assert evidence(eid) == original
    with app.state.session_factory() as db:
        row = db.get(LearningEvidenceRow, eid)
        row.event_type = "hint_requested"
        db.commit()
    assert correction(isolated, oid).status_code == 200
    assert evidence(eid) is not None


def test_parallel_first_feedback_is_persisted_once(isolated):
    _, cookies = register(isolated, "parallel_feedback")
    aid = attempt(isolated)
    assert message(isolated, aid, "parallel-source-001").status_code == 200
    body = {"request_id": "parallel-feedback-001", "outcome": "still_stuck",
            "theme": "conditions", "note": "合成并发反馈"}
    def post(_):
        with account_client(cookies) as client:
            return client.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert list(pool.map(post, range(4))) == [200] * 4
    with app.state.session_factory() as db:
        assert db.query(Observation).count() == 1
        assert db.query(LearningEvidenceRow).filter_by(event_type="student_outcome_reported").count() == 1
        assert db.query(Audit).filter_by(action="feedback_source").count() == 1
