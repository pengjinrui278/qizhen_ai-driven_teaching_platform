"""agent 直接管理学生的笔记库：存、写、读、改、整理、移动、删、还原。

仓库里没有 tool-calling（`llm.LanguageModel.generate` 只返回 str，
`model_transport.complete` 拒绝一切 finish_reason != "stop"），所以这里用
**回答里带结构化操作块** 的写法：模型在正文末尾附一段

    ```mirror-notes
    {"ops": [{"op": "move", "ids": ["n1"], "folder": "第3章"}]}
    ```

服务端把它解析出来、**逐条校验后自己执行**，再把这段从正文里剥掉。
模型不直接碰数据库，也不碰别人的笔记：所有写入都经过这里的白名单与属主检查——
模型幻觉出来的 id 会被丢掉，并且如实告诉学生哪几项没做成。

刻意不提供彻底删除（purge）：agent 只能把笔记移进回收站，30 天内学生自己还原。
"""

from __future__ import annotations

import json
import re

from .note_library import NOTE_CONTENT_LIMIT, Note

# 操作块所在的围栏。放在回答末尾，解析后从可见正文里剥掉，学生看不到这段 JSON。
OPS_FENCE = "mirror-notes"
OPS_RE = re.compile(r"```[ \t]*" + OPS_FENCE + r"[ \t]*\r?\n(.*?)```", re.S | re.I)
MAX_OPS = 40           # 一次最多执行几项，防止模型一口气搬空整个库
INDEX_LIMIT = 60       # 交给模型的笔记索引条数上限
INDEX_BYTES = 6000

FOLDER_MAX = 200
TITLE_MAX = 200
REMARK_MAX = 500

# 每一项都要说清楚「它是什么、参数长什么样」，模型照着填就行
OP_GRAMMAR = """可用操作（放在回答最后的一段 ```mirror-notes 代码块里，内容是 JSON）：
{"ops": [ ... ]}，每项是下面之一：
- {"op":"save","title":"标题","folder":"目录（可省）","body":"正文（可省，省了就用回答正文）"}
- {"op":"append","id":"笔记id","body":"要追加的正文（可省，省了就用回答正文）"}
- {"op":"update","id":"笔记id","body":"新的完整正文"}
- {"op":"rename","id":"笔记id","title":"新标题"}
- {"op":"move","ids":["笔记id",...],"folder":"目标目录","course_id":"目标科目（可省）"}
- {"op":"star","ids":["笔记id",...],"starred":true}
- {"op":"remark","id":"笔记id","text":"备注"}
- {"op":"delete","ids":["笔记id",...]}     移入回收站，30 天内可还原
- {"op":"restore","ids":["笔记id",...]}    从回收站还原
规则：
- 只能引用「学生笔记库」里列出的 id，绝不自己编 id；找不到对应笔记就不要发这一项。
- 只是回答问题、不需要动笔记库时，不要输出这个代码块。
- 代码块里不要写解释文字，只放 JSON。"""


AGENT_ABILITY = (
    "你有权直接管理学生在「我的笔记」里的笔记：新建、写入、追加、改写、改标题、"
    "写备注、移动目录或科目、标为重要、移入回收站、从回收站还原，"
    "这些都由系统替你执行，不要说自己不能操作学生的笔记，也不要让学生自己去改。"
    "需要动笔记库时，在回答的最后附一段操作块，系统会照着执行：\n"
)


def ops_prompt(note_index: str) -> str:
    """交给模型的完整说明：能力声明 + 操作清单 + 学生自己的笔记索引（含可引用的 id）。"""
    return f"{AGENT_ABILITY}{OP_GRAMMAR}\n\n{note_index}"


def run_ops_block(db, account_id: str, answer: str, *, default_course: str = "",
                  default_folder: str = "") -> tuple[str, dict]:
    """把回答末尾的操作块执行掉，返回 (剥掉操作块的正文, 回执)。

    没有操作块就原样返回、回执为空——调用方据此决定要不要走自动新建那条路。
    """
    clean, planned = parse_ops(answer)
    if not planned:
        return clean, {}
    results = apply_ops(db, account_id, planned, default_course=default_course,
                        default_body=clean, default_folder=default_folder)
    return clean, operations_payload(results)


