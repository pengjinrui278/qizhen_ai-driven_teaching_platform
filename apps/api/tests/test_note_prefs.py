"""笔记偏好：选项片段、提示词拼装、来源标记、教材章节摘录。

这些文案只在服务端（用户要求「后端 skill 拟好提示词」），所以这里直接断言片段进了提示词。
"""
import pytest
from fastapi.testclient import TestClient

from mirror_api import note_prefs
from mirror_api.main import app, configure, _auth_attempts

H = {"X-Mirror-Request": "1"}


class Chunk:
    def __init__(self, chunk_id, title, content, kind="other", page=None, pdf_page=None):
        self.chunk_id = chunk_id
        self.title = title
        self.content = content
        self.source = {"kind": kind, "allowed_for_rag": True,
                       "source_spans": [{"printed_page": page, "pdf_page": pdf_page or 100,
                                         "block_index": int(chunk_id[1:])}]}


def chunk(index, section, content, **kw):
    kw.setdefault("pdf_page", 100 + index)
    return Chunk(f"c{index}", f"上册 · 第8章 反常积分 · {section}", content, **kw)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MIRROR_STAFF_INVITE_CODE", "staff-test")
    configure(app, "sqlite:///" + str(tmp_path / "prefs.sqlite"))
    _auth_attempts.clear()
    result = TestClient(app, headers=H)
    result.post("/api/v2/auth/register", json={"username": "prefs_student", "password": "test-only-password",
                                               "nickname": "prefs", "role": "student",
                                               "invite_code": "staff-test"})
    yield result
    app.state.engine.dispose()


def test_option_groups_shape_and_fragments():
    groups = note_prefs.option_groups()
    assert [g["id"] for g in groups["groups"]] == ["structure", "format", "chart", "driver", "depth", "purpose"]
    counts = {g["id"]: len(g["options"]) for g in groups["groups"]}
    assert counts == {"structure": 4, "format": 4, "chart": 6, "driver": 2, "depth": 2, "purpose": 3}
    # 片段随选项下发（偏好面板要往输入框插高亮要求），文案仍只由后端维护
    assert all("prompt" in option for g in groups["groups"] for option in g["options"])
    assert all(option["prompt"] == note_prefs._fragment(g["id"], option["id"])
               for g in groups["groups"] for option in g["options"]), "下发的片段要与服务端常量一致"
    # 除「无」以外每个选项都要有片段，否则选项形同虚设
    for group in note_prefs.GROUPS:
        for option in group["options"]:
            if option[0] == "none":
                assert option[3] == ""
            else:
                assert option[3].strip(), f"{group['id']}/{option[0]} 缺少提示词片段"


def test_compose_puts_every_choice_into_the_prompt():
    result = note_prefs.compose({
        "selections": {"structure": "qa", "depth": "plain", "purpose": "exam"},
        "free_text": "多讲判别法",
        "source": {"kind": "chapter", "chapter": "第8章 反常积分", "book_title": "数学分析"},
        "dest": {"course_id": "mathematical_analysis", "folder_path": "第8章"},
    }, course_label="数学分析")
    for fragment in (note_prefs._fragment("structure", "qa"), note_prefs._fragment("depth", "plain"),
                     note_prefs._fragment("purpose", "exam")):
        assert fragment in result["prompt"]
    assert "多讲判别法" in result["prompt"]
    assert "第8章 反常积分" in result["prompt"]
    assert "考前冲刺笔记" in result["prompt"]
    assert len(result["preview_sections"]) == 3
    assert result["warnings"] == []


def test_compose_works_with_nothing_selected():
    result = note_prefs.compose({"selections": {}, "free_text": "", "source": {}, "dest": {}})
    assert "（未指定" in result["prompt"]
    assert result["warnings"], "什么都没选要有提示，不能假装已经配置好了"
    assert "学习笔记" in result["prompt"]


def test_compose_rejects_overlong_prompt():
    with pytest.raises(ValueError):
        note_prefs.compose({"selections": {"structure": "outline"}, "free_text": "很" * 1200, "dest": {}})
    # 边界内不应报错
    note_prefs.compose({"selections": {}, "free_text": "很" * 100, "dest": {}})


def test_marker_roundtrip_and_rejects_junk():
    marker = note_prefs.build_marker({"v": 1, "mode": "generate", "src": {"k": "chapter", "ch": "第8章"},
                                      "p": {"purpose": "preview"}})
    text = f"请生成笔记\n\n{marker}"
    parsed = note_prefs.parse_marker(text)
    assert parsed["src"]["ch"] == "第8章" and parsed["p"]["purpose"] == "preview"
    assert note_prefs.strip_marker(text) == "请生成笔记"
    assert note_prefs.parse_marker("没有标记的普通消息") is None
    assert note_prefs.parse_marker("[[MIRROR-NOTE1 不是base64]]") is None
    assert note_prefs.parse_marker(note_prefs.build_marker({"v": 99})) is None, "版本不符要拒绝"


def test_marker_is_ascii_so_it_does_not_pollute_retrieval_tokens():
    from mirror_api.retrieval import _query_tokens
    marker = note_prefs.build_marker({"v": 1, "mode": "generate",
                                      "src": {"k": "chapter", "ch": "第8章 反常积分"}})
    assert marker.isascii(), "标记必须是纯 ASCII，否则中文章节名会混进检索词"
    # 且剥离后检索词里不应再出现章节名
    assert "反常" not in _query_tokens(note_prefs.strip_marker(f"生成笔记 {marker}"))


