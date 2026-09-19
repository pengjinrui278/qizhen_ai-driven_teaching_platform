"""Loss-aware JSON transport repair; outputs remain unverified."""
import json,re
from pathlib import Path
LATEX={"beta","theta","tau","nu","rho","frac","dfrac","tfrac","begin","text","textbf","textit","to","times","tan","tanh","top","right","rightarrow","rangle","rfloor","rceil","neq","ne","not","nabla","forall","bar","big","bigl","bigr","vec"}
def repair_json(raw):
    s=raw.strip()
    if s.startswith(chr(96)*3):
        s=s[s.find("\n")+1:];s=s[:s.rfind(chr(96)*3)].strip()
    out=[];quoted=False;i=0
    while i<len(s):
        c=s[i]
        if not quoted:
            out.append(c)
            if c=='"':quoted=True
            i+=1;continue
        if c=='"':quoted=False;out.append(c);i+=1;continue
        if c=="\\" and i+1<len(s):
            n=s[i+1]
            if n in ('\\','"','/'):
                out.extend((c,n));i+=2;continue
            match=re.match(r"[A-Za-z]+",s[i+1:]);word=match.group() if match else ""
            if word in LATEX or n not in "bfnrtu" or (n=="u" and not re.match(r"^[0-9a-fA-F]{4}",s[i+2:])):
                out.append("\\\\");i+=1;continue
            out.extend((c,n));i+=2;continue
        if ord(c)<32:
            out.append(json.dumps(c)[1:-1]);i+=1;continue
        out.append(c);i+=1
    serialized="".join(out)
    try:
        return json.loads(serialized)
    except json.JSONDecodeError:
        # Known provider defect: one stray object closer after the final uncertainty string.
        # Only try this at the terminal uncertainties array; no source text is changed.
        if '"uncertainties"' in serialized and serialized.endswith('"}]}'):
            return json.loads(serialized[:-3]+"]}")
        raise

def normalize(record):
    changes=[]
    if record.get("raw_output"):
        try:value=repair_json(record["raw_output"]);changes.append("transport_json_normalized")
        except (ValueError,TypeError):return None,["unparseable"]
    else:value=record.get("page")
    if not isinstance(value,dict) or not isinstance(value.get("blocks"),list):return None,["missing_blocks"]
    for b in value["blocks"]:
        if not isinstance(b,dict):return None,["invalid_block"]
        if b.get("kind") in ("text","paragraph","solution","figure","table","list","remark"):
            b["original_kind"]=b["kind"];b["kind"]="other";changes.append("unrecognized_kind_retained_as_other")
        text=b.get("text")
        if not isinstance(text,str):return None,["invalid_text"]
        if any(c in text for c in ("\b","\f","\r","\t")) or re.search(r"\n(?:abla|eq|u)(?![A-Za-z])",text):
            changes.append("possible_latex_control_escape")
        if type(b.get("continues_from_previous")) is not bool or type(b.get("continues_to_next")) is not bool:
            changes.append("unknown_continuation")
    if value.get("printed_page") is not None:value["printed_page"]=str(value["printed_page"])
    return value,sorted(set(changes))

def main(root):
    counts={}
    for f in root.glob("*/ocr-v[12]/page-*.json"):
        target=f.parent.parent/f.parent.name.replace("ocr-","normalized-")/f.name
        if target.exists() and json.loads(target.read_text(encoding="utf-8")).get("status")!="blocked":continue
        row=json.loads(f.read_text(encoding="utf-8"));value,flags=normalize(row)
        out={"source_sha256":row["source_sha256"],"pdf_page":row["pdf_page"],"page":value,
             "normalization_flags":flags,"original_status":row["status"],"status":"candidate" if value else "blocked",
             "verified":False,"allowed_for_rag":False}
        target.parent.mkdir(exist_ok=True)
        out["normalization_revision"]=2
        with target.open("w" if target.exists() else "x",encoding="utf-8") as stream:json.dump(out,stream,ensure_ascii=False,indent=2)
        counts[out["status"]]=counts.get(out["status"],0)+1
    print(json.dumps(counts))
if __name__=="__main__":main(Path("data/textbook-library"))
