"""运维命令行：``python -m mirror_api.cli <子命令>``。

子命令：

- ``init-db``：建表（阶段 1 用 create_all；迁移工具在阶段 3 引入）；
- ``seed-profiles``：把 ``profiles/*.json`` 五门课程注册表写入数据库；
- ``import-coursepack <目录>``：导入一个 CoursePack；
- ``import-all-coursepacks``：扫描 coursepacks/ 下全部 CoursePack 导入；
- ``seed-demo-workspace``：播种演示作业工作区（模拟多名学生求助）；
- ``status``：打印各表计数，便于快速核对。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import func, select

from . import retrieval
from .config import get_settings
from .coursepack import CoursePackImportError, import_coursepack
from .db import init_db, make_engine, make_session_factory
from .domain import CourseMirrorRequest, InteractionMode
from .llm import StubMirrorModel, build_model
from .mirror_service import MirrorPipeline
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

DEMO_COURSE = "mathematical_analysis"
DEMO_PROFILE = "chen-jixiu-3e"
DEMO_WORKSPACE_ID = "demo-workspace-01"
DEMO_JOIN_CODE = "DEMO2026"


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


def cmd_seed_demo_workspace(args) -> int:
    """播种演示工作区：创建/复用固定演示工作区，用真实管线模拟多名学生求助。

    请求 id 固定（``demo-<参与码>-<模式>``），重复运行走幂等回放，
    不会重复落事件；``--stub`` 强制占位模型，避免消耗真实模型调用。
    """
    settings, engine, factory = _setup()
    init_db(engine)
    model = StubMirrorModel() if args.stub else build_model(settings)
    pipeline = MirrorPipeline(model)
    students = max(1, args.students)

    with factory() as session:
        workspace = session.get(AssignmentWorkspace, DEMO_WORKSPACE_ID)
        if workspace is None:
            workspace = AssignmentWorkspace(
                workspace_id=DEMO_WORKSPACE_ID,
                course_id=DEMO_COURSE,
                profile_id=DEMO_PROFILE,
                title="数分第一章作业（演示）",
                class_label="数分甲班",
                join_code=DEMO_JOIN_CODE,
            )
            session.add(workspace)
            session.commit()

        pack_ids = retrieval.course_pack_ids(session, DEMO_COURSE, DEMO_PROFILE)
        if not pack_ids:
            print("错误：还没有导入数分 CoursePack，请先运行 import-all-coursepacks", file=sys.stderr)
            return 1
        problems = [
            problem
            for problem in session.execute(
                select(Problem)
                .where(Problem.coursepack_id.in_(pack_ids))
                .order_by(Problem.coursepack_id, Problem.problem_id)
            )
            .scalars()
            if retrieval.runtime_allowed(problem)
        ]
        if not problems:
            print("错误：课程包中没有运行时可用的题目", file=sys.stderr)
            return 1
        chosen = problems[:3]

        def demo_request(request_id: str, code: str, mode: str, problem: Problem) -> None:
            pipeline.handle(
                session,
                CourseMirrorRequest(
                    request_id=request_id,
                    course_id=DEMO_COURSE,
                    course_profile_id=DEMO_PROFILE,
                    problem={"problem_id": problem.problem_id},
                    interaction_mode=InteractionMode(mode),
                    participant_code=code,
                    assignment_workspace_id=workspace.workspace_id,
                ),
            )

        for i in range(1, students + 1):
            code = f"demo-stu-{i:02d}"
            problem = chosen[(i - 1) % len(chosen)]
            demo_request(f"demo-{code}-h1", code, "first_hint", problem)
            if i % 2 == 0:
                demo_request(f"demo-{code}-h2", code, "next_hint", problem)
        # 少量学生请求完整解答（用于演示模式分布）
        for i in (1, 3):
            if i <= students:
                demo_request(f"demo-stu-{i:02d}-full", f"demo-stu-{i:02d}", "full_solution", chosen[0])

        events = session.execute(
            select(func.count(MirrorEvent.request_id)).where(
                MirrorEvent.assignment_workspace_id == DEMO_WORKSPACE_ID
            )
        ).scalar()
        print(f"演示工作区：{DEMO_WORKSPACE_ID}")
        print(f"加入码：{DEMO_JOIN_CODE}")
        print(f"模拟学生：{students} 名（demo-stu-01 .. demo-stu-{students:02d}）")
        print(f"工作区事件数：{events}（模型：{model.name}）")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mirror_api.cli", description="Learning Mirror 运维命令")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init-db", help="建表")
    sub.add_parser("seed-profiles", help="写入五门课程注册表")
    pack = sub.add_parser("import-coursepack", help="导入一个 CoursePack 目录")
    pack.add_argument("path", help="包含 coursepack.json 的目录")
    sub.add_parser("import-all-coursepacks", help="导入 coursepacks/ 下全部 CoursePack")
    demo = sub.add_parser("seed-demo-workspace", help="播种演示作业工作区（模拟学生求助）")
    demo.add_argument("--students", type=int, default=8, help="模拟学生数（默认 8）")
    demo.add_argument("--stub", action="store_true", help="强制占位模型，不消耗真实模型调用")
    sub.add_parser("status", help="打印各表计数")

    args = parser.parse_args(argv)
    handlers = {
        "init-db": cmd_init_db,
        "seed-profiles": cmd_seed_profiles,
        "import-coursepack": cmd_import_coursepack,
        "import-all-coursepacks": cmd_import_all,
        "seed-demo-workspace": cmd_seed_demo_workspace,
        "status": cmd_status,
    }
    try:
        result = handlers[args.command](args)
    except CoursePackImportError as exc:
        print(f"导入失败：{exc}", file=sys.stderr)
        return 1
    return result or 0


if __name__ == "__main__":
    raise SystemExit(main())
