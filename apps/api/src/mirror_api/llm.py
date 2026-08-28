"""模型网关。

- ``StubMirrorModel``：确定性占位实现，直接用 CoursePack 中的提示阶梯/
  解法路径组装回答。不需要任何密钥，保证离线可测、可演示；
- ``OpenAICompatibleModel``：国内通用大模型（DeepSeek、通义、GLM 等）
  的 OpenAI 兼容接口。真实接入只改配置，不改管线代码。

我们不在本平台上训练模型；模型只通过这一层被调用，且所有回答都必须
经过 Course Mirror 管线的检索门控与 Harness 检查。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

import httpx

from .config import Settings


@dataclass
class MirrorContext:
    """送入模型的最小上下文（不含任何学生个人信息）。"""

    course_name: str
    mirror_name: str
    interaction_mode: str
    hint_level: int | None = None
    hints_exhausted: bool = False
    problem_statement: str | None = None
    hints: list[dict] = field(default_factory=list)  # [{level, type, content}]
    solution_paths: list[dict] = field(default_factory=list)
    knowledge: list[dict] = field(default_factory=list)  # [{knowledge_id,title,statement}]
    common_mistakes: list[str] = field(default_factory=list)


class LanguageModel(Protocol):
    name: str

    def generate(self, context: MirrorContext) -> str: ...


class StubMirrorModel:
    """确定性实现：把结构化课程材料按交互模式组装成回答。"""

    name = "stub"

    def generate(self, context: MirrorContext) -> str:
        mode = context.interaction_mode
        if mode in ("first_hint", "next_hint"):
            return self._hint(context)
        if mode == "full_solution":
            return self._solution(context)
        if mode == "concept_explanation":
            return self._concept(context)
        if mode == "solution_review":
            return self._review(context)
        return "暂不支持该交互模式。"

    def _hint(self, context: MirrorContext) -> str:
        if context.problem_statement is None:
            return (
                "我还没有在课程资料中定位到这道题。"
                "先告诉我你卡在哪一步：是条件没看清，还是不知道从哪个定义入手？"
            )
        if context.hints_exhausted:
            return "这道题的提示阶梯已经用完。如果仍然卡住，可以请求完整思路，或先回顾相关定义。"
        level = context.hint_level or 1
        for step in context.hints:
            if step.get("level") == level:
                return f"提示（第 {level} 级）：{step['content']}"
        return "这道题暂时没有收录对应级别的提示。"

    def _solution(self, context: MirrorContext) -> str:
        if not context.solution_paths:
            return "课程资料中还没有收录这道题的解法路径，请先咨询课程建设端。"
        parts: list[str] = []
        for path in context.solution_paths:
            parts.append(f"策略（{path.get('path_id', 'path')}）：{path.get('strategy', '')}")
            for idx, step in enumerate(path.get("key_steps", []), start=1):
                parts.append(f"{idx}. {step}")
        return "\n".join(parts)

    def _concept(self, context: MirrorContext) -> str:
        if not context.knowledge:
            return "没有在课程资料中检索到相关知识点。"
        node = context.knowledge[0]
        return f"{node['title']}：{node['statement']}"

    def _review(self, context: MirrorContext) -> str:
        if not context.common_mistakes:
            return "请把解答过程发给我；课程资料中暂无这道题的常见错误清单。"
        lines = ["请对照这些常见错误自查："]
        lines.extend(f"- {item}" for item in context.common_mistakes)
        return "\n".join(lines)


class OpenAICompatibleModel:
    """OpenAI 兼容接口（DeepSeek / 通义 / GLM 等国内模型均支持）。"""

    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 60.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.name = f"openai_compatible:{model}"

    def generate(self, context: MirrorContext) -> str:
        system = (
            f"你是{context.course_name}的课程智能体（{context.mirror_name}）。"
            "规则：只能使用下面提供的课程材料；提示模式下严禁直接给出答案或完整步骤；"
            "回答要保持最小有效提示原则。"
        )
        user_lines = [f"交互模式：{context.interaction_mode}"]
        if context.hint_level:
            user_lines.append(f"本次应给第 {context.hint_level} 级提示。")
        if context.hints_exhausted:
            user_lines.append(
                "该题的提示阶梯已经用完：不要再给新提示，"
                "明确告知学生提示已用完，可请求完整思路或先回顾相关定义。"
            )
        if context.problem_statement:
            user_lines.append(f"题目：{context.problem_statement}")
        if context.hints:
            user_lines.append(f"提示阶梯：{context.hints}")
        if context.knowledge:
            user_lines.append(f"可用课程知识：{context.knowledge}")
        if context.solution_paths and context.interaction_mode == "full_solution":
            user_lines.append(f"解法路径：{context.solution_paths}")
        if context.common_mistakes and context.interaction_mode == "solution_review":
            user_lines.append(f"常见错误清单：{context.common_mistakes}")

        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": "\n".join(user_lines)},
                ],
            },
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


def build_model(settings: Settings) -> LanguageModel:
    if settings.llm_provider == "stub":
        return StubMirrorModel()
    if settings.llm_provider == "openai_compatible":
        if not (settings.llm_base_url and settings.llm_api_key and settings.llm_model):
            raise ValueError(
                "openai_compatible 需要配置 MIRROR_LLM_BASE_URL / MIRROR_LLM_API_KEY / MIRROR_LLM_MODEL"
            )
        return OpenAICompatibleModel(
            settings.llm_base_url,
            settings.llm_api_key,
            settings.llm_model,
            timeout=settings.llm_timeout,
        )
    raise ValueError(f"未知模型提供方：{settings.llm_provider}")
