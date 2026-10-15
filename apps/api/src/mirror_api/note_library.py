"""我的笔记：课程维度的笔记知识库（自写 + agent 生成），含多格式附件。

边界：笔记只属于本人（教师/TA 看不到）；附件落本地磁盘，不入仓库、不进镜像；
新表由 create_all 自动建，不改既有表结构（当前无迁移工具）。
"""
import hashlib
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path, PureWindowsPath
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import JSON, DateTime, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from . import note_prefs
from .config import REPO_ROOT
from .models import Base, Course, utcnow
from .platform_api import db_for, user_for

router = APIRouter(prefix="/api/v2", tags=["notes"])

ATTACHMENT_ROOT = REPO_ROOT / "data" / "note-attachments"
# 回收站保留期：删除满 30 天后由治理任务连同附件文件彻底清理（见 governance.expire_personal）。
TRASH_RETENTION_DAYS = 30
MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}
KINDS = {"md", "text", "code", "image", "pdf", "doc", "ppt", "sheet", "video", "audio", "archive", "other"}
EXT_KIND = {
    ".md": "md", ".markdown": "md", ".txt": "text", ".csv": "text", ".json": "text", ".tex": "text",
    ".py": "code", ".ipynb": "code", ".c": "code", ".cpp": "code", ".java": "code", ".js": "code", ".ts": "code", ".r": "code", ".m": "code",
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image", ".svg": "image",
    ".pdf": "pdf",
    ".doc": "doc", ".docx": "doc", ".rtf": "doc", ".odt": "doc",
    ".ppt": "ppt", ".pptx": "ppt", ".key": "ppt",
    ".xls": "sheet", ".xlsx": "sheet", ".numbers": "sheet",
    ".mp4": "video", ".webm": "video", ".mov": "video", ".mkv": "video",
    ".mp3": "audio", ".wav": "audio", ".m4a": "audio", ".flac": "audio",
    ".zip": "archive", ".rar": "archive", ".7z": "archive", ".tar": "archive", ".gz": "archive",
}
SAFE_EXT = frozenset(EXT_KIND)


class Note(Base):
    __tablename__ = "notes"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(64), index=True)
    course_id: Mapped[str] = mapped_column(String(64), index=True, default="")
    folder_path: Mapped[str] = mapped_column(String(200), default="")   # 形如「第3章 极限」，空=科目根
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16), default="md")
    content: Mapped[str] = mapped_column(Text, default="")
    starred: Mapped[bool] = mapped_column(default=False)
    remark: Mapped[str] = mapped_column(String(500), default="")
    source: Mapped[str] = mapped_column(String(16), default="student")   # student | agent
    source_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    # 回收站：软删除保留 30 天可还原，过期由 governance.expire_personal 连附件一并清理。
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    deleted_from: Mapped[str] = mapped_column(String(200), default="")   # 删除时所在目录，仅用于回显
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class NoteAttachment(Base):
    __tablename__ = "note_attachments"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    note_id: Mapped[str] = mapped_column(String(64), index=True)
    account_id: Mapped[str] = mapped_column(String(64), index=True)
    filename: Mapped[str] = mapped_column(String(200))
    mime: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size: Mapped[int] = mapped_column(default=0)
    sha256: Mapped[str] = mapped_column(String(64), default="")
    storage_key: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


def _stamp(value):
    return value.isoformat() if value else None


def public_note(row, with_content=True):
    data = {
        "id": row.id, "course_id": row.course_id, "folder_path": row.folder_path,
        "title": row.title, "kind": row.kind, "starred": row.starred, "remark": row.remark,
        "source": row.source, "source_meta": row.source_meta or {},
        "deleted_at": _stamp(row.deleted_at), "deleted_from": row.deleted_from or "",
        "created_at": _stamp(row.created_at), "updated_at": _stamp(row.updated_at),
        "has_content": bool((row.content or "").strip()),
    }
    if with_content:
        data["content"] = row.content or ""
    return data


def public_attachment(row):
    return {"id": row.id, "note_id": row.note_id, "filename": row.filename, "mime": row.mime,
            "size": row.size, "sha256": row.sha256, "kind": EXT_KIND.get(Path(row.filename).suffix.lower(), "other"),
            "created_at": _stamp(row.created_at)}


def own_note(db, nid, user, *, include_deleted=False):
    row = db.get(Note, nid)
    if row is None or row.account_id != user.id:
        raise HTTPException(404, "笔记不存在")
    if row.deleted_at is not None and not include_deleted:
        raise HTTPException(404, "笔记已在回收站")
    return row


