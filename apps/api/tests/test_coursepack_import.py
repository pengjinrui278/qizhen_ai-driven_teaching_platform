"""课程注册表与 CoursePack 导入管道测试。"""

import json

import pytest

from mirror_api.config import REPO_ROOT
from mirror_api.coursepack import CoursePackImportError, import_coursepack
from mirror_api.db import init_db, make_engine, make_session_factory
from mirror_api.models import Course, KnowledgeNode, Problem, ProblemHint
from mirror_api.seed import seed_profiles

SAMPLE_PACK = REPO_ROOT / "coursepacks" / "mathematical_analysis" / "chen-jixiu-3e"
COURSE = "mathematical_analysis"
PROFILE = "chen-jixiu-3e"


def test_seed_profiles_covers_five_courses(session):
    courses = session.query(Course).all()
    ids = {c.course_id for c in courses}
    assert len(courses) == 6
    assert "ai_literacy" in ids
    flagship = [c for c in courses if c.stage == "flagship"]
    assert [c.course_id for c in flagship] == [COURSE]


def test_import_counts_and_rights(session):
    knowledge = session.query(KnowledgeNode).all()
    problems = session.query(Problem).all()
    assert len(knowledge) == 11
    assert len(problems) == 10
    assert all(node.source["allowed_for_rag"] for node in knowledge)
    assert all(not node.source["allowed_for_training"] for node in knowledge)
    assert all(problem.rights["allowed_for_runtime"] for problem in problems)
    assert all(not problem.rights["allowed_for_training"] for problem in problems)


def test_chapter1_corpus_shape(session):
    """第一章自建语料的形态约束：类型、来源标注与提示阶梯规模。"""
    knowledge = session.query(KnowledgeNode).all()
    assert {node.type for node in knowledge} == {"definition", "theorem"}
    assert all(node.review["status"] == "needs_math_review" for node in knowledge)
    problems = session.query(Problem).all()
    assert all(problem.provenance.startswith("team_authored") for problem in problems)
    assert all(problem.review["status"] == "needs_ta_review" for problem in problems)
    assert all(problem.solution_paths for problem in problems)
    # 示意题 2 级 + 自编题 9 道共 19 级
    assert session.query(ProblemHint).count() == 21


def test_import_is_idempotent(session):
    report = import_coursepack(session, SAMPLE_PACK)
    assert "覆盖导入" in report.warnings[0]
    assert session.query(KnowledgeNode).count() == 11
    assert session.query(Problem).count() == 10


def test_import_rejects_broken_knowledge_reference(tmp_path):
    pack = tmp_path / "bad-pack"
    pack.mkdir()
    (pack / "coursepack.json").write_text(
        json.dumps(
            {
                "coursepack_id": "bad-pack",
                "status": "schema_trial",
                "course_id": COURSE,
                "profile_id": PROFILE,
                "knowledge_file": "knowledge.jsonl",
                "problems_file": "problems.jsonl",
            }
        ),
        encoding="utf-8",
    )
    (pack / "knowledge.jsonl").write_text(
        json.dumps(
            {
                "id": "k1",
                "type": "definition",
                "title": "t",
                "statement": "s",
                "source": {"kind": "team_authored", "allowed_for_rag": True},
            }
        )
        + "\n",
        encoding="utf-8",
    )
    (pack / "problems.jsonl").write_text(
        json.dumps(
            {
                "id": "p1",
                "type": "problem",
                "provenance": "team_authored",
                "statement": "题目",
                "answer_type": "proof",
                "knowledge_ids": ["k1", "not_exist"],
                "rights": {"allowed_for_runtime": True},
            }
        )
        + "\n",
        encoding="utf-8",
    )

    engine = make_engine(f"sqlite:///{tmp_path / 'bad.sqlite'}")
    init_db(engine)
    with make_session_factory(engine)() as db:
        seed_profiles(db)
        with pytest.raises(CoursePackImportError, match="not_exist"):
            import_coursepack(db, pack)


def _write_minimal_pack(pack, knowledge_lines: list[str], problem_lines: list[str]) -> None:
    pack.mkdir(exist_ok=True)
    (pack / "coursepack.json").write_text(
        json.dumps(
            {
                "coursepack_id": pack.name,
                "status": "schema_trial",
                "course_id": COURSE,
                "profile_id": PROFILE,
                "knowledge_file": "knowledge.jsonl",
                "problems_file": "problems.jsonl",
            }
        ),
        encoding="utf-8",
    )
    (pack / "knowledge.jsonl").write_text("".join(line + "\n" for line in knowledge_lines), encoding="utf-8")
    (pack / "problems.jsonl").write_text("".join(line + "\n" for line in problem_lines), encoding="utf-8")


def test_import_rejects_duplicate_knowledge_ids(tmp_path):
    node = json.dumps(
        {
            "id": "k1",
            "type": "definition",
            "title": "t",
            "statement": "s",
            "source": {"kind": "team_authored", "allowed_for_rag": True},
        }
    )
    _write_minimal_pack(tmp_path / "dup-pack", [node, node], [])

    engine = make_engine(f"sqlite:///{tmp_path / 'dup.sqlite'}")
    init_db(engine)
    with make_session_factory(engine)() as db:
        seed_profiles(db)
        with pytest.raises(CoursePackImportError, match="重复"):
            import_coursepack(db, tmp_path / "dup-pack")


def test_import_rejects_hint_ladder_not_starting_at_one(tmp_path):
    problem = json.dumps(
        {
            "id": "p1",
            "type": "problem",
            "provenance": "team_authored",
            "statement": "题目",
            "answer_type": "proof",
            "hint_ladder": [
                {"level": 1, "type": "direction", "content": "第一级"},
                {"level": 3, "type": "direction", "content": "跳到第三级"},
            ],
            "rights": {"allowed_for_runtime": True},
        }
    )
    node = json.dumps(
        {
            "id": "k1",
            "type": "definition",
            "title": "t",
            "statement": "s",
            "source": {"kind": "team_authored", "allowed_for_rag": True},
        }
    )
    _write_minimal_pack(tmp_path / "ladder-pack", [node], [problem])

    engine = make_engine(f"sqlite:///{tmp_path / 'ladder.sqlite'}")
    init_db(engine)
    with make_session_factory(engine)() as db:
        seed_profiles(db)
        with pytest.raises(CoursePackImportError, match="提示阶梯"):
            import_coursepack(db, tmp_path / "ladder-pack")
