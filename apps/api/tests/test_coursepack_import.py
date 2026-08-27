"""课程注册表与 CoursePack 导入管道测试。"""

import json

import pytest

from mirror_api.config import REPO_ROOT
from mirror_api.coursepack import CoursePackImportError, import_coursepack
from mirror_api.db import init_db, make_engine, make_session_factory
from mirror_api.models import Course, KnowledgeNode, Problem
from mirror_api.seed import seed_profiles

SAMPLE_PACK = REPO_ROOT / "coursepacks" / "mathematical_analysis" / "chen-jixiu-3e"
COURSE = "mathematical_analysis"
PROFILE = "chen-jixiu-3e"


def test_seed_profiles_covers_five_courses(session):
    courses = session.query(Course).all()
    assert len(courses) == 5
    flagship = [c for c in courses if c.stage == "flagship"]
    assert [c.course_id for c in flagship] == [COURSE]


def test_import_counts_and_rights(session):
    knowledge = session.query(KnowledgeNode).all()
    problems = session.query(Problem).all()
    assert len(knowledge) == 2
    assert len(problems) == 1
    assert all(node.source["allowed_for_rag"] for node in knowledge)
    assert all(not node.source["allowed_for_training"] for node in knowledge)
    assert problems[0].rights["allowed_for_runtime"] is True
    assert problems[0].rights["allowed_for_training"] is False


def test_import_is_idempotent(session):
    report = import_coursepack(session, SAMPLE_PACK)
    assert "覆盖导入" in report.warnings[0]
    assert session.query(KnowledgeNode).count() == 2
    assert session.query(Problem).count() == 1


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
