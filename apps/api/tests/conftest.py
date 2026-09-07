"""共享测试夹具：SQLite 文件库（开启外键约束，行为对齐 PostgreSQL）。"""

import json

import pytest

from mirror_api.config import REPO_ROOT
from mirror_api.coursepack import import_coursepack
from mirror_api.db import init_db, make_engine, make_session_factory
from mirror_api.domain import CourseMirrorRequest, InteractionMode
from mirror_api.seed import seed_profiles

SAMPLE_PACK = REPO_ROOT / "coursepacks" / "mathematical_analysis" / "chen-jixiu-3e"
COURSE = "mathematical_analysis"
PROFILE = "chen-jixiu-3e"
PROBLEM_ID = "demo_limit_uniqueness_01"


def make_request(
    request_id: str, mode: str, problem_id: str | None = None, text: str | None = None
) -> CourseMirrorRequest:
    return CourseMirrorRequest(
        request_id=request_id,
        course_id=COURSE,
        course_profile_id=PROFILE,
        problem={"problem_id": problem_id, "text": text} if (problem_id or text) else {},
        interaction_mode=InteractionMode(mode),
    )


@pytest.fixture()
def session(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'mirror-test.sqlite'}")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as db:
        seed_profiles(db)
        import_coursepack(db, SAMPLE_PACK)
        yield db


@pytest.fixture()
def rights_session(tmp_path):
    """同一课程下追加一个授权受限的 CoursePack，用于门控测试。"""
    pack = tmp_path / "restricted"
    pack.mkdir()
    (pack / "coursepack.json").write_text(
        json.dumps(
            {
                "coursepack_id": "restricted-demo",
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
                "id": "locked_node",
                "type": "theorem",
                "title": "未开放检索的节点",
                "statement": "该节点不允许被检索引用。",
                "source": {"kind": "team_authored", "allowed_for_rag": False},
            }
        )
        + "\n",
        encoding="utf-8",
    )
    (pack / "problems.jsonl").write_text(
        json.dumps(
            {
                "id": "locked_problem",
                "type": "problem",
                "provenance": "team_authored",
                "statement": "授权不允许运行时使用的题目。",
                "answer_type": "proof",
                "knowledge_ids": ["locked_node"],
                "rights": {"allowed_for_runtime": False},
            }
        )
        + "\n",
        encoding="utf-8",
    )

    engine = make_engine(f"sqlite:///{tmp_path / 'rights.sqlite'}")
    init_db(engine)
    with make_session_factory(engine)() as db:
        seed_profiles(db)
        import_coursepack(db, SAMPLE_PACK)
        import_coursepack(db, pack)
        yield db
