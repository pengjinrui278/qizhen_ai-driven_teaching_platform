"""Synthetic originals only; no real textbook is loaded by these tests."""
import base64
import json

import pytest
import test_platform_stream_safety as safety_fixtures
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from test_platform import HEADERS, register

from mirror_api import resource_library as library
from mirror_api.main import app

isolated = safety_fixtures.isolated


@pytest.fixture
def books(isolated, tmp_path, monkeypatch):
    root = tmp_path / "library"
    root.mkdir()
    monkeypatch.setattr(library, "LIBRARY_ROOT", root)
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(root / "fixture.pdf")
    (root / "cover.png").write_bytes(base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII="))
    user, _ = register(isolated, "library_owner")
    entries = [{"resource_id": f"book-{i}", "course_id": "electronic_circuits", "kind": "textbook",
                "title": "Circuit Book", "authors": ["Synthetic Author"], "edition": str(i),
                "publication_year": 2020 + i, "tags": ["circuits"], "pdf_filename": "fixture.pdf",
                "cover_filename": "cover.png", "isbn": "fixture-isbn"} for i in range(4)]
    grants = {f"book-{i}": {"catalog_accounts": [user["id"]],
                            "content_accounts": [user["id"]]} for i in range(3)}
    grants["book-2"]["content_accounts"] = []
    def save():
        (root / "catalog.json").write_text(json.dumps({"items": entries}), encoding="utf-8")
        (root / "rights.json").write_text(json.dumps(grants), encoding="utf-8")
    save()
    return isolated, root, entries, grants, save


def test_metadata_search_pagination_and_rights(books):
    client, root, _, _, _ = books
    result = client.get("/api/v2/material-library", params={"page_size": 1, "page": 2})
    assert result.status_code == 200
    assert result.headers["cache-control"] == "private, no-store"
    body = result.json()
    assert body["total"] == 3 and body["items"][0]["resource_id"] == "book-1"
    assert body["items"][0]["page_count"] == 1
    assert body["items"][0]["role"] == "unassigned"
    assert body["items"][0]["completeness"] == "unverified"
    for query in ("AUTHOR", "fixture-isbn", "circuits", "Circuit Author"):
        assert client.get("/api/v2/material-library", params={"q": query}).json()["total"] == 3
    assert client.get("/api/v2/material-library", params={"q": "%"}).json()["total"] == 0
    match = client.get("/api/v2/material-library", params={"year": 2021, "tag": "circuits",
                       "course_id": "electronic_circuits", "kind": "textbook"}).json()
    assert [r["resource_id"] for r in match["items"]] == ["book-1"]
    assert client.get("/api/v2/material-library", params={"kind": "exam"}).json()["total"] == 0
    assert str(root) not in result.text and "filename" not in result.text
    assert client.get("/api/v2/material-library", params={"page": 9}).json()["items"] == []


@pytest.mark.parametrize("params", [{"page": 0}, {"page_size": 0}, {"page_size": 51},
                                   {"kind": "other"}, {"year": "bad"}])
def test_invalid_pagination(books, params):
    assert books[0].get("/api/v2/material-library", params=params).status_code == 422


def test_pdf_range_cover_and_account_isolation(books):
    client, root, _, _, _ = books
    url = "/api/v2/material-library/book-0/pdf"
    pdf = client.get(url)
    assert pdf.status_code == 200 and pdf.content == (root / "fixture.pdf").read_bytes()
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.headers["content-disposition"] == 'inline; filename="book-0.pdf"'
    for value, expected in [("bytes=0-9", pdf.content[:10]), ("bytes=-10", pdf.content[-10:]),
                            ("bytes=10-", pdf.content[10:])]:
        chunk = client.get(url, headers={"Range": value})
        assert chunk.status_code == 206 and chunk.content == expected
        assert chunk.headers["cache-control"] == "private, no-store"
        assert "content-range" in chunk.headers
    unsatisfied = client.get(url, headers={"Range": "bytes=999999-"})
    assert unsatisfied.status_code == 416
    assert unsatisfied.headers["content-range"] == f"bytes */{len(pdf.content)}"
    assert unsatisfied.headers["cache-control"] == "private, no-store"
    cover = client.get("/api/v2/material-library/book-0/cover")
    assert cover.status_code == 200 and cover.headers["content-type"] == "image/png"
    assert client.get("/api/v2/material-library/book-2/pdf").status_code == 404
    assert client.get("/api/v2/material-library/book-3/pdf").status_code == 404
    restricted = client.get("/api/v2/material-library", params={"year": 2022}).json()["items"][0]
    assert restricted["availability"] == "restricted" and restricted["pdf_url"] is None
    register(client, "library_other")
    assert client.get("/api/v2/material-library").json()["total"] == 0
    assert client.get(url).status_code == 404
    assert client.get("/api/v2/material-library/book-0/cover").status_code == 404
    with TestClient(app, headers=HEADERS) as anonymous:
        for path in ("/api/v2/material-library", url, "/api/v2/material-library/book-0/cover"):
            assert anonymous.get(path).status_code == 401


@pytest.mark.parametrize("filename", ["../fixture.pdf", "C:/private.pdf", "\\\\server\\private.pdf",
                                      "missing.pdf", "pointer.pdf", "corrupt.pdf", "encrypted.pdf"])
def test_unready_and_unsafe_files(books, filename):
    client, root, entries, _, save = books
    (root / "pointer.pdf").write_text("version https://git-lfs.github.com/spec/v1")
    (root / "corrupt.pdf").write_bytes(b"%PDF-broken")
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    writer.encrypt("test-password")
    writer.write(root / "encrypted.pdf")
    entries[0]["pdf_filename"] = filename
    entries[0]["cover_filename"] = "missing.png"
    save()
    item = client.get("/api/v2/material-library").json()["items"][0]
    assert item["availability"] == "pending" and item["page_count"] is None
    assert item["pdf_url"] is None and item["cover_url"] is None
    assert client.get("/api/v2/material-library/book-0/pdf").status_code == 409
    assert client.get("/api/v2/material-library/book-0/cover").status_code == 409


def test_intake_explicit_allowlist_and_no_implicit_rights(books):
    _, root, entries, _, _ = books
    original = {**entries[0], "resource_id": "circuits-alexander-sadiku-6e", "role": "primary"}
    intake = {"items": [original, {"resource_id": "python-user-17p", "pdf_filename": "do-not-read"}]}
    (root / "intake.json").write_text(json.dumps(intake), encoding="utf-8")
    # Test operates only on its own fresh fixture catalog.
    (root / "catalog.json").unlink()
    result = library.prepare_circuits_catalog()
    assert result == {"imported": ["circuits-alexander-sadiku-6e"], "rights_granted": False}
    rows, _ = library.catalog()
    assert len(rows) == 1 and rows[0].role == "unassigned"
    assert library.listing("ungranted")["total"] == 0
    with pytest.raises(FileExistsError):
        library.prepare_circuits_catalog()


def test_hash_mismatch_and_rights_revocation_are_immediate(books):
    client, _, entries, grants, save = books
    entries[0]["sha256"] = "0" * 64
    save()
    url = "/api/v2/material-library/book-0/pdf"
    assert client.get(url).status_code == 409
    entries[0].pop("sha256")
    save()
    assert client.get(url).status_code == 200
    grants.pop("book-0")
    save()
    assert client.get(url).status_code == 404
    assert client.get("/api/v2/material-library").json()["total"] == 2
