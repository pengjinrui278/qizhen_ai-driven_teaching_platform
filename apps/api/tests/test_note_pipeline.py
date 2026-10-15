"""笔记标记走一遍真实管线：标记 → 按章取门控材料 → 进上下文 → 回显 decision。

用合成模型捕获 MirrorContext，断言模型真的看到了整章材料（而不只是 top-3 片段）。
"""
import pytest
from sqlalchemy import select

from mirror_api.db import init_db, make_engine, make_session_factory
from mirror_api.domain import CourseMirrorRequest
from mirror_api.mirror_service import MirrorPipeline
from mirror_api.models import Course, CoursePack, CourseProfileRow, TextbookChunk
from mirror_api.note_prefs import build_marker
from mirror_api.retrieval import chapter_chunks


class CapturingModel:
    """把送进模型的上下文留下来，回答固定。"""

    name = "capturing"
    dynamic_hints = False
    deep_max_tokens = None

    def __init__(self):
        self.contexts = []

    def generate(self, context):
        self.contexts.append(context)
        return "第8章 反常积分 · 预习笔记\n\n1. 比较判别法……"


@pytest.fixture()
def note_db(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'note-pipeline.sqlite'}")
    init_db(engine)
    with make_session_factory(engine)() as db:
        db.add(Course(course_id="mathematical_analysis", display_name="数学分析",
                      mirror_name="数分 Mirror", stage="flagship"))
        db.flush()
        db.add(CourseProfileRow(course_id="mathematical_analysis", profile_id="v1"))
        db.add(CoursePack(coursepack_id="pack", course_id="mathematical_analysis",
                          profile_id="v1", status="schema_trial"))
        db.flush()
        rows = [
            ("c1", "上册 · 第8章 反常积分 · 8.1 概念", "定义 8.1 无穷限积分的定义。", 235, True, "definition"),
            ("c2", "上册 · 第8章 反常积分 · 8.1 概念", "定理 8.1 比较判别法。", 236, True, "theorem"),
            ("c3", "上册 · 第8章 反常积分 · 8.2 瑕积分", "瑕积分的定义。", 210, True, "definition"),
            ("c4", "上册 · 第8章 反常积分 · 8.2 瑕积分", "未授权正文，不该出现。", 211, False, "other"),
            ("c5", "上册 · 第9章 级数 · 9.1 数项级数", "别的章节，不该出现。", 300, True, "definition"),
        ]
        for index, (cid, title, content, page, allowed, kind) in enumerate(rows):
            db.add(TextbookChunk(chunk_id=cid, course_id="mathematical_analysis",
                                 source_id="book-1", title=title, content=content,
                                 locator=f"上册 · p.{page}",
                                 source={"allowed_for_rag": allowed, "kind": kind,
                                         "source_spans": [{"printed_page": page, "pdf_page": page,
                                                           "block_index": index}]}))
        db.commit()
        yield db
    engine.dispose()


def request_with(marker, number=1, message="请生成一份预习笔记"):
    return CourseMirrorRequest(
        request_id=f"note-{number}", course_id="mathematical_analysis", course_profile_id="v1",
        participant_code="student", attempt_id="attempt", interaction_mode="chat",
        problem={"text": message}, message=f"{message}\n\n{marker}")


def test_chapter_chunks_gates_and_orders_by_page(note_db):
    rows = chapter_chunks(note_db, "book-1", "第8章 反常积分")
    assert [row.chunk_id for row in rows] == ["c3", "c1", "c2"], "按页序，且滤掉未授权块与其它章"
    assert all(row.source["allowed_for_rag"] for row in rows)


def test_marker_puts_chapter_material_into_the_model_context(note_db):
    marker = build_marker({"v": 1, "mode": "generate",
                           "src": {"k": "chapter", "sid": "book-1", "ch": "第8章 反常积分"},
                           "p": {"purpose": "preview"}})
    model = CapturingModel()
    response = MirrorPipeline(model).handle(note_db, request_with(marker))

    context = model.contexts[0]
    assert "教材章节内容" in context.note_material, "整章材料要进上下文"
    assert "比较判别法" in context.note_material, "该章的定义/定理要带上"
    assert "别的章节，不该出现" not in context.note_material, "不能跨章取内容"
    assert "未授权正文，不该出现" not in context.note_material, "未授权块绝不能进上下文"
    assert "## 本章结构" in context.note_material, "章节目录要恒发"

    # 标记本身不能出现在给模型看的消息里
    assert "MIRROR-NOTE1" not in context.message
    assert context.message.startswith("请生成一份预习笔记")

    # 来源门控：引用的块必须是授权块，且回答里能看到出处
    assert response.citations, "笔记回答要带资料来源"
    assert all(c.source_id == "book-1" for c in response.citations)

    # 面板选择回显给前端（确认卡重载后还能重建）
    assert response.decision["note_prefs"]["prefs"]["purpose"] == "preview"
    assert response.decision["note_prefs"]["src"]["ch"] == "第8章 反常积分"


