"""运维命令行：``python -m mirror_api.cli <子命令>``。

子命令：

- ``init-db``：建表（阶段 1 用 create_all；迁移工具在阶段 3 引入）；
- ``seed-profiles``：把 ``profiles/*.json`` 五门课程注册表写入数据库；
- ``import-coursepack <目录>``：导入一个 CoursePack；
- ``import-all-coursepacks``：扫描 coursepacks/ 下全部 CoursePack 导入；
- ``status``：打印各表计数，便于快速核对。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import func, select

from .config import get_settings
from .coursepack import CoursePackImportError, import_coursepack
from .db import init_db, make_engine, make_session_factory
from .models import (
    AssignmentWorkspace,
    Course,
    CoursePack,
    CourseProfileRow,
    KnowledgeNode,
    LearningEvidenceRow,
    MirrorEvent,
    Problem,
    ProblemHint,
    WorkspaceFinding,
)
from .seed import seed_profiles


def _setup():
    settings = get_settings()
    engine = make_engine(settings.database_url)
    return settings, engine, make_session_factory(engine)


def cmd_init_db(_args) -> None:
    settings, engine, _ = _setup()
    init_db(engine)
    print(f"已建表：{settings.database_url}")


def cmd_seed_profiles(_args) -> None:
    _, engine, factory = _setup()
    init_db(engine)
    with factory() as session:
        total = seed_profiles(session)
    print(f"已写入 {total} 门课程注册表")


def _import_dir(session, path: Path) -> None:
    report = import_coursepack(session, path)
    print(
        f"导入 {report.coursepack_id}：知识节点 {report.knowledge_count}，"
        f"题目 {report.problem_count}，提示 {report.hint_count}"
    )
    for warning in report.warnings:
        print(f"  提示：{warning}")


def cmd_import_coursepack(args) -> None:
    _settings, engine, factory = _setup()
    init_db(engine)
    with factory() as session:
        _import_dir(session, Path(args.path))


def cmd_import_all(_args) -> None:
    settings, engine, factory = _setup()
    init_db(engine)
    packs = sorted(settings.coursepack_root.glob("*/*/coursepack.json"))
    if not packs:
        print(f"在 {settings.coursepack_root} 下没有找到 CoursePack")
        return
    with factory() as session:
        for manifest in packs:
            _import_dir(session, manifest.parent)


def cmd_status(_args) -> None:
    _, _engine, factory = _setup()
    with factory() as session:
        counts = {
            "courses": Course,
            "course_profiles": CourseProfileRow,
            "coursepacks": CoursePack,
            "knowledge_nodes": KnowledgeNode,
            "problems": Problem,
            "problem_hints": ProblemHint,
            "mirror_events": MirrorEvent,
            "learning_evidence": LearningEvidenceRow,
            "assignment_workspaces": AssignmentWorkspace,
            "workspace_findings": WorkspaceFinding,
        }
        for label, model in counts.items():
            total = session.execute(select(func.count()).select_from(model)).scalar()
            print(f"{label}: {total}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mirror_api.cli", description="Learning Mirror 运维命令")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init-db", help="建表")
    sub.add_parser("seed-profiles", help="写入五门课程注册表")
    pack = sub.add_parser("import-coursepack", help="导入一个 CoursePack 目录")
    pack.add_argument("path", help="包含 coursepack.json 的目录")
    sub.add_parser("import-all-coursepacks", help="导入 coursepacks/ 下全部 CoursePack")
    sub.add_parser("status", help="打印各表计数")

    args = parser.parse_args(argv)
    handlers = {
        "init-db": cmd_init_db,
        "seed-profiles": cmd_seed_profiles,
        "import-coursepack": cmd_import_coursepack,
        "import-all-coursepacks": cmd_import_all,
        "status": cmd_status,
    }
    try:
        handlers[args.command](args)
    except CoursePackImportError as exc:
        print(f"导入失败：{exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
