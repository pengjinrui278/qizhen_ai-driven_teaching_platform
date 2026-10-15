"""笔记偏好：选项 schema、逐项提示词片段、提示词拼装、来源标记、教材章节摘录。

为什么这些文案在后端：用户要求「后端 skill 提前为各个选项拟好相对应的提示词」——
改提示词不该动前端、不该重新构建。本模块只做纯函数，不碰数据库、不调模型。

来源标记 `[[MIRROR-NOTE1 <base64url(json)>]]` 由前端在**发送时**追加（输入框里不显示），
由 `mirror_service` 解析；见 `parse_marker` / `strip_marker`。
之所以用 base64url 而不是裸 JSON：`retrieval._query_tokens` 会从消息里抽中文二元组，
裸 JSON 里的「第8章 反常积分」会污染每次教材检索的查询词。
"""
import base64
import json
import re

VERSION = 1
# 单条消息上限 6000（platform_api.Message）；提示词 + 标记必须留出余量。
MAX_TOTAL_CHARS = 5200
# 「整理选中的回答」的材料额度。学生选中的回答**整段**进来，一个字都不截——
# 截断了笔记的覆盖范围就是错的（早先单处只留 6000 字节，长回答被拦腰砍掉）。
# 总额度与 context_budget 的笔记任务上限对齐；真到放不下时如实说明还差几处，不假装完整。
REPLIES_BUDGET_BYTES = 180000

# 每组：id / label / hint / 选项 (id, label, hint, 提示词片段)
GROUPS = [
    {"id": "structure", "label": "笔记结构", "hint": "不选就按内容自动组织",
     "options": [
         ("outline", "提纲式", "一级标题 + 要点列表",
          "用提纲式组织：一级标题下用要点列表，每点一句话，不写长段落。"),
         ("cornell", "康奈尔", "线索 / 要点 / 小结 三段",
          "用康奈尔笔记法：每条内容分「线索 / 要点 / 小结」三段；线索写成提问式的关键词，小结三五句话。"),
         ("qa", "问答式", "先提问，再回答",
          "用问答式组织：每个知识点先写一个我会问的问题，再给出简明回答；问题行以「问：」开头，回答行以「答：」开头。"),
         ("conceptmap", "概念图式", "概念之间的包含与依赖",
          "用概念图式组织：先用嵌套列表画出概念之间的包含与依赖关系（父概念 → 子概念），再用一句话说明每条连线为什么成立。"),
     ]},
    {"id": "format", "label": "文件格式", "hint": "决定版式与段落粒度",
     "options": [
         ("markdown", "Markdown", "通用，公式可渲染",
          "输出纯 Markdown：只用 # ## ### 标题、列表、表格与行内公式（$…$、$$…$$），不要用代码块把整篇包起来。"),
         ("word", "Word", "短段落、编号列表，便于粘贴",
          "按 Word 文档排版输出 Markdown：标题层级不超过三级，多用短段落与编号列表，避免宽表格；公式单独成行（$$…$$），便于直接粘贴到 Word。"),
         ("ppt", "PPT", "按页分隔，每页 6 行以内",
          "按 PPT 分页输出：每一页用单独一行的「---」分隔；每页第一行是标题，正文不超过 6 行、每行不超过 30 字；最后一页是「小结」。"),
         ("printable_html", "可打印 HTML", "A4 单栏讲义版式",
          "按可打印讲义排版输出 Markdown：适合 A4 单栏阅读，标题层级不超过三级，公式单独成行，控制单行长度，便于直接打印。"),
     ]},
    {"id": "chart", "label": "图表", "hint": "选「无」则不加图",
     "options": [
         ("none", "无", "只要文字", ""),
         ("compare_table", "对比表", "容易混的概念逐项对照",
          "至少给一张 Markdown 对比表：把容易混淆的概念、条件或方法放进同一张表逐项对照。"),
         ("timeline", "时间线", "按出现先后编号",
          "给出一条时间线（按出现先后编号的列表），标出概念或结论的依赖顺序。"),
         ("flowchart", "流程图", "mermaid 流程图",
          "给出一个 ```mermaid 流程图：节点只写关键动作或判断，放在对应的知识点之后。"),
         ("conceptmap", "概念图", "mermaid 概念图，连线标关系",
          "给出一个 ```mermaid 概念图：节点是概念，连线上标注关系词。"),
         ("derivation", "推导步骤", "逐步编号，标出易错一步",
          "给出关键结论的推导步骤：逐步编号，每步写明用到的条件或定理，并指出最容易出错的一步。"),
     ]},
    {"id": "driver", "label": "理解驱动", "hint": "以知识点还是以例题为主线",
     "options": [
         ("concept", "知识点驱动", "先定义定理，再举例印证",
          "以知识点为主线组织：先给定义与定理，再作简要说明，最后用例子印证。"),
         ("example", "例题驱动", "先例题，再讲为什么这样做",
          "以例题为主线组织：每讲一个方法先给一道典型例题（题干从简、只保留关键条件），随后写「为什么这样做」和「换一个条件会怎样」。"),
     ]},
    {"id": "depth", "label": "深浅", "hint": "展开程度与语言风格",
     "options": [
         ("deep", "深入", "讲清条件必要性与边界情形",
          "内容要深入：写清条件的必要性、定理之间的关系与边界情形，指出常见误解；必要时补一句为什么不能减弱条件。"),
         ("plain", "通俗", "先讲直觉，再给严格表述",
          "内容要通俗：先用日常语言说直觉，再给严格表述；专业术语第一次出现时用一句话解释，不堆砌符号。"),
     ]},
    {"id": "purpose", "label": "用途", "hint": "预习 / 复习 / 考前冲刺",
     "options": [
         ("preview", "预习", "给阅读路线与听课重点",
          "这份笔记用于课前预习：先给这一章的阅读路线（先看什么、再看什么），标出上课要重点听的三到五个问题，不要求完整证明。"),
         ("review", "复习", "知识点串联 + 自我检查问题",
          "这份笔记用于课后复习：按知识点把定义、定理、方法与典型例题串起来，每一节末尾给一句自我检查的问题。"),
         ("exam", "考前冲刺", "结论 + 易错点，压缩扫读",
          "这份笔记用于考前冲刺：优先给结论、常用方法、易错点与判别步骤，压缩成便于快速扫读的形式，省略冗长证明。"),
     ]},
]

