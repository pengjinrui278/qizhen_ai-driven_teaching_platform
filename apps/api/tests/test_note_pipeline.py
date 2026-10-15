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


def _seed_note(db, nid, title, content, account="student", folder="", starred=False):
    from mirror_api.note_library import Note
    row = Note(id=nid, account_id=account, course_id="mathematical_analysis",
               folder_path=folder, title=title, kind="md", content=content, starred=starred,
               remark="", source="student", source_meta={})
    db.add(row)
    db.commit()
    return row


def test_free_note_request_retrieves_material_and_saves(note_db):
    """笔记模式下直接提要求（没走面板、没指定教材章）：也要能做出笔记并自动存库。"""
    from mirror_api.note_library import Note
    marker = build_marker({"v": 1, "mode": "generate", "src": {"k": "chat"}})
    model = CapturingModel()
    response = MirrorPipeline(model).handle(
        note_db, request_with(marker, number=7, message="帮我整理一份关于反常积分的笔记"))

    material = model.contexts[0].note_material
    assert "反常积分" in material, "要按这次的要求去教材里现找材料"
    assert "比较判别法" in material, "取到的应当是门控后的教材正文"
    assert "未授权正文" not in material, "没授权 RAG 的块不能进材料"

    saved = response.decision.get("note_saved")
    assert saved, "笔记模式下直接提要求也要落库，不能只回一条普通回答"
    assert note_db.get(Note, saved["id"]) is not None


def test_free_note_request_without_material_does_not_save(note_db):
    """取不到材料就别硬装成笔记任务：既不套笔记规则，也不落库。"""
    from mirror_api.note_library import Note
    marker = build_marker({"v": 1, "mode": "generate", "src": {"k": "chat"}})
    model = CapturingModel()
    before = note_db.query(Note).count()
    response = MirrorPipeline(model).handle(
        note_db, request_with(marker, number=8, message="完全无关的zqxjw关键词"))
    assert not model.contexts[0].note_material, "没有材料就不该塞 note_material"
    assert "note_saved" not in response.decision
    assert note_db.query(Note).count() == before


def test_merge_target_gets_appended_instead_of_a_new_note(note_db):
    """学生显式选了「并入这一篇」：由服务端追加，agent 不需要自己去写学生的笔记。"""
    from mirror_api.note_library import Note
    _seed_note(note_db, "note-a", "第8章 反常积分", "# 第8章\n\n旧的比较判别法笔记。")

    marker = build_marker({"v": 1, "mode": "generate", "src": {"k": "chat"},
                           "d": {"mg": "note-a"}})
    model = CapturingModel()
    response = MirrorPipeline(model).handle(
        note_db, request_with(marker, number=9, message="补一份反常积分的笔记"))

    material = model.contexts[0].note_material
    assert "要并入的笔记" in material, "要把目标笔记的现有内容交给模型去重"
    assert "旧的比较判别法笔记" in material
    assert "不要再重复" in material

    saved = response.decision["note_saved"]
    assert saved["merged"] is True, "应当并入而不是新建"
    assert saved["id"] == "note-a"
    assert note_db.query(Note).count() == 1, "并入不产生新行"

    row = note_db.get(Note, "note-a")
    assert "旧的比较判别法笔记" in row.content, "原有正文必须保留"
    assert "第8章 反常积分 · 预习笔记" in row.content, "新内容要追加在后面"
    assert "由助手整理" in row.content, "追加段要留一行出处"
    merged = row.source_meta["merged"]
    assert merged and merged[-1]["note_id"] == "note-a", "并入要留下来源记录"


def test_merge_never_touches_someone_elses_note(note_db):
    """目标 id 不是本人的：当作没选，另存新的，绝不动别人的笔记。"""
    from mirror_api.note_library import Note
    _seed_note(note_db, "note-b", "别人的笔记", "别人的正文", account="someone-else")

    marker = build_marker({"v": 1, "mode": "generate", "src": {"k": "chat"},
                           "d": {"mg": "note-b"}})
    model = CapturingModel()
    response = MirrorPipeline(model).handle(
        note_db, request_with(marker, number=10, message="补一份反常积分的笔记"))

    assert "要并入的笔记" not in model.contexts[0].note_material, "别人的笔记不进材料"
    saved = response.decision["note_saved"]
    assert saved["merged"] is False and saved["id"] != "note-b"
    assert note_db.get(Note, "note-b").content == "别人的正文", "别人的笔记一个字都不能动"
    assert note_db.query(Note).count() == 2


def test_selected_replies_keep_whole_long_answers(note_db):
    """长回答不能被拦腰截断：早先单处只给 6000 字节，笔记覆盖范围就错了。"""
    from mirror_api.models import MirrorEvent
    long_answer = "一致收敛的判别。" + "补充说明。" * 1200   # 远超 300 字
    note_db.add(MirrorEvent(request_id="r-long", course_id="mathematical_analysis",
                            profile_id="v1", participant_code="student", interaction_mode="chat",
                            request_payload={"message": "什么是一致收敛？"},
                            response_json={"answer": long_answer}))
    note_db.commit()

    marker = build_marker({"v": 1, "mode": "compose", "src": {"k": "replies", "ids": ["r-long"]}})
    model = CapturingModel()
    MirrorPipeline(model).handle(note_db, request_with(marker, number=11, message="整理成笔记"))

    material = model.contexts[0].note_material
    tail = "补充说明。" * 1200
    assert tail[:600] in material, "长回答应当整段进来，而不是只剩开头几句"


