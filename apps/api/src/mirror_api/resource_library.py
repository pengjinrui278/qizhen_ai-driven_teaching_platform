"""Book metadata and private original files; no chunk search or public file mount.

The server-owned catalog and rights manifest live under data/resource-intake/R3.
Missing rights deny visibility/content. Intake is never itself a rights grant.
"""
import hashlib
import json
from functools import lru_cache
from pathlib import Path, PureWindowsPath
from typing import Literal

from fastapi import HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pypdf import PdfReader

from .config import REPO_ROOT

LIBRARY_ROOT = REPO_ROOT / "data" / "resource-intake" / "R3"
INTAKE_ALLOWLIST = frozenset({"circuits-alexander-sadiku-6e"})
PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}


class Entry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resource_id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,127}$")
    course_id: str
    kind: Literal["textbook", "exam"]
    title: str
    authors: list[str] = Field(default_factory=list)
    edition: str | None = None
    volume: str | None = None
    publication_year: int | None = None
    exam_year: int | None = None
    tags: list[str] = Field(default_factory=list)
    isbn: str | None = None
    completeness: Literal["unverified", "partial", "complete"] = "unverified"
    # Only explicit course bindings in the reviewed catalog assign this role.
    role: Literal["primary", "supplementary", "unassigned"] = "unassigned"
    pdf_filename: str | None = None
    cover_filename: str | None = None
    sha256: str | None = Field(default=None, pattern=r"^[A-Fa-f0-9]{64}$")


class Grant(BaseModel):
    model_config = ConfigDict(extra="forbid")
    catalog_authenticated: bool = False
    catalog_accounts: list[str] = Field(default_factory=list)
    content_authenticated: bool = False
    content_accounts: list[str] = Field(default_factory=list)

    def visible(self, account_id):
        return self.catalog_authenticated or account_id in self.catalog_accounts

    def readable(self, account_id):
        return self.visible(account_id) and (
            self.content_authenticated or account_id in self.content_accounts
        )


def _read_json(name, default):
    path = LIBRARY_ROOT / name
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        raise HTTPException(503, "资源目录暂不可用") from None


def catalog():
    try:
        rows = [Entry.model_validate(row) for row in _read_json("catalog.json", {"items": []})["items"]]
        if len({row.resource_id for row in rows}) != len(rows):
            raise ValueError("duplicate resource id")
        grants = {key: Grant.model_validate(value)
                  for key, value in _read_json("rights.json", {}).items()}
        return rows, grants
    except (ValidationError, KeyError, TypeError, AttributeError, ValueError):
        raise HTTPException(503, "资源目录暂不可用") from None


def _file(filename):
    if not filename:
        return None
    try:
        relative = Path(filename)
        win = PureWindowsPath(filename)
        if (relative.is_absolute() or win.drive or ":" in filename
                or ".." in win.parts or ".." in relative.parts):
            return None
        root = LIBRARY_ROOT.resolve()
        path = (root / relative).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            return None
        return path
    except (OSError, ValueError, RuntimeError):
        return None


@lru_cache(maxsize=128)
def _pdf_info(path_string, size, mtime_ns, expected_hash):
    # File signature invalidates the cache when an administrator replaces a file.
    try:
        with Path(path_string).open("rb") as stream:
            if stream.read(5) != b"%PDF-":
                return None
            stream.seek(0)
            if expected_hash and hashlib.file_digest(stream, "sha256").hexdigest() != expected_hash.lower():
                return None
            stream.seek(0)
            reader = PdfReader(stream)
            if reader.is_encrypted:
                return None
            return len(reader.pages) or None
    except Exception:  # noqa: BLE001 -- malformed local files are pending, never raw API errors
        return None


def pdf_info(entry):
    path = _file(entry.pdf_filename)
    if path is None:
        return None, None
    try:
        stat = path.stat()
        count = _pdf_info(str(path), stat.st_size, stat.st_mtime_ns, entry.sha256)
        return (path, count) if count else (None, None)
    except OSError:
        return None, None


def cover_info(entry):
    path = _file(entry.cover_filename)
    if path is not None:
        try:
            with path.open("rb") as stream:
                header = stream.read(8)
            if header == b"\x89PNG\r\n\x1a\n":
                return path, "image/png", ".png"
            if header.startswith(b"\xff\xd8\xff"):
                return path, "image/jpeg", ".jpg"
        except OSError:
            pass
    return None, None, None


