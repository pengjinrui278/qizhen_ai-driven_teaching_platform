"""Resolve chapter/section candidates from the book's own TOC, never from model guesses."""
import json,re
from pathlib import Path
def build(root):
    summaries=[]
    for path in root.glob("*/manifest.json"):
        m=json.loads(path.read_text(encoding="utf-8"))
        labels={b["title"]:b["pdf_page"] for b in m["bookmarks"] if b["title"].isdigit() and b["pdf_page"]}
        entries=[];unparsed=[];chapter=None;section=None
        for f in sorted((path.parent/"normalized-v1").glob("page-*.json"),key=lambda f:int(f.stem.split("-")[-1])):
            r=json.loads(f.read_text(encoding="utf-8"));p=r.get("page") or {}
            if p.get("page_kind")!="toc":continue
            for b in p.get("blocks",[]):
                for raw in b.get("text","").splitlines():
                    line=raw.strip().replace("**","").strip("| ")
                    match=re.match(r"^(.*?)\s*[.·…．\s|]+\s*(\d+)\s*$",line)
                    if not match:
                        if line and not re.match(r"^(目录|目\s+录|[ivx]+)$",line):unparsed.append({"toc_pdf_page":r["pdf_page"],"text":line})
                        continue
                    title=match[1].strip(" |.·…．");number=int(match[2])
                    kind="topic"
                    if re.match(r"^第[一二三四五六七八九十百0-9]+章",title):
                        kind="chapter";chapter=title;section=None
                    elif re.match(r"^(§\s*\d+|第[一二三四五六七八九十0-9]+节)",title):
                        kind="section";section=title
                    elif re.match(r"^习\s*题",title):kind="exercises"
                    entries.append({"kind":kind,"title":title,"chapter":chapter,"section":section,
                                    "printed_page":number,"pdf_page":labels.get(str(number)),
                                    "toc_pdf_page":r["pdf_page"],"verified":False})
        value={"source_sha256":m["source_sha256"],"entries":entries,"unparsed":unparsed,"status":"toc_candidates"}
        (path.parent/"toc-candidates.json").write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding="utf-8")
        summaries.append({"book":Path(m["source_path"]).name,"chapters":sum(e["kind"]=="chapter" for e in entries),
                          "sections":sum(e["kind"]=="section" for e in entries),"unparsed_lines":len(unparsed)})
    print(json.dumps(summaries,ensure_ascii=False))
if __name__=="__main__":build(Path("data/textbook-library"))
