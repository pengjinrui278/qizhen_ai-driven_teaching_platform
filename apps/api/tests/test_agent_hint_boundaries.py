"""Synthetic pipeline checks; model doubles do not establish real teaching quality."""
import pytest

from mirror_api.db import init_db, make_engine, make_session_factory
from mirror_api.domain import CourseMirrorRequest
from mirror_api.llm import StubMirrorModel
from mirror_api.mirror_service import MirrorPipeline
from mirror_api.models import (
    Course,
    CoursePack,
    CourseProfileRow,
    MirrorEvent,
    Problem,
    ProblemHint,
)


@pytest.fixture()
def agent_db(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'agent-hints.sqlite'}")
    init_db(engine)
    with make_session_factory(engine)() as db:
        db.add(Course(course_id="synthetic", display_name="合成课程",
                      mirror_name="测试助手", stage="extension"))
        db.flush()
        db.add(CourseProfileRow(course_id="synthetic", profile_id="v1"))
        db.add(CoursePack(coursepack_id="synthetic-pack", course_id="synthetic",
                          profile_id="v1", status="schema_trial"))
        db.flush()
        db.add(Problem(coursepack_id="synthetic-pack", problem_id="exercise",
                       type="problem", provenance="team_authored", statement="合成练习",
                       answer_type="proof", rights={"allowed_for_runtime": True},
                       solution_paths=[{"key_steps": ["合成答案不得直接展示"]}]))
        db.flush()
        db.commit()
        yield db
    engine.dispose()


def request(number, mode="next_hint", **changes):
    payload = {"request_id": f"agent-{number}", "course_id": "synthetic",
               "course_profile_id": "v1", "participant_code": "student", "attempt_id": "attempt",
               "interaction_mode": mode, "problem": {"problem_id": "exercise"}}
    payload.update(changes)
    return CourseMirrorRequest(**payload)


class DynamicDouble:
    name = "offline-dynamic-double"
    dynamic_hints = True

    def generate(self, context):
        return "请核对当前条件。"


@pytest.mark.parametrize("model", [StubMirrorModel(), DynamicDouble()])
def test_three_levels_exhaustion_replay_and_first_hint(agent_db, model):
    pipeline = MirrorPipeline(model)
    for level in range(1, 4):
        response = pipeline.handle(agent_db, request(level))
        assert response.hint_level == level
        assert not response.hints_exhausted
    replay = pipeline.handle(agent_db, request(3))
    assert replay.hint_level == 3 and not replay.hints_exhausted
    for number, mode in [(8, "next_hint"), (9, "first_hint"), (10, "next_hint")]:
        response = pipeline.handle(agent_db, request(number, mode))
        assert response.hint_level == 3
        assert response.hints_exhausted
    fresh = pipeline.handle(agent_db, request(11, attempt_id="fresh"))
    assert fresh.hint_level == 1 and not fresh.hints_exhausted


def test_legacy_static_ladder_does_not_cap_new_scale(agent_db):
    agent_db.add_all([ProblemHint(coursepack_id="synthetic-pack", problem_id="exercise",
                                 level=i, hint_type="direction", content=f"合成提示{i}")
                      for i in (1, 2)])
    agent_db.commit()
    pipeline = MirrorPipeline(StubMirrorModel())
    assert pipeline.handle(agent_db, request(1)).hint_level == 1
    assert pipeline.handle(agent_db, request(2)).hint_level == 2
    third = pipeline.handle(agent_db, request(3))
    assert third.hint_level == 3 and not third.hints_exhausted
    assert "合成提示" not in third.answer
    response = pipeline.handle(agent_db, request(4, "first_hint"))
    assert response.hint_level == 3 and response.hints_exhausted
    assert "提示阶梯已经用完" in response.answer


def test_failed_answer_does_not_consume_next_hint(agent_db):
    class FailingDouble(DynamicDouble):
        def generate(self, context):
            return "合成答案不得直接展示"

    pipeline = MirrorPipeline(FailingDouble())
    response = pipeline.handle(agent_db, request(1))
    assert response.harness.status == "failed"
    assert "合成答案不得直接展示" not in response.answer
    pipeline.model = DynamicDouble()
    assert pipeline.handle(agent_db, request(2)).hint_level == 1


@pytest.mark.parametrize("model", [StubMirrorModel(), DynamicDouble()])
def test_full_solution_enters_three_and_participates_in_exhaustion(agent_db, model):
    pipeline = MirrorPipeline(model)
    response = pipeline.handle(agent_db, request(1, "full_solution"))
    assert response.hint_level == 3 and not response.hints_exhausted
    assert pipeline.handle(agent_db, request(2)).hints_exhausted
    assert pipeline.handle(agent_db, request(3, "first_hint")).hints_exhausted


@pytest.mark.parametrize("mode", ["chat", "concept_explanation", "solution_review"])
def test_non_hint_modes_do_not_advance(agent_db, mode):
    pipeline = MirrorPipeline(DynamicDouble())
    assert pipeline.handle(agent_db, request(1, mode)).hint_level is None
    assert pipeline.handle(agent_db, request(2)).hint_level == 1


@pytest.mark.parametrize("legacy_version", [None, "course-student-v3-guided", "course-student-v4-subject-guided"])
def test_legacy_seven_replays_unchanged_and_does_not_set_new_level(agent_db, legacy_version):
    import copy

    pipeline = MirrorPipeline(DynamicDouble())
    pipeline.handle(agent_db, request(1))
    row = agent_db.get(MirrorEvent, "agent-1")
    old = copy.deepcopy(row.response_json)
    old.update(hint_level=7, answer="历史七级回答", hints_exhausted=True, evidence=[])
    old["decision"] = {"policy_version": legacy_version} if legacy_version else {}
    row.hint_level = 7
    row.response_json = old
    agent_db.commit()
    before = copy.deepcopy(row.response_json)
    assert pipeline.handle(agent_db, request(1)).model_dump(mode="json") == before
    assert pipeline.handle(agent_db, request(2)).hint_level == 1
    agent_db.refresh(row)
    assert row.response_json == before and row.hint_level == 7


def test_intermediate_steps_allowed_but_complete_key_path_blocked(agent_db):
    problem = agent_db.get(Problem, ("synthetic-pack", "exercise"))
    problem.solution_paths = [{"key_steps": ["这是必要中间关系", "这是最终核心论证"]}]
    agent_db.commit()

    class Model(DynamicDouble):
        answer = "这是必要中间关系；接下来需要核对条件，再完成核心论证并回代。"

        def generate(self, context):
            return self.answer

    model = Model()
    pipeline = MirrorPipeline(model)
    partial = pipeline.handle(agent_db, request(1, "full_solution"))
    assert partial.harness.status == "uncertain"
    assert "这是必要中间关系" in partial.answer
    model.answer = "这是必要中间关系，这是最终核心论证"
    complete = pipeline.handle(agent_db, request(2, "full_solution", attempt_id="new"))
    assert complete.harness.status == "failed"
