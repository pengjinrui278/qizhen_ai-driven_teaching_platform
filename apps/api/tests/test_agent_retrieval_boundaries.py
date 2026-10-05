"""Database-backed retrieval/citation checks using only synthetic passages."""
import pytest

from mirror_api.db import init_db, make_engine, make_session_factory
from mirror_api.domain import CourseMirrorRequest
from mirror_api.mirror_service import MirrorPipeline
from mirror_api.models import Course, CourseProfileRow, TextbookChunk


@pytest.fixture()
def retrieval_db(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'agent-retrieval.sqlite'}")
    init_db(engine)
    with make_session_factory(engine)() as db:
        db.add(Course(course_id="synthetic", display_name="合成课程",
                      mirror_name="测试助手", stage="extension"))
        db.flush()
        db.add(CourseProfileRow(course_id="synthetic", profile_id="v1"))
        db.commit()
        yield db
    engine.dispose()


def chunk(ident, **changes):
    values = {"chunk_id": ident, "source_id": "synthetic-book", "course_id": "synthetic",
              "title": "一致收敛", "content": "合成片段：一致收敛中，指标对所有自变量统一选取。",
              "locator": "合成教材第1页", "source": {"allowed_for_rag": True}}
    values.update(changes)
    return TextbookChunk(**values)


class CaptureModel:
    name = "offline-context-capture"

    def generate(self, context):
        self.context = context
        return "请核对定义。"


def send(db, text, message=""):
    model = CaptureModel()
    response = MirrorPipeline(model).handle(db, CourseMirrorRequest(
        request_id="agent-retrieval", course_id="synthetic", course_profile_id="v1",
        interaction_mode="concept_explanation", problem={"text": text}, message=message,
    ))
    return response, model.context


@pytest.mark.parametrize("long_message", [False, True])
def test_late_problem_concept_survives_pipeline_query_budget(retrieval_db, long_message):
    retrieval_db.add(chunk("relevant"))
    retrieval_db.commit()
    # Valid request sizes; the only searchable concept is beyond the old 2200-char cut.
    text = "背景" * 1400 + "请解释一致收敛的量词顺序。"
    message = "读题说明" * 1400 if long_message else ""
    response, context = send(retrieval_db, text, message)
    assert [c.knowledge_id for c in response.citations] == ["relevant"]
    assert context.knowledge[0]["statement"].startswith("合成片段")


def test_only_allowed_course_material_enters_context_and_citations(retrieval_db):
    retrieval_db.add_all([
        chunk("allowed"),
        chunk("blocked", source={"allowed_for_rag": False}, content="一致收敛：未授权片段"),
        chunk("other", course_id="other-course", content="一致收敛：其他课程片段"),
    ])
    retrieval_db.commit()
    response, context = send(retrieval_db, "一致收敛")
    assert [c.knowledge_id for c in response.citations] == ["allowed"]
    assert [n["knowledge_id"] for n in context.knowledge] == ["allowed"]
    assert response.citations[0].locator == "合成教材第1页"


def test_citations_follow_context_budget(retrieval_db):
    for index in range(3):
        retrieval_db.add(chunk(f"large-{index}", content=f"一致收敛片段{index}：" + "说明" * 2500))
    retrieval_db.commit()
    response, context = send(retrieval_db, "一致收敛")
    injected = {(n["source_id"], n["knowledge_id"]) for n in context.knowledge}
    cited = {(c.source_id, c.knowledge_id) for c in response.citations}
    assert 0 < len(injected) < 3
    assert cited == injected


def test_missing_material_has_no_citation_and_uncertain_harness(retrieval_db):
    response, context = send(retrieval_db, "未收录概念")
    assert context.knowledge == [] and response.citations == []
    assert response.harness.status == "uncertain"
