"""Build a local searchable candidate catalog, never a verified live answer index."""
import argparse,json,re,sqlite3
from collections import Counter
from pathlib import Path

def build(root):
    output=root/"candidate-catalog.sqlite"
    db=sqlite3.connect(output)
    db.execute("CREATE TABLE IF NOT EXISTS pages (source TEXT,pdf_page INTEGER,printed_page TEXT,kind TEXT,status TEXT,headings TEXT,uncertainties TEXT,PRIMARY KEY(source,pdf_page))")
    db.execute("CREATE TABLE IF NOT EXISTS blocks (id TEXT PRIMARY KEY,source TEXT,pdf_page INTEGER,position INTEGER,kind TEXT,number TEXT,text TEXT,previous INTEGER,next INTEGER,chapter_candidate TEXT,section_candidate TEXT,flags TEXT)")
    db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS candidate_search USING fts5(id UNINDEXED,text,tokenize='unicode61')")
    report=[]
    for manifest_path in sorted(root.glob("*/manifest.json")):
        manifest=json.loads(manifest_path.read_text(encoding="utf-8"));source=manifest["source_sha256"]
        states=Counter();kinds=Counter();missing=[];issues=[]
        chapter=None;section=None;last_page=0;last_next=False
        page_map={p["pdf_page"]:p for p in map(json.loads,(manifest_path.parent/"pages.jsonl").read_text(encoding="utf-8").splitlines())}
        for n in range(1,manifest["summary"]["total_pages"]+1):
            path=manifest_path.parent/"ocr-v1"/f"page-{n}.json"
            if not path.exists():missing.append(n);continue
            row=json.loads(path.read_text(encoding="utf-8"));states[row["status"]]+=1
            if row["status"]!="needs_visual_review":
                issues.append({"pdf_page":n,"reason":row["status"]});continue
            page=row["page"];printed=page.get("printed_page")
            headings=page["headings"]
            for heading in headings:
                if re.match(r"^第[一二三四五六七八九十百0-9]+章",str(heading).strip()):chapter=str(heading).strip()
                if re.match(r"^(§|第[一二三四五六七八九十0-9]+节)",str(heading).strip()):section=str(heading).strip()
            candidates=page_map[n]["printed_page_candidates"]
            mismatch=bool(candidates and str(printed) not in candidates)
            if mismatch:issues.append({"pdf_page":n,"reason":"printed_page_disagrees_with_bookmark","ocr":printed,"bookmark":candidates})
            db.execute("INSERT OR REPLACE INTO pages VALUES(?,?,?,?,?,?,?)",(source,n,printed,page["page_kind"],row["status"],json.dumps(headings,ensure_ascii=False),json.dumps(page["uncertainties"],ensure_ascii=False)))
            for i,b in enumerate(page["blocks"]):
                bid=f"{source}:{n}:{i}";kinds[b["kind"]]+=1;flags=[]
                if page["uncertainties"]:flags.append("page_uncertainty")
                if mismatch:flags.append("page_number_mismatch")
                if not chapter or not section:flags.append("chapter_or_section_unresolved")
                if b["kind"] in ("example","exercise") and not b.get("number"):flags.append("missing_original_number")
                if "图" in b["text"]:flags.append("figure_reference_requires_source_image")
                if b["continues_from_previous"] or b["continues_to_next"]:flags.append("cross_page_reconciliation_required")
                if i==0 and b["continues_from_previous"] and (last_page!=n-1 or not last_next):
                    flags.append("unmatched_incoming_fragment")
                db.execute("INSERT OR REPLACE INTO blocks VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                    (bid,source,n,i,b["kind"],b.get("number"),b["text"],b["continues_from_previous"],b["continues_to_next"],chapter,section,json.dumps(flags)))
            last_page=n;last_next=bool(page["blocks"] and page["blocks"][-1]["continues_to_next"])
        report.append({"source_sha256":source,"book":Path(manifest["source_path"]).name,"total_pages":manifest["summary"]["total_pages"],
                       "ocr_states":dict(states),"missing_pages":missing,"candidate_block_types":dict(kinds),"issues":issues,
                       "verified_full_coverage":False})
    # Rebuild only the derived search table, not source data or review work.
    db.execute("DELETE FROM candidate_search")
    for bid,text in db.execute("SELECT id,text FROM blocks").fetchall():
        # Space Chinese bigrams alongside original text for FTS without extra tokenizer services.
        chinese=" ".join(s[i:i+2] for s in re.findall(r"[\u4e00-\u9fff]+",text) for i in range(len(s)-1))
        db.execute("INSERT INTO candidate_search(id,text) VALUES(?,?)",(bid,text+" "+chinese))
    db.commit();db.close()
    (root/"coverage-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps([{k:v for k,v in r.items() if k not in ("missing_pages","issues")} | {"missing_count":len(r["missing_pages"]),"issue_count":len(r["issues"])} for r in report],ensure_ascii=False))
if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--root",type=Path,default=Path("data/textbook-library"))
    build(parser.parse_args().root)
