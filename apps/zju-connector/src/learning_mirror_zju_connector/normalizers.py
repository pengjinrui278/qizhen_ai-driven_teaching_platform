from __future__ import annotations

import hashlib
import html
import json
import re
from typing import Any

from .client import ZjuConnectorError


def _integer(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and re.fullmatch(r"-?\d+", value.strip()):
        return int(value)
    return None


def _text(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return None


def _stable_id(parts: list[str]) -> str:
    return hashlib.sha256("\0".join(parts).encode("utf-8")).hexdigest()[:24]


def normalize_timetable(body: str, academic_year_start: int, season: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(body)
    except ValueError as exc:
        raise ZjuConnectorError("invalid-response", "教务网课表不是有效 JSON。") from exc
    if payload is None:
        return []
    if not isinstance(payload, dict) or not isinstance(payload.get("kbList"), list):
        raise ZjuConnectorError("invalid-response", "教务网课表缺少课程列表。")

    output: list[dict[str, Any]] = []
    for item in payload["kbList"]:
        if not isinstance(item, dict) or item.get("kcb") is None or _text(item.get("sfyjskc")) == "1":
            continue
        course_block = _text(item.get("kcb")) or ""
        match = re.match(r"^(.*?)<br>(.*?)<br>(.*?)<br>(.*?)zwf", course_block, re.DOTALL)
        day = _integer(item.get("xqj"))
        first_period = _integer(item.get("djj"))
        duration = _integer(item.get("skcd"))
        if not match or day is None or not 1 <= day <= 7:
            continue
        if first_period is None or first_period < 1 or duration is None or not 1 <= duration <= 20:
            continue
        course_name = html.unescape(match.group(1)).replace("&nbsp;", " ").strip()
        teacher = html.unescape(match.group(3)).replace("&nbsp;", " ").strip() or "未知教师"
        location = html.unescape(match.group(4)).replace("&nbsp;", " ").strip() or None
        if not course_name:
            continue
        periods = list(range(first_period, first_period + duration))
        week_code = _text(item.get("dsz"))
        week_pattern = "odd" if week_code == "0" else "even" if week_code == "1" else "all"
        half = _text(item.get("xxq")) or ""
        identity = [
            str(academic_year_start),
            season,
            course_name,
            teacher,
            location or "",
            str(day),
            ",".join(map(str, periods)),
            week_pattern,
        ]
        output.append(
            {
                "id": _stable_id(identity),
                "source": "zju-undergraduate",
                "course_id": (_text(item.get("xkkh")) or "").strip() or None,
                "course_name": course_name.replace("(", "（").replace(")", "）"),
                "teacher": teacher,
                "location": location,
                "day_of_week": day,
                "periods": periods,
                "first_half": "秋" in half or "春" in half,
                "second_half": "冬" in half or "夏" in half,
                "week_pattern": week_pattern,
                "confirmed": _text(item.get("sfqd")) == "1",
            }
        )
    if payload["kbList"] and not output:
        raise ZjuConnectorError("invalid-response", "课表有数据，但当前版本无法解析。")
    return output


def normalize_todos(body: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(body)
    except ValueError as exc:
        raise ZjuConnectorError("invalid-response", "学在浙大作业响应不是有效 JSON。") from exc
    todo_list = payload.get("todo_list") if isinstance(payload, dict) else None
    if not isinstance(todo_list, list):
        raise ZjuConnectorError("invalid-response", "学在浙大响应缺少待办列表。")

    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in todo_list:
        if not isinstance(item, dict) or item.get("is_student") not in {True, "1"}:
            continue
        source_id = (_text(item.get("id")) or "").strip()
        if not source_id or source_id in seen:
            continue
        seen.add(source_id)
        output.append(
            {
                "id": _stable_id(["zju-learning", source_id]),
                "source": "zju-learning",
                "source_id": source_id,
                "title": (_text(item.get("title")) or "未命名作业").strip(),
                "course_name": (_text(item.get("course_name")) or "未知课程").strip(),
                "due_at": (_text(item.get("end_time")) or "").strip() or None,
            }
        )
    return output

