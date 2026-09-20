"""Compile local OCR into a chapter-indexed candidate library (no API calls, no publishing)."""
import argparse
import json
from pathlib import Path
from mirror_api.ai_textbook_compile import compile_candidates


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--root",type=Path,default=Path("data/ai-textbook/3e564cd8abca33ab90635458"))
    args=parser.parse_args()
    records=[json.loads(p.read_text(encoding="utf-8")) for p in (args.root/"normalized").glob("page-*.json")]
    integrity_path=args.root/"source-integrity.json"
    integrity=json.loads(integrity_path.read_text(encoding="utf-8")) if integrity_path.exists() else {}
    duplicate_pages={p for group in integrity.get("duplicate_groups",[]) for p in group[1:]}
    records=[r for r in records if r["pdf_page"] not in duplicate_pages]
    audit_records=[json.loads(p.read_text(encoding="utf-8")) for p in (args.root/"audit").glob("page-*.json")]
    result=compile_candidates(records,{r["pdf_page"]:r["status"] for r in audit_records})
    result["source_sha256"]=records[0]["source_sha256"] if records else None
    result["excluded_duplicate_pages"]=sorted(duplicate_pages)
    result["source_integrity"]=integrity
    result["ocr_pages"]=len(records)
    result["audit_pages"]=len(audit_records)
    (args.root/"candidate-library.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"ocr_pages":len(records),"audit_pages":len(audit_records),**result["summary"]},ensure_ascii=False))


if __name__=="__main__":
    main()
