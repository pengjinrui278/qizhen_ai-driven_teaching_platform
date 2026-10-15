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
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select

from . import retrieval
from .auth import password_hash
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
from .platform_models import Account, Hypothesis, Observation, SandboxMember, SandboxPolicy, Submission
from .seed import seed_profiles
from .textbook_ingest import ingest_textbook

DEMO_COURSE = "mathematical_analysis"
DEMO_PROFILE = "chen-jixiu-3e"
DEMO_WORKSPACE_ID = "demo-workspace-01"
DEMO_JOIN_CODE = "DEMO2026"
DEMO_TEACHER_USERNAME = "demo-teacher"
DEMO_TEACHER_PASSWORD = "demo2026"
DEMO_STUDENT_USERNAME = "demo-student"
DEMO_STUDENT_PASSWORD = "demo2026"


def _setup():
    settings = get_settings()
    engine = make_engine(settings.database_url)
    return settings, engine, make_session_factory(engine)


def cmd_init_db(_args) -> None:
    settings, engine, _ = _setup()
    init_db(engine)
    print("已完成数据库建表检查（连接凭据不输出）")


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
        teacher = session.execute(
            select(Account).where(Account.username == DEMO_TEACHER_USERNAME)
        ).scalar_one_or_none()
        if teacher is None:
            teacher = Account(
                id="demo-teacher-account",
                username=DEMO_TEACHER_USERNAME,
                nickname="演示教师",
                password_hash=password_hash(DEMO_TEACHER_PASSWORD),
                role="teacher",
                status="active",
                retention_days=180,
            )
            session.add(teacher)
        student = session.execute(
            select(Account).where(Account.username == DEMO_STUDENT_USERNAME)
        ).scalar_one_or_none()
        if student is None:
            student = Account(
                id="demo-student-account",
                username=DEMO_STUDENT_USERNAME,
                nickname="演示学生",
                password_hash=password_hash(DEMO_STUDENT_PASSWORD),
                role="student",
                status="active",
                retention_days=180,
            )
            session.add(student)

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

        # 教师拥有该演示工作区；演示学生加入为成员（便于演示师生协同）。
        policy = session.get(SandboxPolicy, DEMO_WORKSPACE_ID)
        if policy is None:
            session.add(SandboxPolicy(
                workspace_id=DEMO_WORKSPACE_ID,
                owner_id=teacher.id,
                retention_hours=720,
                expires_at=datetime.now(UTC) + timedelta(hours=720),
                class_size=max(students, 3),
                assignment="证明 1/n → 0，并说明 N 的选取如何依赖 ε。",
            ))
        member = session.get(SandboxMember, (DEMO_WORKSPACE_ID, student.id))
        if member is None:
            session.add(SandboxMember(workspace_id=DEMO_WORKSPACE_ID, account_id=student.id, role="student"))
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

        # --- 演示数据：作业作品批改需真实学生账号（participant 取自 account 昵称） ---
        demo_students = []
        for i in range(1, 5):
            uname = f"demo-stu-{i:02d}"
            acct = session.execute(select(Account).where(Account.username == uname)).scalar_one_or_none()
            if acct is None:
                acct = Account(
                    id=f"demo-stu-{i:02d}-account",
                    username=uname,
                    nickname=f"演示学生{i}",
                    password_hash=password_hash(DEMO_STUDENT_PASSWORD),
                    role="student",
                    status="active",
                    retention_days=180,
                )
                session.add(acct)
                session.flush()
            if not session.get(SandboxMember, (DEMO_WORKSPACE_ID, acct.id)):
                session.add(SandboxMember(workspace_id=DEMO_WORKSPACE_ID, account_id=acct.id, role="student"))
            demo_students.append(acct)

        # --- 演示学生的学习档案与诊断（观察 + 假设） ---
        for oid, theme, text, kind in [
            ("demo-obs-1", "quantifiers", "学生不清楚 N 可以依赖哪些量，习惯先给定 N 再补 ε。", "student_question"),
            ("demo-obs-2", "proof_structure", "证明时量词次序容易写反，先写结论再补条件。", "hint_used"),
            ("demo-obs-3", "boundedness", "用有界性控制乘积时，不确定上界 M 该从哪里取。", "student_question"),
        ]:
            if not session.get(Observation, oid):
                session.add(Observation(id=oid, account_id=student.id, course_id=DEMO_COURSE,
                    attempt_id=None, kind=kind, theme=theme, text=text,
                    direction="support", source="interaction", strength="weak"))
        for hid, theme, statement, supporting, status in [
            ("demo-hyp-1", "quantifiers", "在量词次序与 N 的依赖上，需要再核对一次。", ["demo-obs-1", "demo-obs-2"], "worth_attention"),
            ("demo-hyp-2", "boundedness", "对「有界 × 趋于零」这类估计，上界的取法还不够熟练。", ["demo-obs-3"], "emerging"),
        ]:
            if not session.get(Hypothesis, hid):
                session.add(Hypothesis(id=hid, account_id=student.id, course_id=DEMO_COURSE,
                    theme=theme, statement=statement, supporting=supporting, contradicting=[],
                    status=status, sufficiency="合成示例，不代表个人能力结论"))

        # --- 教师端批改数据：作业作品（含 AI 候选批改与已确认结论） ---
        for sid, stu_index, text, review in [
            ("demo-sub-1", 0, "任给 ε>0，取 N=10。当 n>N 时 1/n<ε，所以极限为零。",
             {"candidate": {"text": "N 被取成固定常数 10，无法覆盖任意小的 ε；N 应随 ε 改变。", "model": "预置样例", "status": "unverified"},
              "decision": "confirmed", "theme": "quantifiers", "note": "N 与 ε 的依赖关系写错。"}),
            ("demo-sub-2", 1, "任给 ε>0，取 N=⌈1/ε⌉。当 n>N 时 |1/n-0|<ε。",
             {"candidate": {"text": "思路正确，N 的选取与 ε 依赖清晰。", "model": "预置样例", "status": "unverified"},
              "decision": "ignored", "theme": "quantifiers", "note": "本题正确，无需额外批改。"}),
            ("demo-sub-3", 2, "设 |a_n|≤M，b_n→0。取 ε>0，由 b_n→0 得 |b_n|<ε。",
             {"candidate": {"text": "乘积估计少了 M：应取 |b_n|<ε/M 才能得到 |a_nb_n|<ε。", "model": "预置样例", "status": "unverified"},
              "decision": "confirmed", "theme": "conditions", "note": "遗漏有界上界 M 的控制。"}),
            ("demo-sub-4", 3, "收敛数列极限唯一：设 a_n→A 且 a_n→B，取 ε=|A-B|/2。",
             {"candidate": {"text": "取 ε 的方式与三角不等式衔接不够，建议用 ε=|A-B|/3。", "model": "预置样例", "status": "unverified"}}),
        ]:
            if not session.get(Submission, sid):
                session.add(Submission(id=sid, workspace_id=DEMO_WORKSPACE_ID,
                    account_id=demo_students[stu_index].id, text=text,
                    source="artifact", synthetic=False, review=review))

        # --- 教师端批改分析：候选现象（1 条已确认 + 1 条待处理） ---
        for fid, phenomenon, basis, ta_status, ta_note, teacher_status, teacher_note in [
            ("demo-finding-1", "在「N 是否依赖 ε」上，8 名模拟学生中有 3 名把 N 取成与 ε 无关的常数。",
             {"coverage": "3/8", "synthetic": True, "sample_submissions": 4},
             "confirmed", "已核对：该现象在多数作品中可复现。", "accepted", "下周一习题课统一讲解 N 对 ε 的依赖。"),
            ("demo-finding-2", "在「有界 × 趋于零」的估计中，有学生遗漏了上界 M 的控制。",
             {"coverage": "1/8", "synthetic": True, "sample_submissions": 4},
             "candidate", None, "pending", None),
        ]:
            if not session.get(WorkspaceFinding, fid):
                session.add(WorkspaceFinding(finding_id=fid, workspace_id=DEMO_WORKSPACE_ID,
                    phenomenon=phenomenon, basis=basis, generator="预置样例",
                    ta_status=ta_status, ta_note=ta_note, teacher_status=teacher_status, teacher_note=teacher_note))
        session.commit()

        events = session.execute(
            select(func.count(MirrorEvent.request_id)).where(
                MirrorEvent.assignment_workspace_id == DEMO_WORKSPACE_ID
            )
        ).scalar()
        print(f"演示工作区：{DEMO_WORKSPACE_ID}")
        print(f"加入码：{DEMO_JOIN_CODE}")
        print(f"演示教师账号：{DEMO_TEACHER_USERNAME} / {DEMO_TEACHER_PASSWORD}")
        print(f"演示学生账号：{DEMO_STUDENT_USERNAME} / {DEMO_STUDENT_PASSWORD}")
        print(f"模拟学生：{students} 名（demo-stu-01 .. demo-stu-{students:02d}）")
        print(f"工作区事件数：{events}（模型：{model.name}）")
        print("批改数据：4 份作业作品 + 2 条候选现象；学生诊断：3 条观察 + 2 条假设")
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
