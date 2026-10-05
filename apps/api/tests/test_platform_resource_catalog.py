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
