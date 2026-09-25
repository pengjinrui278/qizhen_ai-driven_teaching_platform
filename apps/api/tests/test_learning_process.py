from test_platform import pilot, register, attempt, message, app
from mirror_api.memory import detect_theme
from mirror_api.models import LearningEvidenceRow


def test_questions_alone_do_not_diagnose_weakness():
    assert detect_theme("为什么这个定理需要这个条件？") is None
    assert detect_theme("我不理解 ε-δ 中的依赖顺序") == "quantifiers"
    assert detect_theme("我不懂 CNN 的用途") is None


def test_hint_and_outcome_evidence_are_weak_and_idempotent(pilot):
    register(pilot, "process_evidence")
    aid = attempt(pilot)
    result = message(pilot, aid, "process-hint-1", text="我不懂条件")
    evidence = result.json()["evidence"]
    hint = next(item for item in evidence if item["event_type"] == "hint_requested")
    assert hint["reasoning_stage"] == "hint_1" and hint["strength"] == "weak"
    body = {"request_id": "process-outcome-1", "outcome": "solved", "theme": "conditions"}
    for _ in range(2):
        assert pilot.post(f"/api/v2/attempts/{aid}/feedback", json=body).status_code == 200
    with app.state.session_factory() as db:
        rows = db.query(LearningEvidenceRow).filter_by(event_type="student_outcome_reported").all()
        assert len(rows) == 1 and rows[0].strength == "weak"
        assert "独立性未验证" in rows[0].observation
