"""运行配置。

所有配置都可以用环境变量覆盖（前缀 ``MIRROR_``），也可以放在仓库根目录的
``.env`` 文件中（该文件已被 .gitignore 忽略，禁止提交真实密钥）。
"""

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# apps/api/src/mirror_api/config.py -> 仓库根目录
REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MIRROR_", env_file=".env", extra="ignore")

    # 默认驱动选 pg8000：纯 Python 实现，无原生依赖。
    # psycopg[binary] 没有 Windows ARM64 轮子，纯 Python psycopg 又依赖本机
    # libpq 动态库；pg8000 在两种环境下都可直接安装。
    database_url: str = "postgresql+pg8000://mirror:mirror@localhost:5432/mirror"

    coursepack_root: Path = REPO_ROOT / "coursepacks"

    # CORS 来源；生产环境通常由 nginx 同域代理，可设为空字符串。
    cors_origins: list[str] = ["http://localhost:3000"]

    # 模型网关：默认 stub（确定性占位，不需要密钥，便于测试与离线演示）。
    # 接入真实大模型时设 MIRROR_LLM_PROVIDER=openai_compatible 并配置其余三项
    # （DeepSeek / 通义 / GLM 等国内模型均提供 OpenAI 兼容接口）。
    llm_provider: str = "stub"
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    # 带推理链的模型生成较长解答可能超过一分钟，给足超时。
    llm_timeout: float = 120.0

    @field_validator("database_url", mode="after")
    @classmethod
    def _ensure_pg8000_driver(cls, value: str) -> str:
        """Railway 等平台提供 postgresql:// 连接串；本项目使用 pg8000 驱动，
        需要改写成 postgresql+pg8000://。"""
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+pg8000://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+pg8000://", 1)
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value):
        """支持环境变量里的逗号分隔字符串，空字符串表示允许同域（nginx 代理）。"""
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


def get_settings() -> Settings:
    return Settings()
