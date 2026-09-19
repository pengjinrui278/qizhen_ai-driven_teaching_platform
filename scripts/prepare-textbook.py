"""Process at most five explicitly selected pages; paid OCR requires an explicit flag."""
import argparse
import base64
import io
from pathlib import Path
from pypdf import PdfReader
from mirror_api.config import Settings, REPO_ROOT
from mirror_api.textbook_intake import save_draft, draft_path
from mirror_api.vision import transcribe

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("pdf",type=Path)
    parser.add_argument("--pages",required=True,help="One-based PDF page numbers, comma separated, maximum 5")
    parser.add_argument("--allow-paid-ocr",action="store_true")
    args=parser.parse_args()
    pages=sorted(set(int(x) for x in args.pages.split(",")))
    if not pages or len(pages)>5:
        parser.error("Choose 1 to 5 pages per reviewed intake batch.")
    reader=PdfReader(str(args.pdf))
    if any(p<1 or p>len(reader.pages) for p in pages):
        parser.error("Page out of range.")
    for page in pages:
        cached,_=draft_path(REPO_ROOT/"data"/"intake",args.pdf,page)
        if cached.exists():
            print("Existing draft retained; no OCR call:",cached)
            continue
        text=(reader.pages[page-1].extract_text() or "").strip()
        method="embedded_text"
        if not text:
            if not args.allow_paid_ocr:
                print("PDF page",page,": scanned; no paid OCR performed")
                continue
            import pypdfium2 as pdfium
            doc=pdfium.PdfDocument(str(args.pdf))
            bitmap=doc[page-1].render(scale=2)
            buffer=io.BytesIO()
            bitmap.to_pil().save(buffer,format="PNG")
            text=transcribe(Settings(),"data:image/png;base64,"+base64.b64encode(buffer.getvalue()).decode())
            method="deepseek_vision_transcription"
        destination=save_draft(REPO_ROOT/"data"/"intake",args.pdf,page,text,method)
        print("Saved review draft:",destination)
    print("No course index or model weights were updated.")

if __name__=="__main__":
    main()