SOURCE_KINDS = [
    {"id": "chapter", "label": "教材章节", "hint": "从资源中心选一章，只依据这一章"},
    {"id": "chat", "label": "刚才的回答", "hint": "把对话里已有的回答整理成笔记"},
    {"id": "upload", "label": "我上传的资料", "hint": "刚上传的文件内容"},
]

PURPOSE_LABEL = {option[0]: option[1] for option in GROUPS[-1]["options"]}

TEMPLATE = """请为《{course_label}》生成一份{note_label}。

【笔记要求】
{bullets}

【{basis_head}】{basis_body}

【本次补充】{free_text}

请直接输出笔记正文：不要写「好的」「以下是」之类的开场话，不要询问更多信息，不要输出与笔记正文无关的说明。
笔记里的定义、定理、公式与结论必须来自上面给出的材料；材料没有覆盖的内容，请在该处标注「（超出所给材料，待核对）」。
"""

MARKER_RE = re.compile(r"\[\[MIRROR-NOTE1 ([A-Za-z0-9_\-]{16,2400})\]\]")


def _groups_for_client():
    # 片段随选项一起下发：偏好面板的按钮点一下就要往输入框插一段高亮要求，
    # 需要当场拿到文本。文案仍然只由后端维护（改这里即可，前端不硬编码）。
    return [{"id": group["id"], "label": group["label"], "hint": group["hint"], "clearable": True,
             "options": [{"id": o[0], "label": o[1], "hint": o[2], "prompt": o[3]} for o in group["options"]]}
            for group in GROUPS]


def _fragment(group_id, option_id):
    for group in GROUPS:
        if group["id"] != group_id:
            continue
        for option in group["options"]:
            if option[0] == option_id:
                return option[3]
    return ""


def option_groups(folders=None):
    """GET /notes/preferences 的响应：只给标签与提示，提示词片段留在服务端。"""
    return {"version": VERSION, "groups": _groups_for_client(), "source_kinds": SOURCE_KINDS,
            "formats": [{"id": o[0], "label": o[1]} for o in GROUPS[1]["options"]],
            "limits": {"free_text": 1200, "title": 200, "folder": 200, "content": 60000,
                       "prompt": MAX_TOTAL_CHARS},
            "defaults": {"folders": folders or []}}


