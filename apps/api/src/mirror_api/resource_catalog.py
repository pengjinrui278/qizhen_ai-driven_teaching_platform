"""Read-only original inventory; no OCR, content extraction, import or rights inference."""
import hashlib
import re
from pathlib import Path

from pypdf import PdfReader


def inspect_original(path: Path, root: Path) -> dict:
    path, root = path.resolve(), root.resolve()
    if not path.is_relative_to(root):
        raise ValueError("resource outside inventory root")
    if path.name.endswith(".downloading"):
        raise ValueError("incomplete downloads must not be scanned")
    with path.open("rb") as stream:
        header = stream.read(256)
        stream.seek(0)
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    result = {"relative_path": path.relative_to(root).as_posix(), "size": path.stat().st_size,
              "sha256": digest, "file_state": "not_pdf", "page_count": None,
              "title": None, "exam_year": None, "rights_status": "unconfirmed",
              "review_status": "needs_human_review", "content_indexed": False}
    if header.startswith(b"version https://git-lfs.github.com/spec/v1"):
        result["file_state"] = "lfs_pointer"
        match = re.search(rb"oid sha256:([a-f0-9]{64})", header)
        result["target_sha256"] = match[1].decode() if match else None
    elif header.startswith(b"%PDF-"):
        try:
            with path.open("rb") as stream:
                reader = PdfReader(stream)
                if reader.is_encrypted:
                    result["file_state"] = "encrypted"
                else:
                    result["page_count"] = len(reader.pages)
                    result["file_state"] = "pdf" if result["page_count"] else "corrupt"
        except Exception:  # noqa: BLE001 -- classify untrusted files without exposing parser contents
            result["file_state"] = "corrupt"
    return result


def compare_ingested(inventory: list[dict], snapshot: list[dict] | None = None) -> list[dict]:
    """Snapshot contains only paper_id/sha256, supplied by its authorized operator.

    None means unavailable, not an empty production library. Match hashes only;
    filenames and years are not reliable identities.
    """
    results = []
    for row in inventory:
        hashes = {row["sha256"], row.get("target_sha256")}
        matches = [item["paper_id"] for item in snapshot or []
                   if item.get("sha256") and item["sha256"].lower() in hashes]
        results.append({**row, "mapped_paper_ids": matches,
                        "ingestion_check": "unverified_no_snapshot" if snapshot is None else
                        "matched_hash" if matches else "not_found_in_supplied_snapshot"})
    return results
