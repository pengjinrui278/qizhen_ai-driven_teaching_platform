"""Offline full-document inventory. Never sends pages or publishes textbook content."""
import argparse
import hashlib
import json
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from pypdf import PdfReader

def scan(pdf: Path, output: Path):
    pdf=pdf.resolve()
    with pdf.open("rb") as stream:
        digest=hashlib.file_digest(stream,"sha256").hexdigest()
    target=output.resolve()/digest
    if (target/"manifest.json").exists():
        manifest=json.loads((target/"manifest.json").read_text(encoding="utf-8"))
        print(json.dumps({"cached":True,"manifest":str(target/"manifest.json"),"summary":manifest["summary"]},ensure_ascii=False))
        return
    reader=PdfReader(pdf)
    bookmarks=[]
    def walk(items,parents=()):
        previous=None
        for item in items:
            if isinstance(item,list):
                walk(item,parents+((previous,) if previous else ()))
                continue
            title=str(item.title)
            try:
                index=reader.get_destination_page_number(item)
            except (ValueError,KeyError):
                index=None
            bookmarks.append({"title":title,"parents":list(parents),"pdf_page":None if index is None else index+1,"status":"metadata_unverified"})
            previous=title
    walk(reader.outline)
    labels={}
    for b in bookmarks:
        if b["pdf_page"] and b["title"].isdigit():
            labels.setdefault(b["pdf_page"],[]).append(b["title"])
    target.mkdir(parents=True,exist_ok=True)
    counts=Counter()
    # Exclusive file creation prevents accidental replacement of prior review work.
    with (target/"pages.jsonl").open("x",encoding="utf-8") as stream:
        for index,page in enumerate(reader.pages,1):
            error=None
            try:
                text=(page.extract_text() or "").strip()
                status="text_needs_visual_review" if text else "needs_ocr_or_blank_check"
            except Exception as exc:
                text=""
                status="extraction_failed"
                error=type(exc).__name__
            counts[status]+=1
            row={"page_id":digest+":"+str(index),"source_sha256":digest,"pdf_page":index,
                 "printed_page_candidates":labels.get(index,[]),"printed_page_verified":False,
                 "width_pt":float(page.mediabox.width),"height_pt":float(page.mediabox.height),
                 "status":status,"text":text,"extraction_error":error,
                 "eligible_for_answers":False,"eligible_for_exercises":False}
            stream.write(json.dumps(row,ensure_ascii=False)+"\n")
    manifest={"schema_version":1,"source_path":str(pdf),"source_sha256":digest,
              "created_at":datetime.now(UTC).isoformat(),"summary":{"total_pages":len(reader.pages),**counts},
              "bookmarks":bookmarks,"status":"inventoried_not_covered",
              "rights":{"local_processing_authorized":True,"public_distribution_authorized":False,
                        "allowed_for_training":False},
              "coverage":{"ocr_reviewed_pages":0,"structure_reviewed_pages":0,"exercise_completeness_verified":False},
              "next_steps":["OCR/blank-page classification","printed-page and chapter verification",
                            "definition/theorem/example/exercise segmentation","cross-page reconciliation",
                            "formula and numbering review","coverage audit before publication"]}
    with (target/"manifest.json").open("x",encoding="utf-8") as stream:
        json.dump(manifest,stream,ensure_ascii=False,indent=2)
    print(json.dumps({"manifest":str(target/"manifest.json"),"summary":manifest["summary"]},ensure_ascii=False))

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("pdf",type=Path,nargs="+")
    parser.add_argument("--output",type=Path,default=Path("data/textbook-library"))
    args=parser.parse_args()
    for pdf in args.pdf:
        scan(pdf,args.output)