def test_note_material_keeps_section_index_and_respects_budget():
    chunks = ([chunk(i, "8.1 反常积分的概念", "定义内容。" * 40, kind="definition", page=235) for i in range(3)]
              + [chunk(10 + i, "8.2 收敛判别", "例题内容。" * 40, kind="example", page=250) for i in range(2)]
              + [chunk(20, "8.3 瑕积分", "证明内容。" * 60, kind="proof", page=270)]
              + [chunk(30, "8.2 收敛判别", "习题。" * 30, kind="exercise", page=260)])
    text, cited = note_prefs.build_note_material(chunks, {"p": {"purpose": "preview"}})
    assert "## 本章结构" in text, "章节目录必须恒发"
    for name in ("8.1 反常积分的概念", "8.2 收敛判别", "8.3 瑕积分"):
        assert name in text
    assert "习题" not in text, "预习用途不该带习题"
    assert cited, "要给出实际引用的块，回答才能标来源"

    exam_text, _ = note_prefs.build_note_material(chunks, {"p": {"purpose": "exam"}})
    assert "习题" in exam_text, "复习/冲刺用途要带习题"

    small, _ = note_prefs.build_note_material(chunks, {"p": {}}, budget_bytes=400)
    assert len(small.encode("utf-8")) < 4000
    assert "未列出" in small, "被截断时必须如实写明还有多少块没列出"


def test_note_material_when_chapter_has_no_chunks():
    text, cited = note_prefs.build_note_material([], {})
    assert cited == []
    assert "读不到" in text, "取不到内容要如实说，不能让模型凭印象写"


def test_note_material_orders_by_pdf_page_not_locator_string():
    chunks = [chunk(1, "8.1 节", "后一页", pdf_page=100), chunk(2, "8.1 节", "前一页", pdf_page=20)]
    text, _ = note_prefs.build_note_material(chunks, {})
    assert text.index("前一页") < text.index("后一页"), "p.20 必须排在 p.100 前面"


def test_endpoints_require_auth_and_compose(client):
    assert TestClient(app, headers=H).get("/api/v2/notes/preferences").status_code == 401

    prefs = client.get("/api/v2/notes/preferences").json()
    assert len(prefs["groups"]) == 6 and prefs["limits"]["prompt"] == note_prefs.MAX_TOTAL_CHARS

    made = client.post("/api/v2/notes/prompt", json={
        "selections": {"structure": "cornell", "purpose": "review"},
        "free_text": "把易错点单独列一节",
        "dest": {"course_id": "mathematical_analysis", "folder_path": "第8章 反常积分"}})
    assert made.status_code == 200, made.text
    body = made.json()
    assert note_prefs._fragment("structure", "cornell") in body["prompt"]
    assert body["marker"].startswith("[[MIRROR-NOTE1 ")
    assert body["dest"]["course_id"] == "mathematical_analysis"
    assert note_prefs.parse_marker(body["marker"])["p"]["purpose"] == "review"

    too_long = client.post("/api/v2/notes/prompt", json={"selections": {}, "free_text": "很" * 1200})
    assert too_long.status_code == 422
    assert "精简" in too_long.json()["detail"]


def test_preferences_route_is_not_swallowed_by_the_note_id_route(client):
    """GET /notes/preferences 必须命中偏好端点，而不是被当成 nid。"""
    assert client.get("/api/v2/notes/preferences").status_code == 200
    assert client.get("/api/v2/notes/不存在的id").status_code == 404


def test_find_mode_prompt_and_decision_payload():
    made = note_prefs.compose_find("反常积分的收敛判别")
    assert "反常积分的收敛判别" in made["prompt"]
    assert note_prefs.parse_marker(made["marker"])["q"] == "反常积分的收敛判别"
    assert note_prefs.decision_payload(None) == {}, "没有标记就不要往 decision 里塞字段"

    class Hit:
        id, course_id, folder_path, title = "n1", "mathematical_analysis", "第8章 反常积分", "预习笔记"
        starred, source, updated_at = True, "agent", None

    payload = note_prefs.decision_payload(note_prefs.parse_marker(made["marker"]), hits=[Hit()])
    assert payload["note_hits"][0]["title"] == "预习笔记"
    assert payload["note_hits"][0]["folder_path"] == "第8章 反常积分"


def test_note_ref_name_may_be_plain_base64():
    """引用块里的名字过去用普通 btoa 编码，会带 + 和 /，而正则只收 base64url 字符集——
    于是整个标记两端都匹配不到：服务端取不到被引用的笔记，标记还会原样漏进给模型的消息里。
    现在编码统一走 base64url，同时把名字那一组放宽，旧草稿也认得出、剥得掉。"""
    import base64

    from mirror_api.note_prefs import parse_note_refs, strip_note_refs

    name = "第8章 反常积分·预习笔记"
    plain = base64.b64encode(name.encode()).decode().rstrip("=")   # 含 + 或 /
    assert "+" in plain or "/" in plain, "这个名字的普通 base64 必须真的带 +//，否则测不到点子上"
    url = base64.urlsafe_b64encode(name.encode()).decode().rstrip("=")

    for token in (plain, url):
        text = f"帮我看看 [[MIRROR-REF1 note-alpha {token}]] 这篇"
        assert parse_note_refs(text) == ["note-alpha"], token
        stripped = strip_note_refs(text)
        assert "MIRROR-REF1" not in stripped, "引用标记不能留在给模型看的消息里"
        assert "帮我看看" in stripped and "这篇" in stripped, "剥掉标记不该伤到正文"