def save_agent_note(db, account_id, course_id, title, content, source_meta=None, folder_path="", starred=False):
    """笔记模式下由 agent 自主落库（用户已授权自动保存，事后可在对话里撤回）。

    不提交，交给调用方的事务边界；标题与目录由 note_prefs 从面板选择/正文推断。
    """
    row = Note(id=uuid.uuid4().hex, account_id=account_id, course_id=course_id or "",
               folder_path=(folder_path or "").strip()[:200], title=(title or "课程笔记")[:200],
               kind="md", content=content or "", starred=bool(starred), remark="",
               source="agent", source_meta=source_meta or {})
    db.add(row)
    db.flush()
    return row


def search_notes(db, account_id, q, limit=8):
    """按关键词在本人笔记里检索（标题 > 目录 > 备注 > 正文，命中越多越靠前）。

    只用本人数据；已进回收站的笔记不参与。给「帮我找一份笔记」用。
    """
    from .retrieval import _query_tokens

    tokens = _query_tokens(q or "")
    rows = db.execute(select(Note).where(Note.account_id == account_id, Note.deleted_at.is_(None))).scalars().all()
    scored = []
    for row in rows:
        haystacks = ((row.title or "").lower(), (row.folder_path or "").lower(),
                     (row.remark or "").lower(), (row.content or "").lower())
        weights = (5, 3, 2, 1)
        score = 0
        for token in tokens:
            probe = token.lower()
            for text, weight in zip(haystacks, weights):
                if probe and probe in text:
                    score += weight
        if score:
            scored.append((score, row))
    scored.sort(key=lambda pair: (-pair[0], pair[1].updated_at or datetime.min.replace(tzinfo=UTC)))
    return [row for _, row in scored[:limit]]


def migrate_ai_notes(db, user):
    """把旧的 AI 学习笔记并入知识库（科目=AI 素养），幂等；失败不影响正常读取。"""
    try:
        from .ai_learning import AINote
    except Exception:
        return
    rows = db.execute(select(AINote).where(AINote.account_id == user.id)).scalars().all()
    if not rows:
        return
    existing = {meta.get("ai_note_id") for meta in (
        (row.source_meta or {}) for row in
        db.execute(select(Note).where(Note.account_id == user.id, Note.source == "agent")).scalars().all())}
    created = False
    for old in rows:
        if old.id in existing:
            continue
        db.add(Note(id=uuid.uuid4().hex, account_id=user.id, course_id="ai_literacy", folder_path="",
                    title=(old.title or "AI 学习笔记")[:200], kind="md", content=old.content or "",
                    source="agent", source_meta={"ai_note_id": old.id, "migrated_from": "ai_notes",
                                                 "citations": old.citations or []},
                    created_at=old.created_at or utcnow(), updated_at=old.created_at or utcnow()))
        created = True
    if created:
        db.commit()


class NoteInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=60000)
    course_id: str = Field(default="", max_length=64)
    folder_path: str = Field(default="", max_length=200)
    kind: str = Field(default="md", max_length=16)
    starred: bool = False
    remark: str = Field(default="", max_length=500)
    source: str = Field(default="student", pattern="^(student|agent)$")
    source_meta: dict = Field(default_factory=dict)


class NotePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, max_length=60000)
    course_id: str | None = Field(default=None, max_length=64)
    folder_path: str | None = Field(default=None, max_length=200)
    starred: bool | None = None
    remark: str | None = Field(default=None, max_length=500)
    # 「并入已有笔记」不产生新行，靠这里把来源追加进目标笔记，避免合并后丢出处。
    append_source_meta: dict | None = None


@router.get("/notes")
def list_notes(course_id: str = "", q: str = "", starred: bool = False, trash: bool = False,
               migrate: bool = True, db=Depends(db_for), user=Depends(user_for)):
    if migrate:
        migrate_ai_notes(db, user)
    rows = db.execute(select(Note).where(Note.account_id == user.id).order_by(Note.updated_at.desc())).scalars().all()
    keyword = q.strip().lower()
    items = []
    for row in rows:
        if (row.deleted_at is not None) != trash:
            continue
        if course_id and row.course_id != course_id:
            continue
        if starred and not row.starred:
            continue
        if keyword and keyword not in (row.title + " " + row.remark + " " + row.content).lower():
            continue
        items.append(public_note(row, with_content=False))
    return {"items": items, "total": len(items)}


class NotePromptInput(BaseModel):
    mode: Literal["generate", "find"] = "generate"
    selections: dict[str, str] = Field(default_factory=dict)   # {"structure":"outline", ...}
    free_text: str = Field(default="", max_length=1200)
    source: dict = Field(default_factory=dict)                 # {"kind":"chapter","source_id":..,"chapter":..}
    dest: dict = Field(default_factory=dict)                   # 建议存放位置
    query: str = Field(default="", max_length=200)             # mode == "find"


