"""Normalize only transport defects; truncated/ambiguous source content stays blocked."""
import importlib.util
import json
from pathlib import Path
from collections import Counter

ROOT=Path("data/ai-textbook/3e564cd8abca33ab90635458")


def load(name, filename):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(filename))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    normal=load("normalize_legacy","normalize-textbook-ocr.py")
    schema=load("scan_schema","scan-textbooks.py")
    destination=ROOT/"normalized"
    destination.mkdir(exist_ok=True)
    counts=Counter()
    for path in sorted((ROOT/"ocr").glob("page-*.json")):
        repair=ROOT/"repair"/path.name
        source=repair if repair.exists() else path
        raw=json.loads(source.read_text(encoding="utf-8"))
        if raw["status"]=="truncated":
            value,flags=None,["truncated"]
        else:
            value,flags=normal.normalize(raw)
        valid=schema.valid_page(value) if value else False
        result={**raw,"page":value,"normalization_flags":flags,
                "status":"candidate" if valid else "blocked","original_status":raw["status"],
                "raw_output":None,"allowed_for_rag":False,"allowed_for_training":False}
        (destination/path.name).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
        counts[result["status"]]+=1
    print(json.dumps(dict(counts)))


if __name__=="__main__":
    main()
