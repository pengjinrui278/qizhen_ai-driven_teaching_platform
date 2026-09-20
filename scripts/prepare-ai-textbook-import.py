"""Prepare the user-approved PDF range for candidate ingestion, preserving source locators."""
import argparse
import json
from pathlib import Path


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--last-page",type=int,required=True)
    parser.add_argument("--root",type=Path,default=Path("data/ai-textbook/3e564cd8abca33ab90635458"))
    args=parser.parse_args()
    if not 1<=args.last_page<=264:
        parser.error("Current approved non-repeated range is PDF 1..264")
    pages=[]
    for number in range(1,args.last_page+1):
        row=json.loads((args.root/"normalized"/f"page-{number}.json").read_text(encoding="utf-8"))
        if row["status"]!="candidate":
            parser.error(f"Unresolved OCR at PDF page {number}")
        page=row["page"]
        content="\n\n".join(b["text"] for b in page["blocks"])
        if not content.strip() and page["page_kind"]=="blank":
            content="（原书空白页）"
        if not content.strip():
            parser.error(f"Unexpected empty page {number}")
        headings=page.get("headings",[])
        locator=f"PDF第{number}页"+(f" · 原书第{page['printed_page']}页" if page.get("printed_page") else "")
        pages.append({"pdf_page":number,"heading":" · ".join(headings+[locator]),
                      "content":content,"page_kind":page["page_kind"],"printed_page":page.get("printed_page"),
                      "normalization_flags":row.get("normalization_flags",[])})
    result={"sha256":row["source_sha256"],"metadata":{"authors":"邵军力、张景、魏长华",
        "edition":"2000年3月第1版","publisher":"电子工业出版社","publication_year":2000,
        "approved_pdf_range":[1,args.last_page]},"pages":pages}
    target=args.root/"candidate-import.json"
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"prepared_pages":len(pages),"published":False}))


if __name__=="__main__":
    main()
