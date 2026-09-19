"""Compile provenance-rich candidates and coverage gaps, without publishing them."""
import json,re,sqlite3
from collections import Counter,defaultdict
from pathlib import Path

ROOT=Path("data/textbook-library")
def read(path):return json.loads(path.read_text(encoding="utf-8"))
def section_for(toc,n):
    sections=[dict(s,chapter_number=c["number"],chapter_title=c["title"]) for c in toc["chapters"] for s in c["sections"]]
    eligible=[s for s in sections if s["pdf_page"]<=n]
    return eligible[-1] if eligible else None

def block_sections(toc,n,blocks):
    """A section start page may begin with the PREVIOUS section's exercises.

    OCR heading alignment is a candidate location, not publication approval.
    Missing or duplicate heading anchors leave boundary locations unknown.
    """
    current=section_for(toc,n)
    if not current or current['pdf_page']!=n:
        return [(current,'toc_page_interval') for _ in blocks]
    compact=lambda s:re.sub(r'\s+','',s)
    expected='§'+str(current['number'])+compact(current['title'])
    anchors=[i for i,b in enumerate(blocks) if isinstance(b,dict)
             and b.get('kind')=='heading' and compact(b.get('text',''))==expected]
    if len(anchors)!=1:
        return [(None,'section_boundary_unresolved') for _ in blocks]
    previous=section_for(toc,n-1)
    return [(previous if i<anchors[0] else current,'ocr_heading_alignment_requires_review')
            for i in range(len(blocks))]

