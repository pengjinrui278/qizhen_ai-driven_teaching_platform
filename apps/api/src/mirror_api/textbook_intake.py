"""Local, review-gated textbook intake. OCR drafts never enter the live course index."""
import hashlib
import json
from pathlib import Path
from datetime import UTC, datetime

def draft_path(output_dir,source_path,page_number):
    source=Path(source_path).resolve()
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    target=Path(output_dir).resolve()/digest[:16]
    return target/("page-"+str(page_number)+".json"),digest

def save_draft(output_dir,source_path,page_number,text,method):
    source=Path(source_path).resolve()
    destination,digest=draft_path(output_dir,source,page_number)
    target=destination.parent
    target.mkdir(parents=True,exist_ok=True)
    if destination.exists():
        return destination
    draft={"schema_version":1,"source_path":str(source),"source_sha256":digest,
        "pdf_page":page_number,"method":method,"text":text,
        "created_at":datetime.now(UTC).isoformat(),"status":"needs_review",
        "rights":{"allowed_for_rag":False,"allowed_for_training":False},
        "review_checks":["公式、上下标和量词","粗体、花体等符号区别","定理条件完整性","跨页证明与页码"]}
    destination.write_text(json.dumps(draft,ensure_ascii=False,indent=2),encoding="utf-8")
    return destination
