"""Register an AI textbook locally; import OCR candidates separately from reviewed pages.

Usage: python scripts/import-ai-textbook.py --pdf PATH
       python scripts/import-ai-textbook.py --pdf PATH --pages-json LOCAL_JSON
No model calls; raw PDF and extracted content must remain outside git.
"""
import argparse
import hashlib
import json
from pathlib import Path

from mirror_api.ai_learning import AIPage, AIResource
from mirror_api.config import get_settings
from mirror_api.db import init_db, make_engine, make_session_factory


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--pages-json", type=Path)
    parser.add_argument("--reviewed-by", help="Required to publish visually checked pages")
    parser.add_argument("--skip-reviewed", action="store_true", help="Keep reviewed excerpts when adding candidate pages")
    args = parser.parse_args()
    from pypdf import PdfReader
    source = args.pdf.resolve()
    if source.stat().st_size < 1024:
        parser.error("Not a real PDF (possibly a Git LFS pointer)")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    count = len(PdfReader(source).pages)
    ident = "ai-book-"+digest[:24]
    engine = make_engine(get_settings().database_url)
    init_db(engine)
    with make_session_factory(engine)() as db:
        row = db.get(AIResource, ident)
        if row is None:
            row = AIResource(id=ident, title=source.stem, kind="textbook",
                metadata_json={"sha256": digest, "total_pages": count,
                               "public_fulltext": False, "training_allowed": False})
            db.add(row)
        if args.pages_json:
            data = json.loads(args.pages_json.read_text(encoding="utf-8"))
            if data.get("sha256") != digest:
                parser.error("Source hash mismatch")
            row.metadata_json = {**row.metadata_json,
                **{k: v for k, v in data.get("metadata", {}).items()
                   if k in ("authors", "edition", "publisher", "publication_year", "approved_pdf_range")}}
            for page in data["pages"]:
                number = page["pdf_page"]
                if type(number) is not int or not 1 <= number <= count:
                    parser.error("Invalid PDF page")
                if not isinstance(page["content"], str) or not page["content"].strip():
                    parser.error("Empty page content")
                status = "reviewed" if args.reviewed_by else "candidate"
                record = db.get(AIPage, f"{ident}:{number}")
                if record is None:
                    record = AIPage(id=f"{ident}:{number}", source_id=ident, page=number)
                    db.add(record)
                elif record.status == "reviewed" and not args.reviewed_by:
                    if args.skip_reviewed:
                        continue
                    parser.error("Cannot overwrite reviewed content with candidates")
                record.heading = page.get("heading", "")[:256]
                record.content, record.status = page["content"], status
            if args.reviewed_by:
                row.metadata_json = {**row.metadata_json, "reviewed_by": args.reviewed_by}
        db.commit()
        print(json.dumps({"source_id": ident, "total_pages": count,
            "ingested_pages": db.query(AIPage).filter_by(source_id=ident).count(),
            "reviewed_pages": db.query(AIPage).filter_by(source_id=ident, status="reviewed").count()},
            ensure_ascii=False))
    engine.dispose()


if __name__ == "__main__":
    main()