def build_note_index(notes) -> str:
    """把学生自己的笔记列成一张紧凑清单，让模型有 id 可以用。

    只列本人、未删除的；条数与字节都设上限——库大了不能整份塞进上下文。
    """
    if not notes:
        return ("学生笔记库（本账号）：目前一篇笔记都没有。"
                "学生要存东西时用 save 新建，不要凭空引用 id。")
    lines = ["学生笔记库（本账号；只能用这里列出的 id，不要编造）"]
    used = 0
    listed = 0
    for row in notes[:INDEX_LIMIT]:
        stamp = row.updated_at.strftime("%Y-%m-%d") if row.updated_at else ""
        line = (f"- id={row.id} 《{row.title}》 科目：{row.course_id or '未分'} "
                f"目录：{row.folder_path or '科目根'} {'★' if row.starred else ''} 更新：{stamp}")
        size = len(line.encode("utf-8")) + 1
        if used + size > INDEX_BYTES:
            break
        used += size
        listed += 1
        lines.append(line)
    if listed < len(notes):
        lines.append(f"（还有 {len(notes) - listed} 篇未列出；未列出的不要引用，"
                     "需要的话先让学生用关键词找。）")
    return "\n".join(lines)


def parse_ops(answer: str) -> tuple[str, list[dict]]:
    """从回答里取出操作块。返回 (剥掉操作块的正文, 操作列表)。

    块里不是合法 JSON、或者结构不对，就整块丢掉并返回空列表——
    宁可什么都不做，也不能拿一段解析不出来的东西去改学生的笔记。
    """
    text = answer or ""
    matches = list(OPS_RE.finditer(text))
    if not matches:
        return text, []
    clean = OPS_RE.sub("", text)
    # 连续空行收一下，免得剥掉块之后正文尾部留一大片空白
    clean = re.sub(r"\n{3,}", "\n\n", clean).strip()
    ops: list[dict] = []
    for match in matches:
        try:
            payload = json.loads(match.group(1).strip())
        except (ValueError, TypeError):
            continue
        if not isinstance(payload, dict):
            continue
        raw = payload.get("ops")
        if not isinstance(raw, list):
            continue
        ops.extend(item for item in raw if isinstance(item, dict))
    return clean, ops[:MAX_OPS]


