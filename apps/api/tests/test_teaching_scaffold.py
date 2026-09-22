import pytest

from mirror_api.llm import MirrorContext, OpenAICompatibleModel, StubMirrorModel
from mirror_api.teaching_scaffold import HINT_SCAFFOLDS, scaffold_policy


@pytest.mark.parametrize("mode", ["chat", "first_hint", "next_hint", "full_solution"])
@pytest.mark.parametrize("level", range(1, 8))
def test_live_modes_preserve_guidance_and_level(monkeypatch, mode, level):
    captured = {}

    def complete(base, key, payload, timeout):
        captured.update(payload)
        return "请先核对定义。"

    monkeypatch.setattr("mirror_api.llm.complete", complete)
    model = OpenAICompatibleModel("https://example.invalid", "fixture", "fixture")
    model.generate(MirrorContext(
        course_name="新课程", mirror_name="课程助手", course_id="new_course",
        interaction_mode=mode, hint_level=level, dynamic_hints=True,
        solution_paths=[{"key_steps": ["PRIVATE_COMPLETE_SOLUTION"]}],
    ))
    system = captured["messages"][0]["content"]
    assert "不能直接交付完整答案" in system
    assert HINT_SCAFFOLDS[level - 1] in system
    assert f"第 {level} 级提示" in captured["messages"][1]["content"]
    assert "PRIVATE_COMPLETE_SOLUTION" not in str(captured)
    assert "完全不会" in system and "卡住" in system
    assert "不编造引文或出处" in system


def test_offline_full_solution_cannot_disclose_key_steps():
    answer = StubMirrorModel().generate(MirrorContext(
        course_name="数分", mirror_name="数分", interaction_mode="full_solution",
        solution_paths=[{"key_steps": ["PRIVATE_COMPLETE_SOLUTION"]}],
    ))
    assert "PRIVATE_COMPLETE_SOLUTION" not in answer
    assert "框架" in answer


def test_ai_literacy_keeps_direct_answer_boundary():
    policy = scaffold_policy("ai_literacy", 7)
    assert "直接解释" in policy and "不评估" in policy
    assert "本轮提示等级" not in policy


def test_dynamic_hint_progression_cap_and_attempt_isolation(session):
    from mirror_api.domain import CourseMirrorRequest
    from mirror_api.mirror_service import MirrorPipeline

    class Model:
        name = "fixture"
        dynamic_hints = True

        def generate(self, context):
            return "请写出你已确认的条件。"

    pipeline = MirrorPipeline(Model())

    def send(number, mode="next_hint", attempt="attempt-a", participant="student-a"):
        return pipeline.handle(session, CourseMirrorRequest(
            request_id=f"progress-{number}", course_id="mathematical_analysis",
            course_profile_id="chen-jixiu-3e", problem={"text": "自拟问题"},
            interaction_mode=mode, attempt_id=attempt, participant_code=participant,
        ))

    for level in range(1, 8):
        response = send(level)
        assert response.hint_level == level
        assert not response.hints_exhausted
    assert send(8).hints_exhausted
    assert send(9, "first_hint").hint_level == 7
    assert send(10, attempt="attempt-b").hint_level == 1
    assert send(11, participant="student-b").hint_level == 1