def test_without_marker_nothing_changes(note_db):
    model = CapturingModel()
    response = MirrorPipeline(model).handle(note_db, request_with("", message="什么是反常积分？"))
    assert model.contexts[0].note_material == "", "普通提问不该带上笔记材料"
    assert "note_prefs" not in response.decision, "没有标记就不要往 decision 里塞字段"


def test_find_mode_retrieves_own_notes_only(note_db):
    from mirror_api.note_library import Note

    note_db.add_all([
        Note(id="n1", account_id="student", course_id="mathematical_analysis",
             folder_path="第8章 反常积分", title="反常积分·预习笔记", content="比较判别法"),
        Note(id="n2", account_id="someone_else", course_id="mathematical_analysis",
             folder_path="", title="别人的反常积分笔记", content="比较判别法"),
    ])
    note_db.commit()

    marker = build_marker({"v": 1, "mode": "find", "q": "反常积分"})
    model = CapturingModel()
    response = MirrorPipeline(model).handle(note_db, request_with(marker, number=2, message="帮我找笔记"))

    material = model.contexts[0].note_material
    assert "反常积分·预习笔记" in material, "要给出命中的笔记"
    assert "别人的反常积分笔记" not in material, "只能检索本人的笔记"
    hits = response.decision["note_hits"]
    assert [hit["id"] for hit in hits] == ["n1"]
    assert hits[0]["folder_path"] == "第8章 反常积分", "结果卡要能显示精确位置"


def test_compose_mode_organizes_selected_replies_and_saves_the_note(note_db):
    """笔记模式：选中几处回答 → agent 整理成一份 → 自动存进笔记库。"""
    from mirror_api.models import MirrorEvent
    from mirror_api.note_library import Note

    for rid, question, answer in [("r1", "什么是一致收敛？", "一致收敛指……"),
                                  ("r2", "逐点收敛呢？", "逐点收敛指……")]:
        note_db.add(MirrorEvent(request_id=rid, course_id="mathematical_analysis",
                                profile_id="v1", participant_code="student",
                                interaction_mode="chat", request_payload={"message": question},
                                response_json={"answer": answer}))
    note_db.commit()

    marker = build_marker({"v": 1, "mode": "compose", "src": {"k": "replies", "ids": ["r1", "r2"]},
                           "p": {"purpose": "review"}, "d": {"f": "第8章 反常积分"}})
    model = CapturingModel()
    response = MirrorPipeline(model).handle(note_db, request_with(marker, number=4, message="整理成一份笔记"))

    material = model.contexts[0].note_material
    assert "一致收敛指" in material and "逐点收敛指" in material, "要把选中的回答取回来当素材"
    assert "不要按原顺序照抄" in material, "要明确要求整理而不是照抄"

    saved = response.decision.get("note_saved")
    assert saved, "笔记模式下应当自动落库"
    row = note_db.get(Note, saved["id"])
    assert row is not None and row.account_id == "student"
    assert row.source == "agent" and row.folder_path == "第8章 反常积分"
    assert row.content == "第8章 反常积分 · 预习笔记\n\n1. 比较判别法……", "存的应当是模型写出来的正文"
    assert "复习笔记" in row.title, "标题要带上用途"
    assert row.source_meta["mode"] == "compose"


def test_find_mode_never_saves_a_note(note_db):
    """找笔记不是生成笔记，不能顺手往库里写东西。"""
    from mirror_api.note_library import Note
    marker = build_marker({"v": 1, "mode": "find", "q": "反常积分"})
    model = CapturingModel()
    response = MirrorPipeline(model).handle(note_db, request_with(marker, number=5, message="帮我找笔记"))
    assert "note_saved" not in response.decision
    assert note_db.query(Note).count() == 0


def test_plain_chat_never_saves_a_note(note_db):
    from mirror_api.note_library import Note
    model = CapturingModel()
    response = MirrorPipeline(model).handle(note_db, request_with("", number=6, message="什么是极限"))
    assert "note_saved" not in response.decision
    assert note_db.query(Note).count() == 0


def test_chapter_material_is_not_duplicated_into_knowledge(note_db):
    """材料走 note_material；再塞进 knowledge 会被 bounded_context 截到 8 个节点。"""
    marker = build_marker({"v": 1, "mode": "generate",
                           "src": {"k": "chapter", "sid": "book-1", "ch": "第8章 反常积分"}})
    model = CapturingModel()
    MirrorPipeline(model).handle(note_db, request_with(marker, number=3))
    context = model.contexts[0]
    assert not [node for node in context.knowledge if node["knowledge_id"].startswith("c")], \
        "教材块不应同时出现在 knowledge 里"