def build_marker(payload):
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return "[[MIRROR-NOTE1 " + base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=") + "]]"


def parse_marker(text):
    match = MARKER_RE.search(text or "")
    if not match:
        return None
    token = match.group(1)
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
        data = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) and data.get("v") == VERSION else None


def strip_marker(text):
    return MARKER_RE.sub("", text or "").strip()


def compose(body, course_label="本课程"):
    """把面板选择拼成一段提示词 + 承载来源与选择的标记。

    返回 prompt 与 marker 分开：前端把 prompt 放进输入框给用户看，
    发送时才把 marker 追加到消息末尾。
    """
    selections = body.get("selections") or {}
    free_text = (body.get("free_text") or "").strip()
    source = body.get("source") or {}
    dest = body.get("dest") or {}
    warnings = []

    bullets, preview = [], []
    for group in GROUPS:
        option_id = selections.get(group["id"])
        if not option_id:
            continue
        fragment = _fragment(group["id"], option_id)
        if not fragment:
            continue
        bullets.append("- " + fragment)
        preview.append({"label": group["label"], "text": fragment})
    if not bullets:
        bullets.append("- （未指定，按内容自行组织，保持简洁）")
        warnings.append("未选择任何选项，将按默认要求生成。")
    if not free_text:
        warnings.append("未填写补充说明。")

    purpose = PURPOSE_LABEL.get(selections.get("purpose", ""), "")
    note_label = (purpose + "笔记") if purpose else "学习笔记"

    kind = source.get("kind") or "chat"
    if kind == "chapter":
        chapter = source.get("chapter") or ""
        book = source.get("book_title") or "教材"
        volume = source.get("volume") or ""
        basis_head = "依据"
        basis_body = (f"教材《{book}》{volume}「{chapter}」整章内容；只使用这一章，"
                      "不要扩展到其它章节。")
    elif kind == "upload":
        basis_head = "依据"
        basis_body = "学生本次上传的资料内容（已附在下方）。"
    else:
        basis_head = "依据"
        basis_body = "本次对话中的回答（已附在下方）。"

    prompt = TEMPLATE.format(course_label=course_label, note_label=note_label,
                             bullets="\n".join(bullets), basis_head=basis_head,
                             basis_body=basis_body, free_text=free_text or "（无）")

    marker_payload = {"v": VERSION, "mode": "generate",
                      "src": {"k": kind, "sid": source.get("source_id"),
                              "ch": source.get("chapter")},
                      "p": {k: v for k, v in selections.items() if v},
                      "d": {"f": dest.get("folder_path"), "t": dest.get("title"),
                            "fm": dest.get("format"), "s": bool(dest.get("starred"))},
                      "free": free_text}
    marker = build_marker(marker_payload)
    total = len(prompt) + len(marker)
    if total > MAX_TOTAL_CHARS:
        raise ValueError(f"要求过长（{total} 字），请精简补充说明")
    return {"mode": "generate", "prompt": prompt, "marker": marker, "chars": len(prompt),
            "marker_chars": len(marker), "total_chars": total, "preview_sections": preview,
            "warnings": warnings,
            "dest": {"course_id": dest.get("course_id", ""), "folder_path": dest.get("folder_path", ""),
                     "title": dest.get("title") or (note_label if note_label != "学习笔记" else "课程笔记"),
                     "format": dest.get("format") or "markdown", "starred": bool(dest.get("starred"))}}


def compose_find(query, dest=None):
    """「帮我找一份笔记」：提示词给模型看，标记里带检索词供服务端先查本人的笔记库。"""
    keyword = (query or "").strip()
    prompt = (f"请在我的笔记里找和「{keyword}」相关的内容，"
              "并告诉我它存在 科目 › 目录 › 文件名的什么位置；找不到就直说没找到，不要编造。")
    marker = build_marker({"v": VERSION, "mode": "find", "q": keyword})
    return {"mode": "find", "prompt": prompt, "marker": marker, "chars": len(prompt),
            "marker_chars": len(marker), "total_chars": len(prompt) + len(marker),
            "preview_sections": [], "warnings": [], "dest": dest or {}}


