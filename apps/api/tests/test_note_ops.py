"""agent 直接管理笔记库：操作块的解析、校验、执行与越权防护。

两条底线要一直守住：
1. 只能动本人的笔记——模型幻觉出来的 id、别人的 id，一律丢掉并如实回报；
2. 只软删，不彻底删——agent 没有 purge 这条路。
"""
import pytest

from mirror_api.db import init_db, make_engine, make_session_factory
from mirror_api.note_library import Note
from mirror_api.note_ops import (
    OPS_FENCE,
    apply_ops,
    build_note_index,
    operations_payload,
    parse_ops,
)


@pytest.fixture()
def ops_db(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'note-ops.sqlite'}")
    init_db(engine)
    with make_session_factory(engine)() as db:
        yield db
    engine.dispose()


def add_note(db, nid, title="笔记", content="正文", account="student", folder="", starred=False):
    row = Note(id=nid, account_id=account, course_id="mathematical_analysis",
               folder_path=folder, title=title, kind="md", content=content, starred=starred,
               remark="", source="student", source_meta={})
    db.add(row)
    db.commit()
    return row


def block(*ops):
    import json
    return "```" + OPS_FENCE + "\n" + json.dumps({"ops": list(ops)}, ensure_ascii=False) + "\n```"


# ---------- 解析 ----------

def test_parse_ops_strips_the_block_from_the_visible_answer():
    answer = "已经帮你整理好了。\n\n" + block({"op": "star", "ids": ["n1"], "starred": True})
    clean, ops = parse_ops(answer)
    assert clean == "已经帮你整理好了。", "学生不该看到那段 JSON"
    assert OPS_FENCE not in clean
    assert ops == [{"op": "star", "ids": ["n1"], "starred": True}]


def test_parse_ops_keeps_the_answer_intact_when_the_block_is_broken():
    answer = "正文。\n\n```" + OPS_FENCE + "\n{不是 JSON\n```"
    clean, ops = parse_ops(answer)
    assert ops == [], "解析不出来就什么都不做"
    assert "正文。" in clean


def test_parse_ops_without_a_block_changes_nothing():
    clean, ops = parse_ops("就是一段普通回答。")
    assert clean == "就是一段普通回答。" and ops == []


# ---------- 索引 ----------

def test_note_index_lists_ids_and_marks_the_truncation(ops_db):
    for i in range(70):
        add_note(ops_db, f"n{i}", title=f"第{i}篇")
    index = build_note_index(ops_db.query(Note).all())
    assert "id=n0" in index, "要给出可以引用的 id"
    assert "未列出" in index, "截断了就要如实说，模型才不会去引用不存在的 id"


def test_note_index_says_so_when_the_library_is_empty():
    assert "一篇笔记都没有" in build_note_index([])


# ---------- 执行 ----------

def test_apply_ops_saves_a_new_note(ops_db):
    results = apply_ops(ops_db, "student",
                        [{"op": "save", "title": "第8章 反常积分", "folder": "第8章",
                          "body": "# 反常积分\n\n比较判别法。"}],
                        default_course="mathematical_analysis")
    assert results[0]["ok"] and results[0]["detail"].startswith("新建了")
    row = ops_db.query(Note).one()
    assert row.title == "第8章 反常积分" and row.folder_path == "第8章"
    assert row.account_id == "student" and row.source == "agent"
    assert row.course_id == "mathematical_analysis", "没给科目时用当前课程兜底"


def test_apply_ops_moves_renames_stars_and_deletes(ops_db):
    add_note(ops_db, "n1", title="散着的笔记", folder="")
    add_note(ops_db, "n2", title="另一篇", folder="")

    results = apply_ops(ops_db, "student", [
        {"op": "move", "ids": ["n1", "n2"], "folder": "第3章 级数"},
        {"op": "rename", "id": "n1", "title": "第3章 级数·复习笔记"},
        {"op": "star", "ids": ["n1"], "starred": True},
        {"op": "remark", "id": "n1", "text": "考前再看"},
        {"op": "delete", "ids": ["n2"]},
    ])
    assert all(item["ok"] for item in results), results

    n1, n2 = ops_db.get(Note, "n1"), ops_db.get(Note, "n2")
    assert n1.folder_path == "第3章 级数" and n2.folder_path == "第3章 级数"
    assert n1.title == "第3章 级数·复习笔记"
    assert n1.starred is True and n1.remark == "考前再看"
    assert n2.deleted_at is not None, "删除是软删，还能还原"
    assert n2.deleted_from == "第3章 级数", "要记住原来在哪，还原才回得去"


def test_apply_ops_restores_from_the_recycle_bin(ops_db):
    add_note(ops_db, "n1", folder="第3章")
    apply_ops(ops_db, "student", [{"op": "delete", "ids": ["n1"]}])
    assert ops_db.get(Note, "n1").deleted_at is not None

    results = apply_ops(ops_db, "student", [{"op": "restore", "ids": ["n1"]}])
    assert results[0]["ok"], results
    row = ops_db.get(Note, "n1")
    assert row.deleted_at is None and row.folder_path == "第3章", "还原要回到原来的目录"


