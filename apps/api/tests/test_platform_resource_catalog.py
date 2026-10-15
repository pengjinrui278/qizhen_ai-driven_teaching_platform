from pathlib import Path

import pytest
from pypdf import PdfWriter

from mirror_api.resource_catalog import compare_ingested, inspect_original


def test_inventory_distinguishes_pdf_pointer_and_unknown_mapping(tmp_path):
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    path = tmp_path / "2020-2021-synthetic.pdf"
    writer.write(path)
    row = inspect_original(path, tmp_path)
    assert row["file_state"] == "pdf" and row["page_count"] == 1
    assert row["title"] is None and row["exam_year"] is None
    assert row["rights_status"] == "unconfirmed"
    pointer = tmp_path / "pointer.pdf"
    pointer.write_text("version https://git-lfs.github.com/spec/v1\n"
                       f"oid sha256:{row['sha256']}\nsize {row['size']}\n")
    stub = inspect_original(pointer, tmp_path)
    assert stub["file_state"] == "lfs_pointer" and stub["page_count"] is None
    assert compare_ingested([row])[0]["ingestion_check"] == "unverified_no_snapshot"
    assert compare_ingested([row], [])[0]["ingestion_check"] == "not_found_in_supplied_snapshot"
    for result in compare_ingested([row, stub], [{"paper_id": "synthetic-id", "sha256": row["sha256"]}]):
        assert result["mapped_paper_ids"] == ["synthetic-id"]


def test_inventory_does_not_read_incomplete_or_outside_files(tmp_path):
    with pytest.raises(ValueError):
        inspect_original(tmp_path / "unfinished.downloading", tmp_path)
    with pytest.raises(ValueError):
        inspect_original(Path(tmp_path.parent / "outside.pdf"), tmp_path)


def test_analysis_volumes_are_intake_allowlisted_with_real_covers():
    """陈纪修《数学分析》第三版上下册的入库登记。

    封面必须是**真实 PDF 封面**抽出来的（R3 的规矩：不生图伪造书封），
    而原件在 data/ 下（不进 Git）。这里只断言登记本身是完整的、且不越权：
    没把「下载得到」当成公开许可。
    """
    from mirror_api.resource_library import INTAKE_ALLOWLIST

    for rid in ("chen-jixiu-3e-vol1", "chen-jixiu-3e-vol2"):
        assert rid in INTAKE_ALLOWLIST, "白名单是显式的：清单里出现不等于可以展示"


def test_analysis_catalog_entry_is_honest_about_what_was_checked():
    import json

    from mirror_api.config import REPO_ROOT

    path = REPO_ROOT / "data" / "resource-intake" / "R3" / "catalog.json"
    if not path.exists():
        pytest.skip("本机没有教材清单（data/ 不进 Git，清单是服务端本地文件）")
    items = {row["resource_id"]: row for row in json.loads(path.read_text(encoding="utf-8"))["items"]}
    for rid, volume, isbn in (("chen-jixiu-3e-vol1", "上册", "978-7-04-051571-8"),
                              ("chen-jixiu-3e-vol2", "下册", "978-7-04-051630-2")):
        row = items.get(rid)
        if row is None:
            pytest.skip("本机清单里还没有这条")
        assert row["course_id"] == "mathematical_analysis"
        assert row["volume"] == volume and row["edition"] == "第三版"
        assert row["authors"] == ["陈纪修", "於崇华", "金路"]
        assert row["isbn"] == isbn, "书目信息取自课程 profile 已登记的 source_refs"
        assert row["pdf_filename"] == rid + ".pdf" and row["cover_filename"] == rid + ".png"
        assert row["completeness"] == "unverified", \
            "封面与书名页核对过不等于逐页核对过，不能标 complete"
        assert len(row["sha256"]) == 64