# --- 教材章节摘录 ---------------------------------------------------------
# 实测一章 262–640 块 / 5.2 万–14.3 万字符，而 context_budget 给「用户段落」的上限是
# 总计 48KB、单段 18KB —— 整章原文塞不进去，所以给「完整章节目录 + 按预算节选正文」，
# 并在尾部如实写明还有多少块没列出。
KIND_BYTES = {"definition": 900, "theorem": 900, "corollary": 900, "lemma": 900,
              "property": 900, "formula": 900, "example": 600, "proof": 400,
              "explanation": 300, "exercise": 200, "other": 200}
KIND_ORDER = ["definition", "theorem", "corollary", "lemma", "property", "formula",
              "example", "derivation", "proof", "explanation", "exercise", "other"]
KIND_LABEL = {"definition": "定义", "theorem": "定理", "corollary": "推论", "lemma": "引理",
              "property": "性质", "formula": "公式", "example": "例", "proof": "证明",
              "explanation": "说明", "exercise": "习题", "other": "正文"}


def _chunk_kind(chunk):
    kind = (chunk.source or {}).get("kind") if isinstance(chunk.source, dict) else None
    return kind if kind in KIND_BYTES else "other"


def _chunk_page(chunk):
    spans = (chunk.source or {}).get("source_spans") if isinstance(chunk.source, dict) else None
    if spans and isinstance(spans[0], dict):
        return spans[0].get("printed_page") or spans[0].get("pdf_page")
    return None


def chunk_sort_key(chunk):
    """按 PDF 页码排序；locator 是字符串，直接排会把 p.100 排到 p.20 前面。"""
    spans = (chunk.source or {}).get("source_spans") if isinstance(chunk.source, dict) else None
    if spans and isinstance(spans[0], dict) and isinstance(spans[0].get("pdf_page"), int):
        return (spans[0]["pdf_page"], int(spans[0].get("block_index") or 0), chunk.chunk_id)
    return (10 ** 6, 0, chunk.chunk_id)


def _section_of(title):
    parts = [p.strip() for p in (title or "").split("·") if p.strip()]
    for part in parts:
        if re.match(r"^\d+(\.\d+)+", part) or re.match(r"^第\s*\d+\s*节", part):
            return part
    return parts[-1] if len(parts) > 1 else "（未分节）"


def _chapter_of(title):
    for part in [p.strip() for p in (title or "").split("·") if p.strip()]:
        if re.match(r"^第\s*\d+\s*章", part):
            return part
    return ""


def _clip(text, limit):
    text = (text or "").strip()
    if len(text.encode("utf-8")) <= limit:
        return text
    clipped, total = [], 0
    for char in text:
        size = len(char.encode("utf-8"))
        if total + size > limit - 3:
            break
        clipped.append(char)
        total += size
    return "".join(clipped) + "…"


def build_note_material(chunks, marker, budget_bytes=16000, cited_limit=16):
    """把一章的门控文本块压成「完整目录 + 节选正文」。

    返回 (给模型看的文本, 实际引用的块)。引用的块用于生成资料来源，让回答可追溯。
    """
    payload = (marker or {}).get("p") or {}
    purpose = payload.get("purpose")
    prefer_exercise = purpose in {"review", "exam"}

    if not chunks:
        return ("教材章节内容（本次笔记任务的依据）\n本章没有取到任何可用片段；"
                "请直接告诉学生这一章的内容暂时读不到，不要凭印象写。", [])

    rows = sorted(chunks, key=chunk_sort_key)
    # 按首次出现顺序分组。不能用「和上一组比」的写法：同一小节若在正文里被其它小节
    # 隔开（跨页归并、插图、习题回头引用），后面那批会被整段丢掉。
    grouped, order = {}, []
    for chunk in rows:
        name = _section_of(chunk.title)
        if name not in grouped:
            grouped[name] = []
            order.append(name)
        grouped[name].append(chunk)
    sections = [(name, grouped[name]) for name in order]

    chapter = _chapter_of(rows[0].title)
    cited, used, budget = [], [], budget_bytes
    body_parts = []

    for name, items in sections:
        ordered = sorted(items, key=lambda c: (KIND_ORDER.index(_chunk_kind(c)), chunk_sort_key(c)))
        lines = [f"## {name}"]
        for chunk in ordered:
            kind = _chunk_kind(chunk)
            if kind == "exercise" and not prefer_exercise:
                continue
            page = _chunk_page(chunk)
            label = KIND_LABEL.get(kind, "正文") + (f" · {page} 页" if page else "")
            text = _clip(chunk.content, KIND_BYTES[kind])
            cost = len(text.encode("utf-8")) + len(label.encode("utf-8")) + 8
            if cost > budget:
                continue
            budget -= cost
            used.append(chunk)
            lines.append(f"[{label}] {text}")
        if len(lines) > 1:
            body_parts.append("\n".join(lines))
        if len(used) >= cited_limit:
            break

    # 引用按节分散取一条，资料来源才不会只列第一页
    for _name, items in sections:
        if len(cited) >= cited_limit:
            break
        for chunk in items:
            if chunk in used:
                cited.append(chunk)
                break

    omitted = len(rows) - len(used)
    header = ("教材章节内容（本次笔记任务的依据；只可使用这里出现的内容，未出现的不要补写）\n"
              f"{chapter or '本章'} · 共 {len(rows)} 块，已按预算节选 {len(used)} 块")
    index = "## 本章结构\n" + "\n".join(f"{i + 1}. {name}" for i, (name, _) in enumerate(sections))
    tail = (f"\n[本章还有 {omitted} 块未列出；未列出的部分不作为依据，"
            "涉及这些内容时标注「（超出所给材料，待核对）」]") if omitted > 0 else ""
    return ("\n".join([header, "", index, "", "\n\n".join(body_parts)]) + tail, cited[:cited_limit])


