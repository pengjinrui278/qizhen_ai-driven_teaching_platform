import pytest

from mirror_api.ta_review_workflow import ReviewWorkflow


def candidate(require_teacher=True):
    graph = ReviewWorkflow("fixture-submission", "digest-v1", require_teacher=require_teacher)
    graph = graph.start(eligible=True, current_version="digest-v1").evidence_ready()
    return graph.candidate_ready(version="digest-v1", candidate_id="fake-model-result",
                                 conclusion="合成待人工核对候选")


def test_human_gates_are_real_wait_states_and_late_results_do_not_overwrite():
    graph = candidate()
    assert graph.state == "awaiting_ta" and graph.confirmed_output() is None
    with pytest.raises(ValueError):
        graph.decide_teacher(actor_id="teacher", role="teacher", decision="accepted")
    reviewed = graph.decide_ta(actor_id="ta", role="ta", decision="modified", conclusion="人工修改")
    assert reviewed.state == "awaiting_teacher" and reviewed.confirmed_output() is None
    assert reviewed.candidate_ready(version="digest-v1", candidate_id="late", conclusion="迟到") == reviewed
    accepted = reviewed.decide_teacher(actor_id="teacher", role="teacher", decision="accepted")
    assert accepted.confirmed_output()["conclusion"] == "人工修改"
    assert accepted.decide_teacher(actor_id="teacher", role="teacher", decision="accepted") == accepted


@pytest.mark.parametrize("teacher", [False, True])
def test_rejection_and_permissions(teacher):
    graph = candidate(teacher)
    with pytest.raises(PermissionError):
        graph.decide_ta(actor_id="student", role="student", decision="confirmed")
    rejected = graph.decide_ta(actor_id="ta", role="ta", decision="rejected")
    assert rejected.confirmed_output() is None and rejected.state == "rejected"
    approved = graph.decide_ta(actor_id="ta", role="ta", decision="confirmed")
    assert approved.decide_ta(actor_id="ta", role="ta", decision="confirmed") == approved
    if teacher:
        with pytest.raises(PermissionError):
            approved.decide_teacher(actor_id="ta", role="ta", decision="accepted")
        assert approved.decide_teacher(actor_id="teacher", role="teacher", decision="rejected").confirmed_output() is None
    else:
        assert approved.confirmed_output() is not None


@pytest.mark.parametrize("facts", [{"deleted": True}, {"expired": True}, {"current_version": "v2"}])
def test_restore_never_revives_deleted_expired_or_changed_material(facts):
    graph = candidate()
    restored = ReviewWorkflow.restore(graph.snapshot(), **{"current_version": "digest-v1", **facts})
    assert restored.state == "cancelled" and restored.conclusion is None
    assert restored.candidate_ready(version="digest-v1", candidate_id="late", conclusion="late") == restored
    assert restored.confirmed_output() is None


def test_offline_snapshot_is_resumable_but_does_not_execute_model_or_decide():
    graph = candidate()
    restored = ReviewWorkflow.restore(graph.snapshot(), current_version="digest-v1")
    assert restored == graph and restored.state == "awaiting_ta"
    assert restored.confirmed_output() is None
    started = ReviewWorkflow("s", "v").start(eligible=True, current_version="v")
    assert started.fail().state == "failed"
    assert ReviewWorkflow("s", "v").start(eligible=False, current_version="v").state == "cancelled"
