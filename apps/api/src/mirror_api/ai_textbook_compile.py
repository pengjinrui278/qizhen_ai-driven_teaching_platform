"""Deterministic candidate organization. Never upgrades OCR/audits to published content."""
import re

CN = "〇零一二三四五六七八九十百两"
CHAPTER = re.compile(r"^第[0-9"+CN+r"]+章\s*")
SECTION = re.compile(r"^第[0-9"+CN+r"]+节\s*")


def compile_candidates(records, audits=None):
    audits = audits or {}
    units, headings, warnings = [], [], []
    chapter = section = None
    pending = None
    for record in sorted(records, key=lambda r: r["pdf_page"]):
        page = record.get("page") or {}
        number = record["pdf_page"]
        if record.get("status") != "candidate":
            warnings.append({"pdf_page":number, "reason":"invalid_ocr"})
            pending = None
            continue
        if page.get("page_kind") not in ("content", "exercises"):
            # Tables of contents can mention exercise headings; they are not original questions.
            continue
        # Some OCR pages list headings separately but omit duplicate heading blocks.
        block_titles=[b.get("text","").strip() for b in page.get("blocks",[]) if b.get("kind")=="heading"]
        for title in page.get("headings",[]):
            if title not in block_titles and CHAPTER.match(title):
                chapter,section=title,None
                headings.append({"title":title,"chapter":chapter,"section":None,
                                 "pdf_page":number,"printed_page":page.get("printed_page")})
        for idx, block in enumerate(page.get("blocks", [])):
            text = block.get("text", "").strip()
            kind = block.get("kind")
            if kind == "heading":
                if CHAPTER.match(text):
                    if not chapter or re.sub(r"\s+","",chapter)!=re.sub(r"\s+","",text):
                        chapter, section = text, None
                elif SECTION.match(text):
                    section = text
                headings.append({"title":text,"chapter":chapter,"section":section,
                                 "pdf_page":number,"printed_page":page.get("printed_page")})
                continue
            if kind not in ("example", "exercise"):
                continue
            original_number = block.get("number")
            fragment = {"pdf_page":number,"printed_page":page.get("printed_page"),
                        "block_index":idx,"text":text}
            can_merge = bool(pending and block.get("continues_from_previous")
                and pending["kind"] == kind and pending["chapter"] == chapter
                and number == pending["fragments"][-1]["pdf_page"]+1
                and (not original_number or original_number == pending["number"]))
            if can_merge:
                unit = pending
                unit["fragments"].append(fragment)
                unit["text"] += "\n\n"+text
            else:
                unit = {"id":f"p{number}-b{idx}","kind":kind,"number":original_number,
                        "chapter":chapter,"section":section,"fragments":[fragment],
                        "text":text,"flags":[],"status":"candidate","allowed_for_rag":False}
                if block.get("continues_from_previous"):
                    unit["flags"].append("unresolved_previous_page")
                units.append(unit)
            pending = unit if block.get("continues_to_next") else None
            if not unit["number"] and "missing_number" not in unit["flags"]:
                unit["flags"].append("missing_number")
            if not unit["chapter"] and "missing_chapter" not in unit["flags"]:
                unit["flags"].append("missing_chapter")
    for unit in units:
        last = unit["fragments"][-1]
        record = next(r for r in records if r["pdf_page"] == last["pdf_page"])
        if record["page"]["blocks"][last["block_index"]].get("continues_to_next"):
            unit["flags"].append("unresolved_next_page")
        unit["machine_audit"] = [audits.get(f["pdf_page"],"not_run") for f in unit["fragments"]]
    return {"units":units,"headings":headings,"warnings":warnings,
            "summary":{"original_question_candidates":len(units),
                       "examples":sum(u["kind"]=="example" for u in units),
                       "exercises":sum(u["kind"]=="exercise" for u in units),
                       "flagged":sum(bool(u["flags"]) for u in units)},
            "published":False}
