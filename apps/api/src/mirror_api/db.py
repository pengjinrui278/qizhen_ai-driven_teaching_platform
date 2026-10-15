"""数据库引擎与会话管理。

建表策略：阶段 1 以 SQLAlchemy 模型为唯一事实来源，``init_db`` 直接
``create_all``。正式的迁移/回滚工具（发布与版本管理）在阶段 3 课程端
引入，避免现阶段双份 schema 漂移。
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import Session, sessionmaker

from .models import Base


def make_engine(database_url: str) -> Engine:
    kwargs: dict = {"future": True}
    if database_url.startswith("sqlite"):
        # FastAPI TestClient / uvicorn 在独立线程访问 SQLite 连接
        kwargs["connect_args"] = {"check_same_thread": False}
        if database_url.endswith(":memory:") or database_url=="sqlite://":
            kwargs["poolclass"] = StaticPool
    engine = create_engine(database_url, **kwargs)
    if database_url.startswith("sqlite"):
        # SQLite 默认不启用外键约束；开启后才能与 PostgreSQL 行为一致，
        # 让测试抓到插入顺序/引用完整性问题。
        @event.listens_for(engine, "connect")
        def _enable_sqlite_fks(dbapi_connection, _record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


# create_all 只建「缺失的表」，不会给**已有的表**加列，而本仓库没有迁移工具。
# 于是「先跑过旧版、后来又给表加了列」的库会在查询时直接 500
# （踩过一次：notes.deleted_at 不存在，整个笔记库报「服务没有返回有效数据」）。
# 这里只补**新增的可空列**，不删不改，幂等；新库走 create_all 不受影响。
_ADDITIVE_COLUMNS: dict[str, dict[str, str]] = {
    "notes": {"deleted_at": "TIMESTAMP", "deleted_from": "VARCHAR(200) DEFAULT ''"},
    # agent 直接动过笔记库之后的逐条回执。create_all 只会建新表，给已有的表加列得走这里，
    # 否则老库一读到 ai_messages.note_ops 就 500。
    "ai_messages": {"note_ops": "JSON"},
    # 学生自己给对话起的名字（空 = 现算）
    "student_attempts": {"title": "VARCHAR(120) DEFAULT ''"},
    # 学生自选头像（客户端裁好的小图 data URL）
    "accounts": {"avatar": "TEXT DEFAULT ''"},
}


def _heal_additive_columns(engine: Engine) -> None:
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    for table, columns in _ADDITIVE_COLUMNS.items():
        if table not in tables:
            continue
        present = {column["name"] for column in inspector.get_columns(table)}
        missing = {name: ddl for name, ddl in columns.items() if name not in present}
        if not missing:
            continue
        with engine.begin() as connection:
            for name, ddl in missing.items():
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def init_db(engine: Engine) -> None:
    from . import platform_models  # noqa: F401 -- additive migration tables
    from . import ai_learning  # noqa: F401 -- independent AI literacy tables
    from . import note_library  # noqa: F401 -- notes knowledge base tables
    from . import chat_upload  # noqa: F401 -- chat document uploads
    Base.metadata.create_all(engine)
    _heal_additive_columns(engine)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)


def sessions(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