def test_apply_ops_appends_to_an_existing_note(ops_db):
    add_note(ops_db, "n1", title="第8章", content="# 第8章\n\n旧内容。")
    results = apply_ops(ops_db, "student",
                        [{"op": "append", "id": "n1", "body": "补充：比较判别法。"}])
    assert results[0]["ok"]
    content = ops_db.get(Note, "n1").content
    assert "旧内容。" in content and "补充：比较判别法。" in content


def test_apply_ops_updates_the_whole_body(ops_db):
    add_note(ops_db, "n1", content="旧的")
    assert apply_ops(ops_db, "student",
                     [{"op": "update", "id": "n1", "body": "全新的正文"}])[0]["ok"]
    assert ops_db.get(Note, "n1").content == "全新的正文"


# ---------- 越权与幻觉 ----------

def test_ops_never_touch_someone_elses_notes(ops_db):
    add_note(ops_db, "n-other", title="别人的", content="别人的正文", account="someone-else")
    results = apply_ops(ops_db, "student", [
        {"op": "rename", "id": "n-other", "title": "改掉"},
        {"op": "delete", "ids": ["n-other"]},
        {"op": "move", "ids": ["n-other"], "folder": "第1章"},
    ])
    assert all(not item["ok"] for item in results), results
    row = ops_db.get(Note, "n-other")
    assert row.title == "别人的" and row.content == "别人的正文"
    assert row.deleted_at is None and row.folder_path == ""


def test_ops_drop_hallucinated_ids_and_report_it(ops_db):
    add_note(ops_db, "n1", title="真的", folder="")
    results = apply_ops(ops_db, "student",
                        [{"op": "move", "ids": ["n1", "n-编造出来的"], "folder": "第3章"}])
    assert results[0]["ok"], "真实的那些还是要动"
    assert "1 篇没找到" in results[0]["detail"], "没找到的要如实说"
    assert ops_db.get(Note, "n1").folder_path == "第3章"


def test_unknown_ops_are_skipped_not_executed(ops_db):
    add_note(ops_db, "n1")
    results = apply_ops(ops_db, "student", [
        {"op": "purge", "ids": ["n1"]},
        {"op": "drop_table", "ids": ["n1"]},
    ])
    assert all(not item["ok"] for item in results)
    assert ops_db.get(Note, "n1") is not None, "agent 没有彻底删除这条路"
    assert isinstance(ops_db.get(Note, "n1").deleted_at, type(None))


def test_one_bad_op_does_not_stop_the_rest(ops_db):
    add_note(ops_db, "n1", folder="")
    results = apply_ops(ops_db, "student", [
        {"op": "rename", "id": "n-不存在", "title": "x"},
        {"op": "move", "ids": ["n1"], "folder": "第3章"},
    ])
    assert [item["ok"] for item in results] == [False, True]
    assert ops_db.get(Note, "n1").folder_path == "第3章"


def test_move_without_folder_keeps_the_current_one(ops_db):
    """只换科目不动目录时，不能顺手把目录清成科目根。"""
    add_note(ops_db, "n1", folder="第3章 级数")
    apply_ops(ops_db, "student", [{"op": "move", "ids": ["n1"], "course_id": "university_physics"}])
    row = ops_db.get(Note, "n1")
    assert row.course_id == "university_physics" and row.folder_path == "第3章 级数"


def test_operations_payload_is_absent_when_nothing_ran():
    assert operations_payload([]) == {}
    payload = operations_payload([{"op": "save", "ok": True, "detail": "新建了《x》"}])["note_ops"]
    assert payload["done"] == 1 and payload["failed"] == 0


def test_init_db_heals_columns_missing_from_an_older_database(tmp_path):
    """create_all 只建新表、不给已有的表补列。

    老库缺了 notes.deleted_at 会整个 500（回收站读不出来），缺了 ai_messages.note_ops
    同理。_heal_additive_columns 就是为这个加的，而且要幂等、要保住既有数据。
    """
    from sqlalchemy import inspect, text

    from mirror_api.db import init_db, make_engine, make_session_factory

    url = f"sqlite:///{tmp_path / 'legacy.sqlite'}"
    engine = make_engine(url)
    init_db(engine)
    with make_session_factory(engine)() as db:
        db.add(Note(id="keep", account_id="student", course_id="", folder_path="第3章",
                    title="老数据", kind="md", content="必须留下来", starred=False,
                    remark="", source="student", source_meta={}))
        db.commit()
    # 模拟「升级前就存在的库」：把后来才加的两列去掉
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE notes DROP COLUMN deleted_at"))
        connection.execute(text("ALTER TABLE notes DROP COLUMN deleted_from"))
        connection.execute(text("ALTER TABLE ai_messages DROP COLUMN note_ops"))

    init_db(engine)   # 再跑一次：应当把缺的列补回来
    columns = {c["name"] for c in inspect(engine).get_columns("notes")}
    assert {"deleted_at", "deleted_from"} <= columns, "缺的列要补回来"
    assert "note_ops" in {c["name"] for c in inspect(engine).get_columns("ai_messages")}

    with make_session_factory(engine)() as db:
        row = db.get(Note, "keep")
        assert row is not None and row.content == "必须留下来", "补列不能动既有数据"
        assert row.deleted_at is None and row.folder_path == "第3章"

    init_db(engine)   # 幂等：再跑一次不该出错
    engine.dispose()