UPLOAD_RE = re.compile(r"\[\[MIRROR-UPLOAD1 ([A-Za-z0-9_-]{6,64})\]\]")
# 笔记引用：前端在输入框里插的引用块序列化成它，名字用 base64url 带上（只为回显）
NOTEREF_RE = re.compile(r"\[\[MIRROR-REF1 ([A-Za-z0-9_-]{6,64}) ([A-Za-z0-9_=+/-]*)\]\]")


def parse_note_refs(text):
    """按出现顺序返回被引用的笔记 id（去重）。"""
    seen, ids = set(), []
    for token in NOTEREF_RE.findall(text or ""):
        if token[0] not in seen:
            seen.add(token[0])
            ids.append(token[0])
    return ids


def strip_note_refs(text):
    return NOTEREF_RE.sub("", text or "").strip()


def build_note_ref_material(notes, budget_bytes=12000):
    """把学生引用的笔记正文拼成依据。只允许引用本人的笔记（调用方负责取本人数据）。"""
    if not notes:
        return ""
    parts = ["学生引用的笔记（本次回答的依据之一；只可使用这里出现的内容）"]
    budget = budget_bytes
    for note in notes:
        head = f"## 《{note.title}》（{note.folder_path or '科目根'}）"
        body = (note.content or "").strip()
        if not body:
            parts.append(head + "\n这篇笔记还没有正文，请直接说明它目前是空的。")
            continue
        block = head + "\n" + _clip(body, min(budget, 10000))
        cost = len(block.encode("utf-8"))
        if cost > budget:
            parts.append(head + "\n（受长度限制未展开，请说明你只看到标题）")
            continue
        budget -= cost
        parts.append(block)
    return "\n\n".join(parts)


def parse_upload_ids(text):
    """一条消息里可以拖进多份文档，按出现顺序返回。"""
    seen, ids = set(), []
    for token in UPLOAD_RE.findall(text or ""):
        if token not in seen:
            seen.add(token)
            ids.append(token)
    return ids


def strip_upload_markers(text):
    return UPLOAD_RE.sub("", text or "").strip()


def build_upload_material(rows, budget_bytes=16000):
    """把拖进来的文档正文拼成依据；读不出正文的如实说明，不让模型假装读过。"""
    if not rows:
        return ""
    parts = ["学生本次上传的资料（本次回答的依据；只可使用这里出现的内容）"]
    budget = budget_bytes
    for row in rows:
        head = f"## {row.filename}（{row.kind}）"
        body = (row.text or "").strip()
        if not body:
            parts.append(head + "\n这份文件没有抽出文字（可能是扫描件或旧版 Office 格式），"
                                "请直接告诉学生你读不到它的内容，不要猜。")
            continue
        block = head + "\n" + _clip(body, min(budget, 12000))
        cost = len(block.encode("utf-8"))
        if cost > budget:
            parts.append(head + "\n（受长度限制，这份文件的内容未展开，请说明你只看到文件名）")
            continue
        budget -= cost
        parts.append(block)
    return "\n\n".join(parts)


