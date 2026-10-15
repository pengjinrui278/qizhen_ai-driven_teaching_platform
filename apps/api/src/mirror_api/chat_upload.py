"""对话里的文档上传：抽正文文本，供 agent 读取。

边界（如实）：
- 只抽**文本**（PDF / Word / PPT / txt / md / 代码）。扫描件 PDF 抽不出字就是抽不出，
  返回空正文并如实告诉用户，不假装读到了；音视频等只存不读。
- 原文件落本地磁盘（data/chat-uploads/），不入仓库、不进镜像；正文存库便于内联。
- 只属于本人：跨账号一律 404。
"""
import io
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import DateTime, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from .config import REPO_ROOT
from .models import Base, utcnow
from .platform_api import db_for, user_for

router = APIRouter(prefix="/api/v2", tags=["uploads"])

UPLOAD_ROOT = REPO_ROOT / "data" / "chat-uploads"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_TEXT_CHARS = 200_000          # 单份文档能进上下文的上限，超了截断并如实标注

DOC_KINDS = {
    ".pdf": "pdf",
    ".docx": "word", ".doc": "word", ".rtf": "word", ".odt": "word",
    ".pptx": "ppt", ".ppt": "ppt",
    ".txt": "text", ".md": "markdown", ".markdown": "markdown", ".csv": "text",
    ".json": "text", ".tex": "text", ".log": "text",
    ".py": "code", ".ipynb": "code", ".c": "code", ".cpp": "code", ".h": "code",
    ".java": "code", ".js": "code", ".ts": "code", ".tsx": "code", ".r": "code",
    ".m": "code", ".sql": "code", ".sh": "code",
}
TEXTUAL = {"text", "markdown", "code"}
KIND_LABEL = {"pdf": "PDF", "word": "Word", "ppt": "PPT", "text": "文本",
              "markdown": "Markdown", "code": "代码"}


class ChatUpload(Base):
    __tablename__ = "chat_uploads"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(64), index=True)
    filename: Mapped[str] = mapped_column(String(200))
    mime: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    kind: Mapped[str] = mapped_column(String(16), default="text")
    size: Mapped[int] = mapped_column(default=0)
    chars: Mapped[int] = mapped_column(default=0)
    text: Mapped[str] = mapped_column(Text, default="")
    storage_key: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


def public(row: ChatUpload):
    return {"id": row.id, "filename": row.filename, "kind": row.kind,
            "kind_label": KIND_LABEL.get(row.kind, "文件"), "size": row.size,
            "chars": row.chars, "readable": bool((row.text or "").strip())}


def _decode(payload: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "gbk", "latin-1"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    return payload.decode("utf-8", errors="replace")


def extract_text(name: str, payload: bytes, kind: str) -> str:
    """按类型抽正文。抽不到就返回空串——调用方据此如实告知，不要编。"""
    suffix = Path(name).suffix.lower()
    try:
        if kind == "pdf":
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(payload))
            return "\n\n".join((page.extract_text() or "").strip() for page in reader.pages).strip()
        if kind == "word" and suffix in {".docx", ".odt"}:
            import docx
            document = docx.Document(io.BytesIO(payload))
            parts = [p.text.strip() for p in document.paragraphs if p.text.strip()]
            for table in document.tables:
                for row in table.rows:
                    parts.append(" | ".join(cell.text.strip() for cell in row.cells))
            return "\n".join(parts).strip()
        if kind == "ppt" and suffix == ".pptx":
            from pptx import Presentation
            deck = Presentation(io.BytesIO(payload))
            slides = []
            for index, slide in enumerate(deck.slides, 1):
                lines = [shape.text_frame.text.strip() for shape in slide.shapes
                         if shape.has_text_frame and shape.text_frame.text.strip()]
                if lines:
                    slides.append(f"## 第 {index} 页\n" + "\n".join(lines))
            return "\n\n".join(slides).strip()
        if kind in TEXTUAL:
            return _decode(payload).strip()
    except Exception:  # noqa: BLE001 -- 解析失败按「读不出来」处理，不让上传整个失败
        return ""
    return ""   # .doc / .ppt 老格式没有纯 Python 解析器，如实返回读不到


@router.post("/uploads")
async def create_upload(file: UploadFile = File(...), db=Depends(db_for), user=Depends(user_for)):
    name = re.sub(r"[\x00-\x1f/\\]", "_", Path(file.filename or "文件").name)[:180] or "文件"
    suffix = Path(name).suffix.lower()
    kind = DOC_KINDS.get(suffix)
    if kind is None:
        raise HTTPException(415, "暂不支持这种文件；支持 PDF、Word、PPT、txt/md 与常见代码文件")
    payload = await file.read()
    if not payload:
        raise HTTPException(400, "文件是空的")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "文件请小于 25MB")

    text = extract_text(name, payload, kind)
    truncated = len(text) > MAX_TEXT_CHARS
    if truncated:
        text = text[:MAX_TEXT_CHARS] + "\n\n（文档过长，已截断）"

    account_dir = UPLOAD_ROOT / user.id
    account_dir.mkdir(parents=True, exist_ok=True)
    key = f"{user.id}/{uuid.uuid4().hex}{suffix}"
    (UPLOAD_ROOT / key).write_bytes(payload)

    row = ChatUpload(id=uuid.uuid4().hex, account_id=user.id, filename=name,
                     mime=file.content_type or "application/octet-stream", kind=kind,
                     size=len(payload), chars=len(text), text=text, storage_key=key)
    db.add(row)
    db.commit()
    result = public(row)
    if not result["readable"]:
        result["note"] = ("这份文件没抽出文字（可能是扫描件，或 Word/PPT 的旧格式）。"
                          "文件已存下，但我读不到内容，你需要的话可以换 PDF 或新版 Office 文件。")
    return result


def load_uploads(db, account_id: str, ids: list[str]) -> list[ChatUpload]:
    """按 id 取本人上传的文档（顺序按传入 ids）。"""
    if not ids:
        return []
    rows = db.execute(select(ChatUpload).where(
        ChatUpload.account_id == account_id, ChatUpload.id.in_(ids[:20]))).scalars().all()
    by_id = {row.id: row for row in rows}
    return [by_id[i] for i in ids if i in by_id]


def _upload_path(storage_key: str):
    from pathlib import PureWindowsPath
    if not storage_key:
        return None
    try:
        relative = Path(storage_key)
        win = PureWindowsPath(storage_key)
        if relative.is_absolute() or win.drive or ":" in storage_key or ".." in win.parts:
            return None
        root = UPLOAD_ROOT.resolve()
        path = (root / relative).resolve()
        return path if path.is_relative_to(root) and path.is_file() else None
    except (OSError, ValueError, RuntimeError):
        return None


def purge_uploads(db, account_id: str) -> None:
    """删除本人全部上传（账号注销 / 保留期清理用）；不提交。"""
    rows = db.execute(select(ChatUpload).where(ChatUpload.account_id == account_id)).scalars().all()
    for row in rows:
        path = _upload_path(row.storage_key)
        if path:
            try:
                path.unlink()
            except OSError:
                pass
        db.delete(row)