def _text(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _ids(value) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip() and item.strip() not in out:
            out.append(item.strip())
        if len(out) >= MAX_OPS:
            break
    return out


def _own(db, account_id: str, note_id: str, *, include_deleted: bool = False):
    """只认本人的、未删除的笔记。别人的 / 不存在的 / 已在回收站的都当没这回事。"""
    row = db.get(Note, note_id) if note_id else None
    if row is None or row.account_id != account_id:
        return None
    if row.deleted_at is not None and not include_deleted:
        return None
    return row


def _touch(row) -> None:
    from datetime import UTC, datetime
    row.updated_at = datetime.now(UTC)


def _describe(row) -> str:
    return f"《{row.title}》"


def apply_ops(db, account_id: str, ops: list[dict], *, default_course: str = "",
              default_folder: str = "", default_body: str = "") -> list[dict]:
    """逐条执行操作。每条都返回一句人话的结果（做成了什么 / 为什么没做成）。

    失败不抛异常：一项做不成就跳过它、继续做后面的，最后把没做成的如实告诉学生。
    """
    results: list[dict] = []
    for op in ops:
        name = str(op.get("op") or "").strip()
        try:
            results.append(_apply_one(db, account_id, name, op, default_course,
                                      default_folder, default_body))
        except Exception:  # noqa: BLE001 —— 一项出问题不该带崩整次回答
            results.append({"op": name, "ok": False, "detail": "这一项没能完成，已跳过。"})
    return results


def _apply_one(db, account_id, name, op, default_course, default_folder, default_body) -> dict:
    if name == "save":
        from .note_library import save_agent_note
        body = _text(op.get("body"), NOTE_CONTENT_LIMIT) or default_body
        if not body.strip():
            return {"op": name, "ok": False, "detail": "要保存的正文是空的，没存。"}
        row = save_agent_note(
            db, account_id, _text(op.get("course_id"), 64) or default_course,
            _text(op.get("title"), TITLE_MAX) or "课程笔记", body,
            source_meta={"v": 1, "origin": "note_agent", "op": "save"},
            folder_path=_text(op.get("folder"), FOLDER_MAX) or default_folder)
        return {"op": name, "ok": True, "id": row.id, "title": row.title,
                "detail": f"新建了 {_describe(row)}"}

    if name in ("append", "update", "rename", "remark"):
        row = _own(db, account_id, _text(op.get("id"), 64))
        if row is None:
            return {"op": name, "ok": False, "detail": "找不到要改的那篇笔记，这一项没做。"}
        if name == "append":
            from .note_library import merge_agent_note
            body = _text(op.get("body"), NOTE_CONTENT_LIMIT) or default_body
            if not body.strip():
                return {"op": name, "ok": False, "detail": "要追加的正文是空的，没做。"}
            merged = merge_agent_note(db, row, body, source_meta={"v": 1, "origin": "note_agent",
                                                                 "op": "append"})
            if merged is None:
                return {"op": name, "ok": False,
                        "detail": f"{_describe(row)} 已经写满，追加不进去，请另存一份新的。"}
            return {"op": name, "ok": True, "id": row.id, "title": row.title,
                    "detail": f"往 {_describe(row)} 后面追加了一段"}
        if name == "update":
            body = _text(op.get("body"), NOTE_CONTENT_LIMIT)
            if not body:
                return {"op": name, "ok": False, "detail": "新的正文是空的，没改。"}
            row.content = body
        elif name == "rename":
            title = _text(op.get("title"), TITLE_MAX)
            if not title:
                return {"op": name, "ok": False, "detail": "新标题是空的，没改。"}
            old, row.title = row.title, title
            _touch(row)
            return {"op": name, "ok": True, "id": row.id, "title": row.title,
                    "detail": f"把《{old}》改名为 {_describe(row)}"}
        else:
            row.remark = _text(op.get("text"), REMARK_MAX)
        _touch(row)
        return {"op": name, "ok": True, "id": row.id, "title": row.title,
                "detail": f"更新了 {_describe(row)}"}

    if name in ("move", "star", "delete", "restore"):
        ids = _ids(op.get("ids") or op.get("id"))
        if not ids:
            return {"op": name, "ok": False, "detail": "没给要处理的笔记，这一项没做。"}
        folder = _text(op.get("folder"), FOLDER_MAX)
        course = _text(op.get("course_id"), 64)
        done, missing = [], 0
        for note_id in ids:
            row = _own(db, account_id, note_id, include_deleted=name == "restore")
            if row is None:
                missing += 1
                continue
            if name == "move":
                if folder or "folder" in op:
                    row.folder_path = folder
                if course:
                    row.course_id = course
            elif name == "star":
                row.starred = bool(op.get("starred"))
            elif name == "delete":
                from datetime import UTC, datetime
                row.deleted_at = datetime.now(UTC)
                row.deleted_from = row.folder_path or ""
            else:
                row.deleted_at = None
                row.folder_path = row.deleted_from or row.folder_path
            _touch(row)
            done.append(_describe(row))
        if not done:
            return {"op": name, "ok": False, "detail": "这些笔记都不在库里，这一项没做。"}
        verb = {"move": "移动到 " + (folder or "科目根"), "star": "改了重要标记",
                "delete": "移入回收站（30 天内可还原）", "restore": "从回收站还原"}[name]
        detail = f"{verb}：" + "、".join(done[:8]) + ("等" if len(done) > 8 else "")
        if missing:
            detail += f"；另有 {missing} 篇没找到，没动。"
        return {"op": name, "ok": True, "ids": ids[:len(done)], "detail": detail}

    return {"op": name, "ok": False, "detail": f"不认识的操作「{name}」，已跳过。"}


def operations_payload(results: list[dict]) -> dict:
    """回给前端的操作回执。没有结果就完全不加字段。"""
    if not results:
        return {}
    return {"note_ops": {"results": results,
                         "done": sum(1 for item in results if item.get("ok")),
                         "failed": sum(1 for item in results if not item.get("ok"))}}
