"""我的笔记：笔记库、回收站、附件、批量整理与导出。

边界：笔记只属于本人（跨账号一律 404）；回收站满 30 天由治理任务连附件一并清理。
"""
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from mirror_api import note_library
from mirror_api.governance import expire_personal
from mirror_api.main import app, configure, _auth_attempts
from mirror_api.note_library import Note, NoteAttachment, search_notes

H = {"X-Mirror-Request": "1"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MIRROR_STAFF_INVITE_CODE", "staff-test")
    # 附件落到临时目录，别写进仓库的 data/
    monkeypatch.setattr(note_library, "ATTACHMENT_ROOT", tmp_path / "note-attachments")
    configure(app, "sqlite:///" + str(tmp_path / "notes.sqlite"))
    _auth_attempts.clear()
    result = TestClient(app, headers=H)
    register(result, "note_student")
    yield result
    app.state.engine.dispose()


def register(client, name, role="student"):
    r = client.post("/api/v2/auth/register", json={"username": name, "password": "test-only-password",
                                                   "nickname": name, "role": role, "invite_code": "staff-test"})
    assert r.status_code == 200, r.text
    return r.json()


def make_note(client, title="第8章 反常积分·预习笔记", **extra):
    body = {"title": title, "content": "# 反常积分\n\n比较判别法……", "course_id": "mathematical_analysis",
            "folder_path": "第8章 反常积分", "source": "agent", **extra}
    r = client.post("/api/v2/notes", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_authentication_required(client):
    anonymous = TestClient(app, headers=H)
    assert anonymous.get("/api/v2/notes").status_code == 401
    assert anonymous.post("/api/v2/notes", json={"title": "x"}).status_code == 401


def test_create_list_patch_and_cross_account_isolation(client):
    note = make_note(client)
    assert note["course_id"] == "mathematical_analysis"
    assert note["source"] == "agent"
    assert note["starred"] is False
    assert client.get("/api/v2/notes").json()["total"] == 1

    assert client.patch(f"/api/v2/notes/{note['id']}", json={
        "title": "改名后的笔记", "starred": True, "remark": "考前重点",
        "folder_path": "第9章 级数"}).status_code == 200
    got = client.get(f"/api/v2/notes/{note['id']}").json()
    assert got["title"] == "改名后的笔记"
    assert got["starred"] is True and got["remark"] == "考前重点"
    assert got["folder_path"] == "第9章 级数"
    assert got["created_at"] and got["updated_at"]

    assert client.get("/api/v2/notes?starred=1").json()["total"] == 1
    assert client.get("/api/v2/notes?q=考前").json()["total"] == 1
    assert client.get("/api/v2/notes?q=不存在的词").json()["total"] == 0

    other = TestClient(app, headers=H)
    register(other, "note_teacher", "teacher")
    assert other.get(f"/api/v2/notes/{note['id']}").status_code == 404
    assert other.patch(f"/api/v2/notes/{note['id']}", json={"title": "偷改"}).status_code == 404
    assert other.delete(f"/api/v2/notes/{note['id']}").status_code == 404
    assert other.get("/api/v2/notes").json() == {"items": [], "total": 0}


def test_bulk_move_stars_and_counts_foreign_ids(client):
    first, second = make_note(client, "笔记一"), make_note(client, "笔记二")
    other = TestClient(app, headers=H)
    register(other, "note_teacher", "teacher")
    foreign = make_note(other, "别人的笔记")

    r = client.post("/api/v2/notes/bulk", json={"ids": [first["id"], second["id"], foreign["id"]],
                                                "folder_path": "第10章 总复习", "starred": True})
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["count"] == 2 and result["skipped"] == 1, "别人的笔记必须被跳过并如实计数"
    for nid in (first["id"], second["id"]):
        got = client.get(f"/api/v2/notes/{nid}").json()
        assert got["folder_path"] == "第10章 总复习" and got["starred"] is True
    assert other.get(f"/api/v2/notes/{foreign['id']}").json()["folder_path"] == "第8章 反常积分"


def test_recycle_bin_hides_restores_and_purges(client):
    note = make_note(client)
    assert client.delete(f"/api/v2/notes/{note['id']}").json() == {"ok": True, "purged": False}

    assert client.get("/api/v2/notes").json()["total"] == 0, "回收站里的笔记不应出现在正常列表"
    trashed = client.get("/api/v2/notes?trash=1").json()
    assert trashed["total"] == 1
    assert trashed["items"][0]["id"] == note["id"]
    assert trashed["items"][0]["deleted_from"] == "第8章 反常积分"
    assert trashed["items"][0]["deleted_at"]
    assert client.get(f"/api/v2/notes/{note['id']}").status_code == 404, "回收站里的笔记不应能直接打开"

    assert client.post(f"/api/v2/notes/{note['id']}/restore").status_code == 200
    restored = client.get(f"/api/v2/notes/{note['id']}").json()
    assert restored["deleted_at"] is None
    assert restored["folder_path"] == "第8章 反常积分", "还原后仍在原目录"
    assert client.get("/api/v2/notes").json()["total"] == 1
    assert client.get("/api/v2/notes?trash=1").json()["total"] == 0

    client.delete(f"/api/v2/notes/{note['id']}")
    assert client.delete(f"/api/v2/notes/{note['id']}?purge=1").json() == {"ok": True, "purged": True}
    assert client.get(f"/api/v2/notes/{note['id']}").status_code == 404
    assert client.get("/api/v2/notes?trash=1").json()["total"] == 0


def test_attachment_upload_preview_and_private_download(client):
    note = make_note(client)
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 32
    r = client.post(f"/api/v2/notes/{note['id']}/attachments",
                    files={"file": ("课堂板书.png", png, "image/png")})
    assert r.status_code == 200, r.text
    att = r.json()
    assert att["kind"] == "image" and att["size"] == len(png)

    assert client.post(f"/api/v2/notes/{note['id']}/attachments",
                       files={"file": ("x.exe", b"MZ", "application/octet-stream")}).status_code == 415

    listed = client.get(f"/api/v2/notes/{note['id']}").json()["attachments"]
    assert [a["filename"] for a in listed] == ["课堂板书.png"]

    download = client.get(f"/api/v2/notes/attachments/{att['id']}")
    assert download.status_code == 200 and download.content == png
    assert download.headers["cache-control"] == "private, no-store"
    assert download.headers["x-content-type-options"] == "nosniff"
    assert "inline" in download.headers["content-disposition"], "图片应能直接在线看"

    other = TestClient(app, headers=H)
    register(other, "note_teacher", "teacher")
    assert other.get(f"/api/v2/notes/attachments/{att['id']}").status_code == 404

    # 彻底删除要连附件文件一起清掉
    client.delete(f"/api/v2/notes/{note['id']}?purge=1")
    assert client.get(f"/api/v2/notes/attachments/{att['id']}").status_code == 404
    account_dir = note_library.ATTACHMENT_ROOT / "note_student"
    assert not any(p.is_file() for p in account_dir.glob("**/*")) if account_dir.exists() else True


def test_export_docx_pptx_md_and_html(client):
    note = make_note(client, "导数与微分",
                     content="# 导数\n\n- 定义：$f'(x)=\\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}$\n\n"
                             "| 法则 | 条件 |\n|---|---|\n| 链式 | 可导 |\n\n```mermaid\nflowchart TD\n A-->B\n```\n")
    for fmt in ("docx", "pptx"):
        r = client.get(f"/api/v2/notes/{note['id']}/export?format={fmt}")
        assert r.status_code == 200, r.text
        assert r.content[:2] == b"PK", f"{fmt} 应是 OOXML 包"
        assert "attachment" in r.headers["content-disposition"]
    html = client.get(f"/api/v2/notes/{note['id']}/export?format=html")
    assert html.status_code == 200 and html.content.startswith(b"<!doctype")
    md = client.get(f"/api/v2/notes/{note['id']}/export?format=md")
    assert md.content.decode("utf-8") == note["content"]
    assert client.get(f"/api/v2/notes/{note['id']}/export?format=exe").status_code == 400

    other = TestClient(app, headers=H)
    register(other, "note_teacher", "teacher")
    assert other.get(f"/api/v2/notes/{note['id']}/export?format=docx").status_code == 404


def test_trash_expiry_purges_note_and_attachment_file(client):
    note = make_note(client)
    att = client.post(f"/api/v2/notes/{note['id']}/attachments",
                      files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")}).json()
    client.delete(f"/api/v2/notes/{note['id']}")

    with app.state.session_factory() as db:
        stored = db.get(NoteAttachment, att["id"]).storage_key
        file_path = note_library.ATTACHMENT_ROOT / stored
        assert file_path.is_file()
        db.get(Note, note["id"]).deleted_at = datetime.now(UTC) - timedelta(days=31)
        db.commit()
        expire_personal(db)

    with app.state.session_factory() as db:
        assert db.get(Note, note["id"]) is None, "回收站超期笔记应被彻底清理"
        assert db.query(NoteAttachment).count() == 0
    assert not file_path.exists(), "附件文件也要一起删掉"


def test_fresh_trash_survives_retention_sweep(client):
    note = make_note(client)
    client.delete(f"/api/v2/notes/{note['id']}")
    with app.state.session_factory() as db:
        expire_personal(db)
    assert client.get("/api/v2/notes?trash=1").json()["total"] == 1, "刚删的笔记不能被保留期扫掉"
    assert client.post(f"/api/v2/notes/{note['id']}/restore").status_code == 200


def test_search_notes_ranks_title_over_body(client):
    account_id = client.get("/api/v2/me").json()["id"]
    make_note(client, "第8章 反常积分·预习笔记", content="与关键词无关")
    make_note(client, "随手记", content="反常积分的比较判别法")
    with app.state.session_factory() as db:
        hits = search_notes(db, account_id, "反常积分")
        assert [h.title for h in hits] == ["第8章 反常积分·预习笔记", "随手记"]
        assert search_notes(db, account_id, "完全没有的词") == []


def test_export_and_delete_account_cover_notes(client):
    note = make_note(client)
    client.post(f"/api/v2/notes/{note['id']}/attachments",
                files={"file": ("a.png", b"\x89PNG", "image/png")})
    exported = client.get("/api/v2/me/export").json()
    assert exported["notes"][0]["title"] == note["title"]
    assert exported["note_attachments"][0]["filename"] == "a.png"

    assert client.post("/api/v2/me/delete", json={"password": "test-only-password",
                                                  "confirmed": True}).status_code == 200
    with app.state.session_factory() as db:
        assert db.query(Note).count() == 0
        assert db.query(NoteAttachment).count() == 0