def compile_book(folder):
    m=read(folder/"manifest.json");toc=read(folder/"toc-reviewed.json");sha=m["source_sha256"]
    labels={b["pdf_page"]:b["title"] for b in m["bookmarks"] if b["title"].isdigit()}
    chapters={c["number"]:c for c in toc["chapters"]}
    rows=[];pages=[];types=Counter();last=None
    for n in range(1,m["summary"]["total_pages"]+1):
        version=2 if (folder/"normalized-v2"/f"page-{n}.json").exists() else 1
        path=folder/f"normalized-v{version}"/f"page-{n}.json"
        norm=read(path) if path.exists() else {};page=norm.get("page") or {}
        audit_path=folder/f"audit-v{version}"/f"page-{n}.json"
        audit=read(audit_path) if audit_path.exists() else {}
        status=audit.get("status","not_audited")
        manual_path=folder/"manual-review"/f"page-{n}.json"
        if manual_path.exists():
            manual=read(manual_path)
            if manual["base_revision"]!=version:raise ValueError("Manual review base changed")
            for change in manual.get("changes",[]):
                text=page["blocks"][change["block"]]["text"]
                if change["old"] not in text:raise ValueError("Manual correction precondition failed")
                page["blocks"][change["block"]]["text"]=text.replace(change["old"],change["new"])
            page["blocks"].extend(manual.get("add_blocks",[]))
            status="manual_page_checked"
        printed=labels.get(n)
        flags=list(norm.get("normalization_flags",[]))
        if printed and str(page.get("printed_page"))!=printed:flags.append("printed_page_disagreement")
        if printed and status!="manual_page_checked" and str((audit.get("audit") or {}).get("printed_page"))!=printed:flags.append("audited_page_number_disagreement")
        if page.get("uncertainties"):flags.append("ocr_uncertainty")
        if status not in ("match","manual_page_checked"):flags.append("image_comparison_not_passed")
        section=section_for(toc,n)
        part="frontmatter" if not section else "body"
        for item in toc["backmatter"]:
            if n>=item["pdf_page"]:part=item["kind"]
        pages.append({"pdf_page":n,"printed_page":printed,"part":part,"version":version,"audit":status,"flags":flags})
        locations=block_sections(toc,n,page.get('blocks',[]))
        for index,b in enumerate(page.get("blocks",[])):
            if not isinstance(b,dict) or not isinstance(b.get("text"),str):continue
            kind=b.get("kind","other");number=str(b["number"]) if b.get("number") is not None else None
            sec,location_method=locations[index];unit_flags=flags.copy()
            if location_method!='toc_page_interval':unit_flags.append(location_method)
            # Numbered examples/theorems encode their own chapter.section; check against reviewed TOC.
            ref=re.search(r"(\d+)\.(\d+)\.(\d+)",number or "")
            if ref and kind in ("definition","theorem","example"):
                c=chapters.get(int(ref[1]));s=next((s for s in c["sections"] if s["number"]==int(ref[2])),None) if c else None
                if s:sec=dict(s,chapter_number=c["number"],chapter_title=c["title"])
                else:unit_flags.append("number_does_not_match_book_toc")
            if sec and n==sec["pdf_page"]:unit_flags.append("section_boundary_requires_block_location_check")
            if not sec:unit_flags.append("no_body_section")
            if kind in ("example","exercise") and not number:unit_flags.append("missing_original_number")
            if re.search(r"图\s*\d",b["text"]):unit_flags.append("figure_reference_preserved_in_source_pdf")
            if b.get("continues_from_previous") or b.get("continues_to_next"):unit_flags.append("cross_page_content_requires_review")
            row={"id":f"{sha}:{n}:{index}","source_sha256":sha,"book_title":toc["book_title"],"edition":toc["edition"],
                 "volume":toc["volume"],"part":part,"kind":kind,"original_number":number,
                 "chapter":None if not sec else {"number":sec["chapter_number"],"title":sec["chapter_title"]},
                 "section":None if not sec else {"number":sec["number"],"title":sec["title"]},
                 "section_location_method":location_method,
                 "source_spans":[{"pdf_page":n,"printed_page":printed,"block_index":index}],
                 "original_text":b["text"],"flags":sorted(set(unit_flags)),
                 "continues_from_previous":b.get("continues_from_previous"),
                 "continues_to_next":b.get("continues_to_next"),
                 "review":{"page_image_comparison":status,"teacher_reviewed":False,"unit_verified":False},
                 "eligible_for_answers":False,"eligible_for_exercise_bank":False}
            # Preserve candidate cross-page joins separately. Never silently invent an original number.
            if (index==0 and b.get("continues_from_previous") and last
                and last["source_spans"][-1]["pdf_page"]==n-1 and last.get("continues_to_next")):
                row["continuation_candidate_of"]=last["id"]
            rows.append(row);last=row;types[kind]+=1
    ex=[r for r in rows if r["part"]=="body" and r["kind"] in ("example","exercise")]
    counts=Counter(r["kind"] for r in ex)
    duplicates=defaultdict(list)
    for r in ex:
        if r["chapter"] and r["section"] and r["original_number"]:
            key=(r["kind"],r["chapter"]["number"],r["section"]["number"],r["original_number"])
            duplicates[key].append(r["id"])
    report={"book":Path(m["source_path"]).name,"source_sha256":sha,"total_pages":len(pages),
            "ocr_pages":sum((folder/"ocr-v1"/f"page-{n}.json").exists() for n in range(1,len(pages)+1)),
            "chapters":len(toc["chapters"]),"sections":sum(len(c["sections"]) for c in toc["chapters"]),
            "page_audit_statuses":dict(Counter(p["audit"] for p in pages)),"candidate_block_types":dict(types),
            "body_exercise_fragments":dict(counts),"unresolved_duplicate_numbers":[{"key":list(k),"ids":v} for k,v in duplicates.items() if len(v)>1],
            "problem_pages":[p for p in pages if p["flags"]],"fully_verified":False}
    out=folder/"compiled";out.mkdir(exist_ok=True)
    with (out/"units.jsonl").open("w",encoding="utf-8") as f:
        for r in rows:f.write(json.dumps(r,ensure_ascii=False)+"\n")
    (out/"coverage.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    return rows,report

def main():
    all_rows=[];reports=[]
    for folder in ROOT.iterdir():
        if folder.is_dir() and (folder/"toc-reviewed.json").exists():
            rows,report=compile_book(folder);all_rows.extend(rows);reports.append(report)
    db=sqlite3.connect(ROOT/"compiled-candidates.sqlite")
    db.execute("CREATE TABLE IF NOT EXISTS units(id TEXT PRIMARY KEY, source TEXT, kind TEXT, part TEXT, chapter INTEGER, section INTEGER, number TEXT, text TEXT, metadata TEXT)")
    db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED,text,tokenize='unicode61')")
    # Only derived tables are rebuilt; raw OCR and review results remain immutable.
    with db:
        db.execute("DELETE FROM units");db.execute("DELETE FROM search")
        for r in all_rows:
            db.execute("INSERT INTO units VALUES(?,?,?,?,?,?,?,?,?)",(r["id"],r["source_sha256"],r["kind"],r["part"],
                (r["chapter"] or {}).get("number"),(r["section"] or {}).get("number"),r["original_number"],r["original_text"],json.dumps(r,ensure_ascii=False)))
            text=r["original_text"];grams=" ".join(s[i:i+2] for s in re.findall(r"[\u4e00-\u9fff]+",text) for i in range(len(s)-1))
            db.execute("INSERT INTO search VALUES(?,?)",(r["id"],text+" "+grams))
    db.close()
    (ROOT/"coverage-report.json").write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps([{k:v for k,v in r.items() if k not in ("problem_pages","unresolved_duplicate_numbers")} |
        {"problem_pages":len(r["problem_pages"]),"duplicate_groups":len(r["unresolved_duplicate_numbers"])} for r in reports],ensure_ascii=False))
if __name__=="__main__":main()