def build_replies_material(replies, budget_bytes=REPLIES_BUDGET_BYTES):
    """把选中的若干处问答渲染成整理笔记的素材。

    明确要求「整理」而不是照抄：用户选多处的目的就是让 agent 去重、重组。
    单处上限给得宽（一整篇回答要能整段进来），总预算压在 fit_user_sections 的单段上限之下。
    """
    if not replies:
        return ("待整理的回答（本次笔记任务的依据）\n这一批回答没有取到，"
                "请直接告诉学生没读到，不要凭印象编。")
    parts = ["待整理的回答（本次笔记任务的依据；只可使用这里出现的内容）",
             f"共 {len(replies)} 处，请去重、按主题重组，不要按原顺序照抄。",
             "这 N 处回答是学生逐条挑出来的，下面的正文是完整的，不要只整理开头几段。"]
    budget = budget_bytes
    for index, (question, answer) in enumerate(replies, 1):
        # 回答正文整段照录，不裁剪：被截断的素材会让笔记的覆盖范围出错。
        block = f"## 第 {index} 处\n问：{_clip(question, 600)}\n答：{(answer or '').strip()}"
        cost = len(block.encode("utf-8"))
        if cost > budget:
            parts.append(f"（这次只装得下前 {index - 1} 处，后面还有 "
                         f"{len(replies) - index + 1} 处没放进来；请在回答里如实说明，"
                         "不要让笔记显得覆盖了全部选中的内容。）")
            break
        budget -= cost
        parts.append(block)
    return "\n\n".join(parts)


def build_merge_material(note, budget_bytes=6000):
    """并入已有笔记时，把目标笔记的现有内容也交给模型。

    不给的话模型会把同样的东西再写一遍，并进去就是一堆重复段落。
    同时明说「服务端会替你写」，免得模型回一句「我无法直接写入你的笔记」。
    """
    title = getattr(note, "title", "") or "未命名"
    body = _clip(getattr(note, "content", "") or "", budget_bytes)
    return ("要并入的笔记（本次结果会由服务端追加到它后面；已经写过的内容不要再重复，"
            "只补它还没有的部分，也不要重写它的旧内容）\n"
            f"《{title}》现有正文：\n{body}")


def note_title_from(marker, answer, fallback="课程笔记"):
    """笔记标题：面板预填优先，其次取正文首个标题，最后退回一个中性名字。"""
    dest = (marker or {}).get("d") or {}
    if dest.get("t"):
        return str(dest["t"])[:200]
    chapter = ((marker or {}).get("src") or {}).get("ch")
    heading = ""
    for line in (answer or "").splitlines():
        if line.strip().startswith("#"):
            heading = line.lstrip("#").strip()
            break
    stem = chapter or heading or _clip((answer or "").strip().split("\n")[0], 40) or fallback
    purpose = PURPOSE_LABEL.get(((marker or {}).get("p") or {}).get("purpose", ""), "")
    return f"{stem} · {purpose}笔记" if purpose else str(stem)[:200]


def build_note_find_block(hits):
    if not hits:
        return ("笔记库检索结果：本账号下没有匹配的笔记。请直接告诉学生没有找到，"
                "并建议换个说法或先生成一份。")
    lines = ["笔记库检索结果（本账号笔记；只可使用这里出现的条目，不要编造其它笔记）"]
    for note in hits:
        mark = "★ " if getattr(note, "starred", False) else ""
        updated = getattr(note, "updated_at", None)
        stamp = updated.strftime("%Y-%m-%d") if updated else ""
        lines.append(f"- {mark}《{note.title}》 目录：{note.folder_path or '科目根'} ｜ 更新：{stamp}")
    return "\n".join(lines)


def decision_payload(marker, hits=None):
    """把选择回显给前端（重载后确认卡还能重建），没有标记就完全不加字段。"""
    if not marker:
        return {}
    payload = {"note_prefs": {"mode": marker.get("mode"), "prefs": marker.get("p") or {},
                              "src": marker.get("src") or {}, "dest": marker.get("d") or {},
                              "free_text": marker.get("free") or ""}}
    if marker.get("mode") == "find":
        payload["note_hits"] = [{"id": n.id, "course_id": n.course_id, "folder_path": n.folder_path,
                                 "title": n.title, "starred": n.starred, "source": n.source,
                                 "updated_at": n.updated_at.isoformat() if n.updated_at else None}
                                for n in (hits or [])]
    return payload
