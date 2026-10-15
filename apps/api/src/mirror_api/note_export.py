"""把我的笔记正文（Markdown）导出为 .docx / .pptx / .html。

诚实边界（不假装排版一致）：
- 公式导出为 Unicode 纯文本，不做 OMML/MathML 转换；
- Mermaid 图导出为代码块文本（docx/pptx 不渲染图）；
- 只覆盖笔记常用的块级结构（标题、段落、列表、引用、代码、表格、分隔线），
  复杂 Markdown（脚注、任务列表、内嵌 HTML）按纯文本处理。
"""
import html as html_escape
import io
import re

# LaTeX 常见记号的 Unicode 近似；转换不到的原样保留，便于读者辨认。
_SYMBOLS = {
    r"\alpha": "α", r"\beta": "β", r"\gamma": "γ", r"\delta": "δ", r"\epsilon": "ε",
    r"\varepsilon": "ε", r"\theta": "θ", r"\lambda": "λ", r"\mu": "μ", r"\pi": "π",
    r"\rho": "ρ", r"\sigma": "σ", r"\tau": "τ", r"\phi": "φ", r"\varphi": "φ",
    r"\omega": "ω", r"\Delta": "Δ", r"\Gamma": "Γ", r"\Lambda": "Λ", r"\Sigma": "Σ",
    r"\Phi": "Φ", r"\Omega": "Ω", r"\infty": "∞", r"\to": "→", r"\rightarrow": "→",
    r"\Rightarrow": "⇒", r"\leftrightarrow": "↔", r"\le": "≤", r"\leq": "≤",
    r"\ge": "≥", r"\geq": "≥", r"\ne": "≠", r"\neq": "≠", r"\approx": "≈",
    r"\equiv": "≡", r"\pm": "±", r"\times": "×", r"\div": "÷", r"\cdot": "·",
    r"\in": "∈", r"\notin": "∉", r"\subset": "⊂", r"\subseteq": "⊆", r"\cup": "∪",
    r"\cap": "∩", r"\forall": "∀", r"\exists": "∃", r"\partial": "∂", r"\nabla": "∇",
    r"\int": "∫", r"\sum": "∑", r"\prod": "∏", r"\sqrt": "√", r"\angle": "∠",
    r"\perp": "⊥", r"\parallel": "∥", r"\ldots": "…", r"\cdots": "⋯",
}
_SUB = str.maketrans("0123456789+-=()n", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₙ")
_SUP = str.maketrans("0123456789+-=()n", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ")


_SCRIPT_CHARS = set("0123456789+-=()n")


def _script(body, table, marker):
    """只有整段都能映射成 Unicode 上下标才转换，否则保留 ^ / _ 记号。

    宁可写成 x^p 也不写成 xp——降级不能把指数悄悄丢掉。
    """
    if body and len(body) <= 4 and all(ch in _SCRIPT_CHARS for ch in body):
        return body.translate(table)
    return marker + body if body else ""


def _superscript(body):
    return _script(body, _SUP, "^")


def latex_to_text(formula):
    """把 LaTeX 片段降级为可读纯文本：展开分式/根式、换常见符号、处理上下标。"""
    text = formula.strip()
    for _ in range(3):  # 嵌套分式逐层展开
        text = re.sub(r"\\frac\{([^{}]*)\}\{([^{}]*)\}", r"(\1)/(\2)", text)
    text = re.sub(r"\\sqrt\[3\]\{([^{}]*)\}", r"∛(\1)", text)
    text = re.sub(r"\\sqrt\{([^{}]*)\}", r"√(\1)", text)
    # 按长度倒序替换，保证 \int 先于 \in、\notin 先于 \in 命中
    for name in sorted(_SYMBOLS, key=len, reverse=True):
        text = text.replace(name, _SYMBOLS[name])
    text = re.sub(r"\\([a-zA-Z]+)", r"\1", text)
    text = re.sub(r"\^\{([^{}]*)\}", lambda m: _superscript(m.group(1)), text)
    text = re.sub(r"\^(\w)", lambda m: _superscript(m.group(1)), text)
    text = re.sub(r"_\{([^{}]*)\}", lambda m: _script(m.group(1), _SUB, "_"), text)
    text = re.sub(r"_(\w)", lambda m: _script(m.group(1), _SUB, "_"), text)
    text = text.replace("{", "").replace("}", "").replace("\\", "")
    return re.sub(r"\s+", " ", text).strip()


def _inline(text):
    """把一行行内标记拆成 (文本, 样式) 片段；样式是 bold/italic/code/math 的组合。"""
    pieces = []
    pattern = re.compile(r"(\*\*.+?\*\*|__.+?__|\*[^*]+?\*|`[^`]+?`|\$\$?[^$]+?\$\$?)")
    for part in pattern.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            pieces.append((part[2:-2], {"bold"}))
        elif part.startswith("__") and part.endswith("__") and len(part) > 4:
            pieces.append((part[2:-2], {"bold"}))
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            pieces.append((part[1:-1], {"italic"}))
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            pieces.append((part[1:-1], {"code"}))
        elif part.startswith("$"):
            body = part.strip("$")
            pieces.append((latex_to_text(body), {"italic"}))
        else:
            pieces.append((part, set()))
    return pieces or [("", set())]


def parse_blocks(content):
    """把 Markdown 拆成块级结构，供三个导出器共用。"""
    lines = (content or "").replace("\r\n", "\n").split("\n")
    blocks, i = [], 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        fence = re.match(r"^```(\w*)", stripped)
        if fence:
            lang, body, i = fence.group(1), [], i + 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                body.append(lines[i])
                i += 1
            i += 1
            blocks.append({"type": "code", "lang": lang, "text": "\n".join(body)})
            continue
        heading = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if heading:
            blocks.append({"type": "heading", "level": len(heading.group(1)), "text": heading.group(2).strip()})
            i += 1
            continue
        if re.match(r"^(-{3,}|\*{3,}|_{3,})$", stripped):
            blocks.append({"type": "hr"})
            i += 1
            continue
        if stripped.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|$", lines[i + 1].strip()):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not re.match(r"^[\s:|-]+$", lines[i].strip().strip("|")):
                    rows.append(cells)
                i += 1
            blocks.append({"type": "table", "rows": rows})
            continue
        if re.match(r"^>\s?", stripped):
            body = []
            while i < len(lines) and re.match(r"^>\s?", lines[i].strip()):
                body.append(re.sub(r"^>\s?", "", lines[i].strip()))
                i += 1
            blocks.append({"type": "quote", "text": " ".join(body)})
            continue
        bullet = re.match(r"^[-*+]\s+(.*)$", stripped)
        ordered = re.match(r"^\d+[.)]\s+(.*)$", stripped)
        if bullet or ordered:
            items, is_ordered = [], bool(ordered)
            while i < len(lines):
                probe = lines[i].strip()
                match = re.match(r"^[-*+]\s+(.*)$", probe) if not is_ordered else re.match(r"^\d+[.)]\s+(.*)$", probe)
                if not match:
                    break
                items.append(match.group(1))
                i += 1
            blocks.append({"type": "list", "ordered": is_ordered, "items": items})
            continue
        body = []
        while i < len(lines) and lines[i].strip() and not re.match(
                r"^(#{1,6}\s|```|>\s?|[-*+]\s|\d+[.)]\s|\|)", lines[i].strip()):
            body.append(lines[i].strip())
            i += 1
        if body:
            blocks.append({"type": "para", "text": " ".join(body)})
    return blocks


def render_docx(title, content):
    from docx import Document

    doc = Document()
    doc.add_heading(title or "我的笔记", level=0)
    for block in parse_blocks(content):
        kind = block["type"]
        if kind == "heading":
            doc.add_heading(block["text"], level=min(block["level"], 4))
        elif kind == "para":
            _docx_runs(doc.add_paragraph(), block["text"])
        elif kind == "list":
            style = "List Number" if block["ordered"] else "List Bullet"
            for item in block["items"]:
                _docx_runs(doc.add_paragraph(style=style), item)
        elif kind == "quote":
            _docx_runs(doc.add_paragraph(style="Intense Quote"), block["text"])
        elif kind == "code":
            run = doc.add_paragraph().add_run(block["text"])
            run.font.name = "Consolas"
        elif kind == "table":
            rows = block["rows"]
            if rows:
                table = doc.add_table(rows=len(rows), cols=max(len(r) for r in rows))
                table.style = "Light Grid Accent 1"
                for r, cells in enumerate(rows):
                    for c, value in enumerate(cells):
                        table.cell(r, c).text = value
        elif kind == "hr":
            doc.add_paragraph("—" * 20)
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def _docx_runs(paragraph, text):
    for value, styles in _inline(text):
        run = paragraph.add_run(value)
        run.bold = "bold" in styles
        run.italic = "italic" in styles
        if "code" in styles:
            run.font.name = "Consolas"


def render_pptx(title, content):
    from pptx import Presentation
    from pptx.util import Pt

    pres = Presentation()
    cover = pres.slides.add_slide(pres.slide_layouts[0])
    cover.shapes.title.text = title or "我的笔记"
    blocks = parse_blocks(content)
    if blocks:
        cover.placeholders[1].text = _plain(blocks[0])[:180]

    slide = None
    body = None

    def new_slide(heading):
        made = pres.slides.add_slide(pres.slide_layouts[1])
        made.shapes.title.text = heading[:120] or "（续）"
        return made, made.placeholders[1].text_frame

    def add_line(text, level=0, size=None):
        nonlocal slide, body
        if body is None:
            slide, body = new_slide(title or "我的笔记")
        if len(body.paragraphs) == 1 and not body.paragraphs[0].text:
            para = body.paragraphs[0]
        elif len(body.paragraphs) >= 12:
            slide, body = new_slide("（续）")
            para = body.paragraphs[0]
        else:
            para = body.add_paragraph()
        para.text = text[:400]
        para.level = min(level, 4)
        if size:
            for run in para.runs:
                run.font.size = Pt(size)

    for block in blocks:
        kind = block["type"]
        if kind == "heading":
            if block["level"] <= 2:
                slide, body = new_slide(block["text"])
                body.paragraphs[0].text = ""
            else:
                add_line(block["text"], level=0, size=18)
        elif kind == "para":
            add_line(_plain(block))
        elif kind == "list":
            for item in block["items"]:
                add_line(_plain({"type": "para", "text": item}), level=1)
        elif kind == "quote":
            add_line("「" + _plain(block) + "」", level=1)
        elif kind == "code":
            add_line(block["text"], level=1, size=12)
        elif kind == "table":
            for cells in block["rows"]:
                add_line(" ｜ ".join(cells), level=1)
    buffer = io.BytesIO()
    pres.save(buffer)
    return buffer.getvalue()


def _plain(block):
    if block["type"] == "table":
        return " ｜ ".join(" ".join(cells) for cells in block["rows"])
    return "".join(value for value, _ in _inline(block.get("text", "")))


def render_html(title, content):
    """自包含可打印 HTML：浏览器里直接 Ctrl+P 存 PDF。"""
    parts = [
        "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">",
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
        f"<title>{html_escape.escape(title or '我的笔记')}</title>",
        "<style>body{max-width:820px;margin:40px auto;padding:0 20px;line-height:1.75;",
        "font-family:system-ui,'PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a}",
        "h1,h2,h3{line-height:1.35}pre{background:#f1f5f9;padding:12px;overflow:auto;border-radius:8px}",
        "code{font-family:Consolas,monospace}table{border-collapse:collapse;width:100%}",
        "th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left}",
        "blockquote{border-left:3px solid #cbd5e1;margin-left:0;padding-left:14px;color:#475569}",
        "footer{margin-top:40px;color:#94a3b8;font-size:13px}",
        "@media print{body{margin:0}}</style></head><body>",
        f"<h1>{html_escape.escape(title or '我的笔记')}</h1>",
    ]
    for block in parse_blocks(content):
        parts.append(_html_block(block))
    parts.append("<footer>由学镜「我的笔记」导出 · 公式以纯文本呈现</footer></body></html>")
    return "".join(parts).encode("utf-8")


def _html_inline(text):
    out = []
    for value, styles in _inline(text):
        safe = html_escape.escape(value)
        if "bold" in styles:
            safe = f"<strong>{safe}</strong>"
        if "italic" in styles:
            safe = f"<em>{safe}</em>"
        if "code" in styles:
            safe = f"<code>{safe}</code>"
        out.append(safe)
    return "".join(out)


def _html_block(block):
    kind = block["type"]
    if kind == "heading":
        level = min(block["level"] + 1, 6)
        return f"<h{level}>{_html_inline(block['text'])}</h{level}>"
    if kind == "para":
        return f"<p>{_html_inline(block['text'])}</p>"
    if kind == "list":
        tag = "ol" if block["ordered"] else "ul"
        items = "".join(f"<li>{_html_inline(i)}</li>" for i in block["items"])
        return f"<{tag}>{items}</{tag}>"
    if kind == "quote":
        return f"<blockquote>{_html_inline(block['text'])}</blockquote>"
    if kind == "code":
        return f"<pre><code>{html_escape.escape(block['text'])}</code></pre>"
    if kind == "table":
        head, *rest = block["rows"]
        thead = "".join(f"<th>{_html_inline(c)}</th>" for c in head)
        rows = "".join("<tr>" + "".join(f"<td>{_html_inline(c)}</td>" for c in r) + "</tr>" for r in rest)
        return f"<table><thead><tr>{thead}</tr></thead><tbody>{rows}</tbody></table>"
    return "<hr>"


RENDERERS = {"docx": render_docx, "pptx": render_pptx, "html": render_html}
