"""数据库引擎与会话管理。

建表策略：阶段 1 以 SQLAlchemy 模型为唯一事实来源，``init_db`` 直接
``create_all``。正式的迁移/回滚工具（发布与版本管理）在阶段 3 课程端
引入，避免现阶段双份 schema 漂移。
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .models import Base


def make_engine(database_url: str) -> Engine:
    kwargs: dict = {"future": True}
    if database_url.startswith("sqlite"):
        # FastAPI TestClient / uvicorn 在独立线程访问 SQLite 连接
        kwargs["connect_args"] = {"check_same_thread": False}
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


def init_db(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)


def sessions(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
