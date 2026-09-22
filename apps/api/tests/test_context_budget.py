from mirror_api.context_budget import MAX_USER_BYTES, bounded_context, fit_user_sections
from mirror_api.llm import MirrorContext


def test_material_budget_preserves_locators_and_latest_turns():
    original = MirrorContext(course_name="数分", mirror_name="数分", interaction_mode="chat",
        knowledge=[{"knowledge_id": str(i), "locator": "第2章第3节，原书第40页",
                    "statement": "定义" * 20000} for i in range(100)],
        history=[{"question": str(i), "answer": "推导" * 20000} for i in range(12)])
    bounded = bounded_context(original)
    assert len(bounded.knowledge) < 8
    assert all("第40页" in n["locator"] for n in bounded.knowledge)
    assert bounded.history[-1]["question"] == "11"
    assert len(original.knowledge) == 100
    assert "上下文已截短" in bounded.knowledge[0]["statement"]


def test_latest_question_survives_large_context_with_utf8_limit():
    message = "学生本次补充/证明草稿：最新问题" + "量词" * 2990
    prompt = fit_user_sections(["材料" * 100000, "历史" * 100000, message])
    assert prompt.startswith("学生本次补充/证明草稿：最新问题")
    assert len(prompt.encode("utf-8")) <= MAX_USER_BYTES
    assert "上下文已截短" in prompt
