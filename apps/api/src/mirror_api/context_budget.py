"""Conservative UTF-8 byte budgets; not a claim of exact model token counts."""
from dataclasses import replace
import json

MAX_USER_BYTES = 48000
OMITTED = "\n[上下文已截短；缺失内容不可作为推断依据]"


def clip(text: str, budget: int) -> str:
    raw = text.encode("utf-8")
    if len(raw) <= budget:
        return text
    marker = OMITTED.encode("utf-8")
    if budget < len(marker):
        return ""
    return raw[:budget - len(marker)].decode("utf-8", errors="ignore") + OMITTED


def bounded_context(context):
    knowledge = []
    remaining = 10000
    for node in context.knowledge[:8]:
        item = {key: clip(str(node[key]), limit) for key, limit in (
            ("knowledge_id", 160), ("source_id", 160), ("title", 400),
            ("locator", 600), ("statement", 4000), ("conditions", 1200),
            ("prerequisites", 600),
        ) if node.get(key) is not None}
        size = len(json.dumps(item, ensure_ascii=False).encode("utf-8"))
        if size > remaining:
            continue
        knowledge.append(item)
        remaining -= size
    history = []
    remaining = 6000
    for turn in reversed(context.history[-6:]):
        item = {key: clip(str(turn[key]), 2000) for key in ("question", "answer") if key in turn}
        size = len(json.dumps(item, ensure_ascii=False).encode("utf-8"))
        if size > remaining:
            break
        history.append(item)
        remaining -= size
    return replace(context, knowledge=knowledge, history=list(reversed(history)),
                   problem_statement=clip(context.problem_statement, 9000) if context.problem_statement else None)


def fit_user_sections(sections: list[str]) -> str:
    # Preserve the latest question before large material and history sections.
    questions = [s for s in sections if s.startswith("学生本次补充/证明草稿：")]
    others = [s for s in sections if not s.startswith("学生本次补充/证明草稿：")]
    priority = ("交互模式：", "本次应给", "题目：", "可用课程知识：")
    others.sort(key=lambda s: next((i for i, prefix in enumerate(priority) if s.startswith(prefix)), len(priority)))
    result = []
    remaining = MAX_USER_BYTES
    for section in questions + others:
        part = clip(section, min(remaining, 18000))
        if not part:
            break
        result.append(part)
        remaining -= len(part.encode("utf-8")) + 1
    return "\n".join(result)
