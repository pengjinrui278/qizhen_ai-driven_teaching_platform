"""运维命令行：``python -m mirror_api.cli <子命令>``。

子命令：

- ``init-db``：建表（阶段 1 用 create_all；迁移工具在阶段 3 引入）；
- ``seed-profiles``：把 ``profiles/*.json`` 课程注册表写入数据库；
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
    TextbookChunk,
    WorkspaceFinding,
)
from .seed import seed_profiles
from .textbook_ingest import ingest_textbook

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
            "textbook_chunks": TextbookChunk,
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


# ---------------------------------------------------------------- 教材语料入库


def cmd_import_textbook(args) -> int:
    """导入单个教材 PDF：抽取文本、切片、写入 TextbookChunk。"""
    _settings, engine, factory = _setup()
    init_db(engine)
    with factory() as session:
        count = ingest_textbook(
            session,
            Path(args.path),
            course_id=args.course_id,
            source_id=args.source_id,
            license_note=args.license_note,
            chunk_size=args.chunk_size,
            overlap=args.overlap,
        )
    print(f"已导入 {args.source_id}：{count} 个文本块")
    return 0


TEXTBOOK_CATALOG = [
    {
        "course_id": "mathematical_analysis",
        "source_id": "textbook-chen-jixiu-3e-vol1",
        "path": "materials/教材/数学分析 陈纪修 第三版 上 (陈纪修，于崇华，金路) .pdf",
        "license_note": "团队已获授权将《数学分析（陈纪修 第三版 上册）》用于 RAG 检索",
    },
    {
        "course_id": "mathematical_analysis",
        "source_id": "textbook-chen-jixiu-3e-vol2",
        "path": "materials/教材/数学分析 陈纪修 第三版 下 (陈纪修，于崇华，金路) .pdf",
        "license_note": "团队已获授权将《数学分析（陈纪修 第三版 下册）》用于 RAG 检索",
    },
    {
        "course_id": "linear_algebra_analytic_geometry",
        "source_id": "textbook-gaag-vol1",
        "path": "materials/教材/高等代数与解析几何（上册）.pdf",
        "license_note": "团队已获授权将《高等代数与解析几何（上册）》用于 RAG 检索",
    },
    {
        "course_id": "linear_algebra_analytic_geometry",
        "source_id": "textbook-gaag-vol2",
        "path": "materials/教材/高等代数与解析几何（下册）.pdf",
        "license_note": "团队已获授权将《高等代数与解析几何（下册）》用于 RAG 检索",
    },
    {
        "course_id": "ordinary_differential_equations",
        "source_id": "textbook-ode-zju",
        "path": "materials/教材/常微分方程 (浙江大学，方道元，薛儒英) .pdf",
        "license_note": "团队已获授权将《常微分方程（浙江大学）》用于 RAG 检索",
    },
    {
        "course_id": "point_set_topology",
        "source_id": "textbook-topology-munkres",
        "path": "materials/教材/拓扑学 (芒克里斯 (James R.Munkres)) .pdf",
        "license_note": "团队已获授权将《拓扑学（Munkres）》用于 RAG 检索",
    },
    {
        "course_id": "university_physics",
        "source_id": "textbook-university-physics-zju",
        "path": "materials/教材/电子教材/大学物理（上册） 浙江大学出版社 第三版 吴泽华、陈治中、黄正东编著.PDF",
        "license_note": "团队已获授权将《大学物理（上册，浙江大学出版社 第三版）》用于 RAG 检索",
    },
]


def cmd_import_all_textbooks(args) -> int:
    """批量导入已登记的授权教材。"""
    settings, engine, factory = _setup()
    init_db(engine)
    repo_root = settings.coursepack_root.parent
    total = 0
    with factory() as session:
        for item in TEXTBOOK_CATALOG:
            path = repo_root / item["path"]
            if not path.exists():
                print(f"跳过（文件不存在）：{path}", file=sys.stderr)
                continue
            count = ingest_textbook(
                session,
                path,
                course_id=item["course_id"],
                source_id=item["source_id"],
                license_note=item["license_note"],
                chunk_size=args.chunk_size,
                overlap=args.overlap,
            )
            print(f"已导入 {item['source_id']}：{count} 个文本块")
            total += count
    print(f"教材语料入库完成：共 {total} 个文本块")
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

    tb = sub.add_parser("import-textbook", help="导入单个教材 PDF 为 TextbookChunk")
    tb.add_argument("path", help="PDF 文件路径")
    tb.add_argument("--course-id", required=True, help="课程 ID")
    tb.add_argument("--source-id", required=True, help="教材来源标识")
    tb.add_argument("--license-note", default="团队已获授权用于 RAG 检索", help="授权说明")
    tb.add_argument("--chunk-size", type=int, default=800, help="每个文本块最大字符数（默认 800）")
    tb.add_argument("--overlap", type=int, default=100, help="块间重叠字符数（默认 100）")

    tb_all = sub.add_parser("import-all-textbooks", help="批量导入已登记的授权教材")
    tb_all.add_argument("--chunk-size", type=int, default=800, help="每个文本块最大字符数（默认 800）")
    tb_all.add_argument("--overlap", type=int, default=100, help="块间重叠字符数（默认 100）")

    sub.add_parser("status", help="打印各表计数")

    args = parser.parse_args(argv)
    handlers = {
        "init-db": cmd_init_db,
        "seed-profiles": cmd_seed_profiles,
        "import-coursepack": cmd_import_coursepack,
        "import-all-coursepacks": cmd_import_all,
        "seed-demo-workspace": cmd_seed_demo_workspace,
        "import-textbook": cmd_import_textbook,
        "import-all-textbooks": cmd_import_all_textbooks,
        "status": cmd_status,
    }
    try:
        result = handlers[args.command](args)
    except CoursePackImportError as exc:
        print(f"导入失败：{exc}", file=sys.stderr)
        return 1
    except FileNotFoundError as exc:
        print(f"文件不存在：{exc}", file=sys.stderr)
        return 1
    return result or 0


if __name__ == "__main__":
    raise SystemExit(main())