# 注意：这两条必须声明在 GET /notes/{nid} 之前，否则 "preferences" 会被当成 nid 吞掉。
@router.get("/notes/preferences")
def note_preferences(db=Depends(db_for), user=Depends(user_for)):
    """笔记偏好面板的选项与提示（提示词片段留在服务端，前端不硬编码文案）。"""
    folders = db.execute(select(Note.folder_path).where(
        Note.account_id == user.id, Note.deleted_at.is_(None), Note.folder_path != "").distinct()).scalars().all()
    return note_prefs.option_groups(sorted(set(folders))[:50])


@router.post("/notes/prompt")
def note_prompt(body: NotePromptInput, db=Depends(db_for), user=Depends(user_for)):
    """把面板选择拼成提示词 + 来源标记；前端把提示词放进输入框，用户自己点发送。"""
    course = db.get(Course, (body.dest or {}).get("course_id") or "")
    try:
        if body.mode == "find":
            return note_prefs.compose_find(body.query, body.dest)
        return note_prefs.compose(body.model_dump(),
                                  course_label=course.display_name if course else "本课程")
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/notes/{nid}")
def get_note(nid: str, db=Depends(db_for), user=Depends(user_for)):
    row = own_note(db, nid, user)
    attachments = db.execute(select(NoteAttachment).where(NoteAttachment.note_id == nid)
                             .order_by(NoteAttachment.created_at)).scalars().all()
    return {**public_note(row), "attachments": [public_attachment(a) for a in attachments]}


EXPORT_MEDIA = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "html": "text/html; charset=utf-8",
    "md": "text/markdown; charset=utf-8",
}


