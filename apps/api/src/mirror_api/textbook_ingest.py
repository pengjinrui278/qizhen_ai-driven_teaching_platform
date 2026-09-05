"""教材 PDF 抽取与 TextbookChunk 入库。

抽取库优先使用 ``pypdf``（纯 Python，跨平台）。若发现公式乱码，可替换为
``pymupdf`` 或 ``marker``；本模块只暴露 ``extract_pages`` / ``ingest_textbook``，
底层实现变更不影响 CLI。
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Protocol

from sqlalchemy.orm import Session

from .models import TextbookChunk


def _default_source(license_note: str) -> dict:
    return {
        "allowed_for_rag": True,
        "allowed_for_eval": False,
        "allowed_for_training": False,
        "retention_policy": "比赛演示期间保留，赛后按需审计",
        "license_note": license_note,
    }


class PdfExtractor(Protocol):
    def extract_text(self, path: Path) -> list[tuple[int, str]]: ...


class PypdfExtractor:
    """pypdf 抽取实现。"""

    def extract_text(self, path: Path) -> list[tuple[int, str]]:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        pages: list[tuple[int, str]] = []
        for index, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            pages.append((index, text.strip()))
        return pages


def _chunk_pages(
    pages: list[tuple[int, str]],
    source_id: str,
    chunk_size: int,
    overlap: int,
) -> list[dict]:
    """把页面文本流切分为带重叠的块。

    策略：按段落（双换行）优先切分；若段落仍过长，再按 chunk_size 硬切。
    """
    chunks: list[dict] = []
    buffer = ""
    current_locator = ""

    def flush():
        nonlocal buffer, current_locator
        if buffer.strip():
            title = buffer.strip().split("\n", 1)[0][:120]
            chunks.append(
                {
                    "locator": current_locator,
                    "title": title,
                    "content": buffer.strip(),
                }
            )
        buffer = ""

    for page_number, text in pages:
        if not text:
            continue
        locator = f"{source_id} · 第 {page_number} 页"
        # 段落边界优先
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        for paragraph in paragraphs:
            if not buffer:
                current_locator = locator
            if len(buffer) + len(paragraph) < chunk_size:
                buffer += "\n\n" + paragraph if buffer else paragraph
            else:
                flush()
                buffer = paragraph
                current_locator = locator
            # 单个段落超长时硬切
            while len(buffer) > chunk_size * 1.5:
                cut_at = buffer.rfind("\n", 0, chunk_size)
                if cut_at < 100:
                    cut_at = chunk_size
                piece = buffer[:cut_at].strip()
                if piece:
                    title = piece.split("\n", 1)[0][:120]
                    chunks.append(
                        {
                            "locator": current_locator,
                            "title": title,
                            "content": piece,
                        }
                    )
                # 保留重叠文本
                overlap_start = max(0, cut_at - overlap)
                buffer = buffer[overlap_start:].strip()

    flush()
    return chunks


def ingest_textbook(
    session: Session,
    pdf_path: Path,
    course_id: str,
    source_id: str,
    *,
    license_note: str,
    chunk_size: int = 800,
    overlap: int = 100,
    extractor: PdfExtractor | None = None,
) -> int:
    """把单个 PDF 教材切片入库，返回写入的块数。

    幂等：同一 ``(course_id, source_id, locator)`` 已存在时覆盖内容。
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF 不存在：{pdf_path}")

    extractor = extractor or PypdfExtractor()
    pages = extractor.extract_text(pdf_path)
    chunks = _chunk_pages(pages, source_id, chunk_size, overlap)

    source = _default_source(license_note)
    written = 0

    for chunk in chunks:
        locator = chunk["locator"]
        existing = session.query(TextbookChunk).filter_by(
            course_id=course_id, source_id=source_id, locator=locator
        ).first()
        if existing is not None:
            existing.title = chunk["title"]
            existing.content = chunk["content"]
            existing.source = source
        else:
            session.add(
                TextbookChunk(
                    chunk_id=uuid.uuid4().hex,
                    course_id=course_id,
                    source_id=source_id,
                    locator=locator,
                    title=chunk["title"],
                    content=chunk["content"],
                    source=source,
                )
            )
        written += 1

    session.commit()
    return written
