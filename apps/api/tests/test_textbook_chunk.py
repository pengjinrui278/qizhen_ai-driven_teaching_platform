"""教材语料 TextbookChunk 检索与管线接入测试。"""


from mirror_api.domain import CourseMirrorRequest, InteractionMode
from mirror_api.llm import StubMirrorModel
from mirror_api.mirror_service import MirrorPipeline
from mirror_api.models import TextbookChunk
from mirror_api.retrieval import rag_allowed_chunk, search_textbook_chunks
from mirror_api.textbook_ingest import _chunk_pages

COURSE = "mathematical_analysis"
PROFILE = "chen-jixiu-3e"


def make_chunk(
    session,
    chunk_id: str,
    content: str,
    title: str = "",
    allowed_for_rag: bool = True,
    course_id: str = COURSE,
    source_id: str = "textbook-demo",
    locator: str = "第1章",
    source: dict | None = None,
) -> TextbookChunk:
    chunk = TextbookChunk(
        chunk_id=chunk_id,
        course_id=course_id,
        source_id=source_id,
        locator=locator,
        title=title,
        content=content,
        source=source
        if source is not None
        else {
            "allowed_for_rag": allowed_for_rag,
            "allowed_for_eval": False,
            "allowed_for_training": False,
            "retention_policy": "比赛演示期间保留",
            "license_note": "团队已获授权用于 RAG 检索测试",
        },
    )
    session.add(chunk)
    session.commit()
    return chunk


def test_search_textbook_chunks_filters_by_course(session):
    make_chunk(session, "chunk-a", "数列极限的定义", course_id=COURSE)
    make_chunk(session, "chunk-b", "线性代数向量空间", course_id="linear_algebra")

    results = search_textbook_chunks(session, COURSE, "极限")
    assert len(results) == 1
    assert results[0].chunk_id == "chunk-a"


def test_search_textbook_chunks_respects_rag_gate(session):
    make_chunk(session, "chunk-open", "开放的教材内容", allowed_for_rag=True)
    make_chunk(session, "chunk-closed", "未授权的教材内容", allowed_for_rag=False)

    results = search_textbook_chunks(session, COURSE, "教材")
    assert len(results) == 1
    assert results[0].chunk_id == "chunk-open"
    assert rag_allowed_chunk(results[0])


def test_rag_allowed_chunk_defaults_to_false(session):
    chunk = make_chunk(session, "chunk-no-rights", "无授权字段", source={})
    assert rag_allowed_chunk(chunk) is False


def test_mirror_pipeline_includes_chunk_in_context(session):
    make_chunk(session, "chunk-limit", "数列极限：对于任意 epsilon 存在 N...", title="数列极限")

    pipeline = MirrorPipeline(StubMirrorModel())
    response = pipeline.handle(
        session,
        CourseMirrorRequest(
            request_id="chunk-req-1",
            course_id=COURSE,
            course_profile_id=PROFILE,
            problem={"text": "什么是数列极限"},
            interaction_mode=InteractionMode.CONCEPT_EXPLANATION,
        ),
    )

    # 引用中应包含教材块
    sources = {c.source_id for c in response.citations}
    assert "textbook-demo" in sources
    chunk_citation = next(c for c in response.citations if c.source_id == "textbook-demo")
    assert chunk_citation.knowledge_id == "chunk-limit"


def test_mirror_pipeline_ignores_chunk_when_rag_disallowed(session):
    make_chunk(
        session,
        "chunk-disallowed",
        "数列极限的独家内容",
        allowed_for_rag=False,
    )

    pipeline = MirrorPipeline(StubMirrorModel())
    response = pipeline.handle(
        session,
        CourseMirrorRequest(
            request_id="chunk-req-2",
            course_id=COURSE,
            course_profile_id=PROFILE,
            problem={"text": "数列极限独家内容"},
            interaction_mode=InteractionMode.CONCEPT_EXPLANATION,
        ),
    )

    assert all(c.source_id != "textbook-demo" for c in response.citations)


def test_chunk_pages_splits_and_overlaps():
    pages = [
        (1, "第一节 数列极限\n\n数列极限是分析学的基础概念。\n\n" + "x" * 1200),
        (2, "第二节 函数极限\n\n函数极限描述自变量趋近时的行为。"),
    ]
    chunks = _chunk_pages(pages, source_id="demo", chunk_size=400, overlap=50)
    assert len(chunks) >= 2
    # 第一页超长应被切分
    assert any("第一节 数列极限" in c["title"] for c in chunks)
    # 第二页正常成块
    assert any("函数极限" in c["content"] for c in chunks)
    # 块标题取自首行
    assert all(c["title"] for c in chunks)