@router.get("/notes/{nid}/export")
def export_note(nid: str, format: str = "docx", db=Depends(db_for), user=Depends(user_for)):
    """从 Markdown 正文导出笔记；docx/pptx 为单向导出，导出后不再与正文同步。"""
    row = own_note(db, nid, user)
    fmt = (format or "").strip().lower()
    if fmt not in EXPORT_MEDIA:
        raise HTTPException(400, "只支持 docx / pptx / html / md 导出")
    if fmt == "md":
        payload = (row.content or "").encode("utf-8")
    else:
        from .note_export import RENDERERS
        payload = RENDERERS[fmt](row.title, row.content or "")
    filename = _safe_name(f"{row.title}.{fmt}")
    headers = {**PRIVATE_HEADERS,
               "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    return Response(content=payload, media_type=EXPORT_MEDIA[fmt], headers=headers)


@router.post("/notes")
def create_note(body: NoteInput, db=Depends(db_for), user=Depends(user_for)):
    kind = body.kind if body.kind in KINDS else "md"
    row = Note(id=uuid.uuid4().hex, account_id=user.id, course_id=body.course_id, folder_path=body.folder_path.strip(),
               title=body.title.strip(), kind=kind, content=body.content, starred=body.starred,
               remark=body.remark, source=body.source, source_meta=body.source_meta or {})
    db.add(row)
    db.commit()
    return public_note(row)


class NoteBulk(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)
    course_id: str | None = Field(default=None, max_length=64)
    folder_path: str | None = Field(default=None, max_length=200)
    starred: bool | None = None


@router.post("/notes/bulk")
def bulk_notes(body: NoteBulk, db=Depends(db_for), user=Depends(user_for)):
    """批量移动 / 改科目 / 标星：界面多选移动与 agent「整理我的笔记」共用同一端点。

    不属于本人或已在回收站的 id 跳过并在 skipped 里如实计数，不静默假装成功。
    """
    updated, skipped = [], 0
    for nid in body.ids:
        row = db.get(Note, nid)
        if row is None or row.account_id != user.id or row.deleted_at is not None:
            skipped += 1
            continue
        if body.course_id is not None:
            row.course_id = body.course_id
        if body.folder_path is not None:
            row.folder_path = body.folder_path.strip()
        if body.starred is not None:
            row.starred = body.starred
        row.updated_at = utcnow()
        updated.append(row.id)
    db.commit()
    return {"ok": True, "updated": updated, "count": len(updated), "skipped": skipped}


@router.patch("/notes/{nid}")
def patch_note(nid: str, body: NotePatch, db=Depends(db_for), user=Depends(user_for)):
    row = own_note(db, nid, user)
    if body.title is not None:
        row.title = body.title.strip()
    if body.content is not None:
        row.content = body.content
    if body.course_id is not None:
        row.course_id = body.course_id
    if body.folder_path is not None:
        row.folder_path = body.folder_path.strip()
    if body.starred is not None:
        row.starred = body.starred
    if body.remark is not None:
        row.remark = body.remark
    if body.append_source_meta:
        meta = dict(row.source_meta or {})
        history = list(meta.get("provenance") or [])
        history.append(body.append_source_meta)
        meta["provenance"] = history[-8:]          # 只留最近 8 次来源，避免无限膨胀
        meta["last_merge_at"] = utcnow().isoformat()
        row.source_meta = meta
    row.updated_at = utcnow()
    db.commit()
    return public_note(row)


def _attachment_path(storage_key):
    if not storage_key:
        return None
    try:
        relative = Path(storage_key)
        win = PureWindowsPath(storage_key)
        if relative.is_absolute() or win.drive or ":" in storage_key or ".." in win.parts or ".." in relative.parts:
            return None
        root = ATTACHMENT_ROOT.resolve()
        path = (root / relative).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            return None
        return path
    except (OSError, ValueError, RuntimeError):
        return None


class PrivateFileResponse(FileResponse):
    async def __call__(self, scope, receive, send):
        async def private_send(message):
            if message["type"] == "http.response.start":
                headers = [(k, v) for k, v in message["headers"]
                           if k.lower() not in (b"cache-control", b"x-content-type-options")]
                headers.extend((k.lower().encode(), v.encode()) for k, v in PRIVATE_HEADERS.items())
                message = {**message, "headers": headers}
            await send(message)
        await super().__call__(scope, receive, private_send)


def purge_note(db, row):
    """彻底删除笔记及其附件文件与附件行（回收站清空 / 治理任务共用）；不提交，由调用方决定事务边界。"""
    for att in db.execute(select(NoteAttachment).where(NoteAttachment.note_id == row.id)).scalars().all():
        path = _attachment_path(att.storage_key)
        if path:
            try:
                path.unlink()
            except OSError:
                pass
        db.delete(att)
    db.delete(row)


@router.delete("/notes/{nid}")
def delete_note(nid: str, purge: bool = False, db=Depends(db_for), user=Depends(user_for)):
    row = own_note(db, nid, user, include_deleted=True)
    if purge:
        purge_note(db, row)
        db.commit()
        return {"ok": True, "purged": True}
    if row.deleted_at is None:
        row.deleted_at = utcnow()
        row.deleted_from = row.folder_path
        row.updated_at = utcnow()
        db.commit()
    return {"ok": True, "purged": False}


@router.post("/notes/{nid}/restore")
def restore_note(nid: str, db=Depends(db_for), user=Depends(user_for)):
    row = own_note(db, nid, user, include_deleted=True)
    if row.deleted_at is not None:
        row.deleted_at = None
        row.deleted_from = ""
        row.updated_at = utcnow()
        db.commit()
    return public_note(row)


def _safe_name(filename):
    base = Path(filename or "附件").name
    return re.sub(r"[\x00-\x1f/\\]", "_", base)[:180] or "附件"


@router.post("/notes/{nid}/attachments")
async def upload_attachment(nid: str, file: UploadFile = File(...), db=Depends(db_for), user=Depends(user_for)):
    row = own_note(db, nid, user)
    name = _safe_name(file.filename)
    suffix = Path(name).suffix.lower()
    if suffix not in SAFE_EXT:
        raise HTTPException(415, "暂不支持这种文件类型；支持常见文档、图片、音视频与代码文件")
    payload = await file.read()
    if not payload:
        raise HTTPException(400, "文件为空")
    if len(payload) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(413, "文件请小于 25MB")
    account_dir = ATTACHMENT_ROOT / user.id
    account_dir.mkdir(parents=True, exist_ok=True)
    key = f"{user.id}/{uuid.uuid4().hex}{suffix}"
    (ATTACHMENT_ROOT / key).write_bytes(payload)
    att = NoteAttachment(id=uuid.uuid4().hex, note_id=row.id, account_id=user.id, filename=name,
                         mime=file.content_type or "application/octet-stream", size=len(payload),
                         sha256=hashlib.sha256(payload).hexdigest(), storage_key=key)
    db.add(att)
    row.updated_at = utcnow()
    db.commit()
    return public_attachment(att)


@router.get("/notes/attachments/{aid}")
def download_attachment(aid: str, db=Depends(db_for), user=Depends(user_for)):
    att = db.get(NoteAttachment, aid)
    if att is None or att.account_id != user.id:
        raise HTTPException(404, "附件不存在", headers=PRIVATE_HEADERS)
    path = _attachment_path(att.storage_key)
    if path is None:
        raise HTTPException(409, "附件文件缺失", headers=PRIVATE_HEADERS)
    kind = EXT_KIND.get(Path(att.filename).suffix.lower(), "other")
    inline = kind in {"image", "pdf", "md", "text"}
    return PrivateFileResponse(path, media_type=att.mime or "application/octet-stream",
                               filename=att.filename, content_disposition_type="inline" if inline else "attachment",
                               headers=PRIVATE_HEADERS)