class OpsModel:
    """模拟模型在回答末尾附上操作块。"""

    name = "ops"
    dynamic_hints = False
    deep_max_tokens = None

    def __init__(self, answer):
        self.answer = answer
        self.contexts = []

    def generate(self, context):
        self.contexts.append(context)
        return self.answer


def test_agent_mode_executes_note_operations_and_hides_the_block(note_db):
    """agent 模式下模型可以真的改学生的笔记库：服务端执行，操作块不进可见正文。"""
    import json

    from mirror_api.note_library import Note
    from mirror_api.note_ops import OPS_FENCE

    _seed_note(note_db, "n1", "散着的笔记", "正文", folder="")
    _seed_note(note_db, "n2", "另一篇散的", "正文", folder="")

    block = ("```" + OPS_FENCE + "\n" + json.dumps({"ops": [
        {"op": "move", "ids": ["n1", "n2"], "folder": "第3章 级数"},
        {"op": "rename", "id": "n1", "title": "第3章 级数·复习笔记"},
    ]}, ensure_ascii=False) + "\n```")
    model = OpsModel("已经帮你把散在科目根的两篇归到第3章了。\n\n" + block)

    marker = build_marker({"v": 1, "mode": "agent", "src": {"k": "chat"}})
    response = MirrorPipeline(model).handle(
        note_db, request_with(marker, number=12, message="把我散在根目录的笔记整理一下"))

    context = model.contexts[0]
    assert context.note_ops_enabled is True, "要在 system 里告诉模型它有权管理笔记库"
    assert "id=n1" in context.note_material, "要把本人笔记的索引交给它，它才有 id 可用"

    assert OPS_FENCE not in response.answer, "操作块不能留在学生看得到的正文里"
    assert response.answer.startswith("已经帮你把散在科目根")

    receipt = response.decision["note_ops"]
    assert receipt["done"] == 2 and receipt["failed"] == 0
    assert note_db.get(Note, "n1").folder_path == "第3章 级数"
    assert note_db.get(Note, "n1").title == "第3章 级数·复习笔记"
    assert note_db.get(Note, "n2").folder_path == "第3章 级数"
    assert "note_saved" not in response.decision, "模型自己发过操作块就不该再自动新建一份"


def test_agent_mode_reports_ops_it_could_not_do(note_db):
    """模型编了一个不存在的 id：不能假装做成了。"""
    import json

    from mirror_api.note_library import Note
    from mirror_api.note_ops import OPS_FENCE

    _seed_note(note_db, "n1", "真的", "正文")
    model = OpsModel("改好了。\n\n```" + OPS_FENCE + "\n" + json.dumps(
        {"ops": [{"op": "rename", "id": "n-编造的", "title": "x"}]}, ensure_ascii=False) + "\n```")
    marker = build_marker({"v": 1, "mode": "agent", "src": {"k": "chat"}})
    response = MirrorPipeline(model).handle(
        note_db, request_with(marker, number=13, message="帮我改个标题"))

    receipt = response.decision["note_ops"]
    assert receipt["done"] == 0 and receipt["failed"] == 1
    assert "找不到" in receipt["results"][0]["detail"]
    assert note_db.get(Note, "n1").title == "真的"


def test_agent_mode_without_ops_still_saves_the_note(note_db):
    """笔记模式下直接提要求要能直接存进笔记库 —— 不能只回一条普通回答。"""
    from mirror_api.note_library import Note
    marker = build_marker({"v": 1, "mode": "agent", "src": {"k": "chat"}})
    model = CapturingModel()   # 不带操作块
    response = MirrorPipeline(model).handle(
        note_db, request_with(marker, number=14, message="整理一份反常积分的笔记"))
    assert "比较判别法" in model.contexts[0].note_material
    saved = response.decision.get("note_saved")
    assert saved and note_db.get(Note, saved["id"]) is not None


def test_agent_mode_managing_only_does_not_create_a_note(note_db):
    """只是想整理笔记库、没取到课程正文时，不该顺手存一份新笔记。"""
    import json

    from mirror_api.note_library import Note
    from mirror_api.note_ops import OPS_FENCE

    _seed_note(note_db, "n1", "散着的", "正文", folder="")
    model = OpsModel("已经归好了。\n\n```" + OPS_FENCE + "\n" + json.dumps(
        {"ops": [{"op": "move", "ids": ["n1"], "folder": "第3章"}]}, ensure_ascii=False) + "\n```")
    marker = build_marker({"v": 1, "mode": "agent", "src": {"k": "chat"}})
    before = note_db.query(Note).count()
    response = MirrorPipeline(model).handle(
        note_db, request_with(marker, number=15, message="把 zqxjw 那篇挪个位置"))

    assert note_db.query(Note).count() == before, "整理笔记库不该产生新笔记"
    assert "note_saved" not in response.decision
    assert response.decision["note_ops"]["done"] == 1


def test_plain_chat_has_no_note_ops_ability(note_db):
    """只有笔记模式下才把管理笔记库的权限交出去。"""
    model = CapturingModel()
    MirrorPipeline(model).handle(note_db, request_with("", number=16, message="什么是极限"))
    assert model.contexts[0].note_ops_enabled is False