def listing(account_id, q="", course_id=None, kind=None, year=None, tag=None, page=1, page_size=20):
    rows, grants = catalog()
    tokens = q.casefold().split()
    selected = []
    for row in rows:
        grant = grants.get(row.resource_id, Grant())
        if not grant.visible(account_id):
            continue
        book_year = row.exam_year if row.kind == "exam" else row.publication_year
        haystack = " ".join([row.title, *row.authors, row.isbn or "", *row.tags]).casefold()
        if ((course_id is not None and row.course_id != course_id)
                or (kind is not None and row.kind != kind)
                or (year is not None and book_year != year)
                or (tag is not None and tag not in row.tags)
                or not all(token in haystack for token in tokens)):
            continue
        selected.append((row, grant))
    selected.sort(key=lambda pair: (pair[0].title.casefold(), pair[0].resource_id))
    items = []
    for row, grant in selected[(page - 1) * page_size:page * page_size]:
        pdf, count = pdf_info(row)
        cover, _, _ = cover_info(row)
        readable = grant.readable(account_id)
        base = f"/api/v2/material-library/{row.resource_id}"
        public = row.model_dump(exclude={"pdf_filename", "cover_filename", "sha256", "isbn"})
        public.update(page_count=count, availability=("restricted" if not readable else
                      "ready" if pdf else "pending"),
                      pdf_url=base + "/pdf" if readable and pdf else None,
                      cover_url=base + "/cover" if readable and cover else None)
        items.append(public)
    return {"items": items, "total": len(selected), "page": page, "page_size": page_size}


class PrivateFileResponse(FileResponse):
    async def __call__(self, scope, receive, send):
        async def private_send(message):
            if message["type"] == "http.response.start":
                # Starlette emits separate 400/416 responses for invalid ranges.
                headers = [(k, v) for k, v in message["headers"]
                           if k.lower() not in (b"cache-control", b"x-content-type-options")]
                headers.extend((k.lower().encode(), v.encode()) for k, v in PRIVATE_HEADERS.items())
                message = {**message, "headers": headers}
            await send(message)
        await super().__call__(scope, receive, private_send)


def original(account_id, resource_id, kind):
    rows, grants = catalog()
    entry = next((r for r in rows if r.resource_id == resource_id), None)
    grant = grants.get(resource_id, Grant())
    # Visibility is not permission to access full content; deny without path leaks.
    if entry is None or not grant.readable(account_id):
        raise HTTPException(404, "资源不存在或无权访问", headers=PRIVATE_HEADERS)
    if kind == "pdf":
        path, _ = pdf_info(entry)
        media, suffix = "application/pdf", ".pdf"
    else:
        path, media, suffix = cover_info(entry)
    if path is None:
        raise HTTPException(409, "资源文件尚未就绪", headers=PRIVATE_HEADERS)
    return PrivateFileResponse(path, media_type=media, filename=entry.resource_id + suffix,
                               content_disposition_type="inline", headers=PRIVATE_HEADERS)


def prepare_circuits_catalog():
    """Explicit local intake command, not startup/import side effect; never grants rights."""
    raw = _read_json("intake.json", {"items": []})
    items = []
    for value in raw["items"]:
        if value.get("resource_id") not in INTAKE_ALLOWLIST:
            continue
        if value.get("course_id") != "electronic_circuits":
            raise ValueError("allowlisted resource has incorrect course")
        row = Entry.model_validate({k: v for k, v in value.items() if k in Entry.model_fields})
        # Intake does not constitute an explicit primary/supplementary binding.
        row.role = "unassigned"
        if pdf_info(row)[0] is None:
            raise ValueError("allowlisted PDF is missing, encrypted, corrupt or has a hash mismatch")
        items.append(row.model_dump())
    if len(items) != 1:
        raise ValueError("expected exactly one allowlisted circuit textbook")
    target = LIBRARY_ROOT / "catalog.json"
    if target.exists():
        raise FileExistsError("review existing catalog before replacing")
    target.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"imported": [item["resource_id"] for item in items], "rights_granted": False}
