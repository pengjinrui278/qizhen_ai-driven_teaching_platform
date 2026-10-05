"""R3 registration and paired prompt contracts, not real-model effect evaluations."""
import pytest

from mirror_api.agent_policy import POLICY_VERSION
from mirror_api.domain import CourseMirrorRequest
from mirror_api.llm import MirrorContext, OpenAICompatibleModel, StubMirrorModel
from mirror_api.mirror_service import MirrorPipeline
from mirror_api.registry import load_course_profiles, public_profile
from mirror_api.teaching_scaffold import COURSE_HINT_SCAFFOLDS

CASES = [
    ("python_programming", "解释 Python 切片。", "请代写我的整份编程作业。", "未经隔离与授权不运行学生代码"),
    ("electronic_circuits", "解释电路参考方向。", "直接给出作业所有支路的电流答案。", "不提供危险带电实操"),
    ("psychology_applications", "解释相关与因果的区别。", "替我写心理学考核案例分析。", "不从聊天做临床诊断或人格贴标签"),
    ("college_english", "How can I politely ask for help?", "替我完成考试作文。", "不替写考核作文"),
]


@pytest.mark.parametrize("course_id,concept,exercise,boundary", CASES)
def test_registered_without_fabricated_material_or_harness(course_id, concept, exercise, boundary):
    profile = load_course_profiles()[course_id]
    public = public_profile(profile)
    assert public["course_id"] == course_id
    assert public["source_refs"] == []
    assert public["harnesses"] == []
    assert "待" in public["metadata"]["scope_status"]
    assert public["stage"] == "extension"


@pytest.mark.parametrize("course_id,concept,exercise,boundary", CASES)
def test_concept_and_exercise_keep_distinct_contracts(monkeypatch, course_id, concept, exercise, boundary):
    calls = []

    def complete(base, key, payload, timeout):
        calls.append(payload)
        return "离线传输替身"

    monkeypatch.setattr("mirror_api.llm.complete", complete)
    profile = load_course_profiles()[course_id]
    model = OpenAICompatibleModel("https://example.invalid", "fixture", "fixture")
    for mode, message, level in [("chat", concept, None), ("full_solution", exercise, None),
                                  ("next_hint", exercise, 3)]:
        model.generate(MirrorContext(
            course_id=course_id, course_name=profile.display_name, mirror_name=profile.mirror_name,
            interaction_mode=mode, message=message, hint_level=level, dynamic_hints=True,
        ))
        system = calls[-1]["messages"][0]["content"]
        assert boundary in system
        assert message in calls[-1]["messages"][1]["content"]
        assert "概念可以直接解释" in system
        assert "不能直接交付完整答案" in system
        assert "不编造引文或出处" in system
        assert "数分证明" not in system
    assert "本轮提示等级" not in calls[0]["messages"][0]["content"]
    assert "不代交完整考核答案" in calls[1]["messages"][0]["content"]
    assert COURSE_HINT_SCAFFOLDS[course_id][2] in calls[2]["messages"][0]["content"]


def test_existing_courses_remain_registered():
    assert {"mathematical_analysis", "linear_algebra_analytic_geometry", "university_physics",
            "point_set_topology", "ordinary_differential_equations", "ai_literacy"} <= set(load_course_profiles())


@pytest.mark.parametrize("course_id,concept,exercise,boundary", CASES)
def test_seeded_profiles_use_subject_scaffolds_through_pipeline(
    session, monkeypatch, course_id, concept, exercise, boundary
):
    calls = []

    def complete(base, key, payload, timeout):
        calls.append(payload)
        return "离线传输替身"

    monkeypatch.setattr("mirror_api.llm.complete", complete)
    profile = load_course_profiles()[course_id]
    pipeline = MirrorPipeline(OpenAICompatibleModel("https://example.invalid", "fixture", "fixture"))
    for level in range(1, 4):
        response = pipeline.handle(session, CourseMirrorRequest(
            request_id=f"new-course-{level}", course_id=course_id,
            course_profile_id=profile.profile_id, participant_code="synthetic-student",
            attempt_id="synthetic-attempt", interaction_mode="next_hint",
            problem={"text": exercise}, message="请给下一步提示。",
        ))
        assert response.hint_level == level and not response.hints_exhausted
        assert response.citations == []
        assert response.decision["policy_version"] == POLICY_VERSION
        assert COURSE_HINT_SCAFFOLDS[course_id][level - 1] in calls[-1]["messages"][0]["content"]
        assert boundary in calls[-1]["messages"][0]["content"]


@pytest.mark.parametrize("mode", ["first_hint", "next_hint", "full_solution", "chat"])
def test_ai_context_is_direct_without_hint_or_assessment(session, monkeypatch, mode):
    calls = []

    def complete(base, key, payload, timeout):
        calls.append(payload)
        return "合成直接解释"

    monkeypatch.setattr("mirror_api.llm.complete", complete)
    profile = load_course_profiles()["ai_literacy"]
    response = MirrorPipeline(OpenAICompatibleModel("https://example.invalid", "fixture", "fixture")).handle(
        session, CourseMirrorRequest(request_id="ai-direct", course_id="ai_literacy",
            course_profile_id=profile.profile_id, problem={"text": "什么是知识表示"}, interaction_mode=mode)
    )
    assert response.hint_level is None and not response.hints_exhausted
    assert response.evidence == []
    system = calls[0]["messages"][0]["content"]
    assert "直接清楚地回答" in system
    assert "本轮提示等级" not in system and "第3级" not in system


@pytest.mark.parametrize("course_id", list(COURSE_HINT_SCAFFOLDS))
def test_offline_third_level_has_connected_steps_and_distinct_entry(course_id):
    profile = load_course_profiles()[course_id]
    model = StubMirrorModel()
    answers = []
    for message in ("我完全不会，请从零开始。", "我已做了第一步，但卡在中间关系。"):
        answers.append(model.generate(MirrorContext(
            course_id=course_id, course_name=profile.display_name, mirror_name=profile.mirror_name,
            interaction_mode="full_solution", message=message, problem_statement="合成教学审阅题",
        )))
    assert answers[0] != answers[1]
    assert "前置概念" in answers[0] and "所给尝试的有效性" in answers[1]
    assert all("第 3 级" in answer and answer.count("→") >= 3 for answer in answers)
    assert all("不表示已经完成本题求解或验证" in answer for answer in answers)


def test_every_registered_teaching_course_has_exactly_three_scaffolds():
    assert set(COURSE_HINT_SCAFFOLDS) == set(load_course_profiles()) - {"ai_literacy"}
    assert all(len(steps) == 3 for steps in COURSE_HINT_SCAFFOLDS.values())


def test_generated_offline_ladder_contains_only_three_levels():
    import json

    result = StubMirrorModel().generate(MirrorContext(
        course_name="电路", mirror_name="助手", course_id="electronic_circuits",
        interaction_mode="hint_ladder_generation", problem_statement="合成节点电压题",
    ))
    ladder = json.loads(result)
    assert [step["level"] for step in ladder] == [1, 2, 3]
    assert "回代" in ladder[2]["content"]
