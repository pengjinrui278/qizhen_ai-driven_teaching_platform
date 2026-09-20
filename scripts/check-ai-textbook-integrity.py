"""Offline raster integrity check before paid OCR. Repeated source pages cannot count as coverage."""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import pypdfium2 as pdfium


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--pdf",type=Path,required=True)
    parser.add_argument("--out",type=Path,required=True)
    args=parser.parse_args()
    digest=hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    groups=defaultdict(list)
    with pdfium.PdfDocument(str(args.pdf)) as doc:
        total=len(doc)
        for i in range(total):
            page=doc[i]
            bitmap=page.render(scale=1)
            im=bitmap.to_pil()
            key=hashlib.sha256(str(im.size).encode()+im.tobytes()).hexdigest()
            groups[key].append(i+1)
            bitmap.close()
            page.close()
    duplicates=[pages for pages in groups.values() if len(pages)>1]
    result={"source_sha256":digest,"total_pages":total,"unique_raster_pages":len(groups),
            "duplicate_groups":duplicates,"method":"PDFium full-page pixels at scale 1",
            "blocked_as_complete_textbook":bool(duplicates)}
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(result,ensure_ascii=False))


if __name__=="__main__":
    main()
