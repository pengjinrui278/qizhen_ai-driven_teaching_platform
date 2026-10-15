// 课表文件导入解析（纯浏览器本地解析，不上传服务器，账号/密码不涉及）。
// 支持三种格式：
//   - XLSX：浙大教务「导出课表」的 Excel（由调用方用 read-excel-file 读成二维表后传入）。
//     表头形如：课程代码 / 课程名称 / 教师姓名 / 学期 / 上课时间 / 上课地点 …
//     「上课时间」可含多个时段（分号隔开），如「周一第3,4,5节;周四第3,4节」，一门课拆成多条。
//   - CSV：表头含「课程名称、教师、星期、节次、周次、地点」等列，可缺省或使用别名。
//   - ICS：iCalendar VEVENT（浙大教务 / 学在浙大导出的 .ics 日历文件）。

const WEEKDAY_CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };

// 浙大本科常见节次起始时间（第 1–12 节），仅当 ICS 描述里没有「节次」时按时间兜底。
const PERIOD_STARTS = [
  [8, 0], [8, 50], [9, 50], [10, 40], [11, 30], [13, 15],
  [14, 5], [15, 5], [15, 55], [18, 30], [19, 20], [20, 10],
];

const HEADER_ALIASES = {
  name: ["课程名称", "课程名", "课程", "名称", "name", "course", "title"],
  code: ["课程代码", "课程编号", "课程号", "code", "course_id"],
  teacher: ["教师姓名", "教师", "老师", "授课教师", "任课教师", "teacher"],
  day: ["星期", "星期几", "周几", "day", "weekday"],
  periods: ["节次", "节", "periods", "period"],
  weeks: ["周次", "周", "weeks", "week"],
  location: ["上课地点", "地点", "教室", "location", "room"],
  term: ["学期", "term", "semester"],
  time: ["上课时间", "上课时段", "时间", "时段", "time"],
};

function normalizeHeader(value) {
  return String(value == null ? "" : value).replace(/^﻿/, "").trim().toLowerCase();
}

function mapColumns(headerCells) {
  const col = {};
  headerCells.forEach((h, i) => {
    const key = normalizeHeader(h);
    for (const field of Object.keys(HEADER_ALIASES)) {
      if (HEADER_ALIASES[field].includes(key) && col[field] === undefined) col[field] = i;
    }
  });
  return col;
}

function parseDay(value) {
  const t = String(value == null ? "" : value).replace(/星期|周/g, "").trim();
  if (WEEKDAY_CN[t]) return WEEKDAY_CN[t];
  const n = parseInt(t, 10);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : 0;
}

function parsePeriods(value) {
  const cleaned = String(value == null ? "" : value).replace(/第|节/g, "").trim();
  if (!cleaned) return [];
  const out = [];
  for (const part of cleaned.split(/[,，、;；\s]+/)) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(\d{1,2})\s*[-—~～至]\s*(\d{1,2})$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
    } else {
      const n = parseInt(p, 10);
      if (Number.isInteger(n) && n >= 1 && n <= 20) out.push(n);
    }
  }
  return [...new Set(out)].filter((n) => n >= 1 && n <= 20).sort((a, b) => a - b);
}

function parseWeeks(value) {
  const t = String(value == null ? "" : value).trim();
  let week_pattern = "all";
  if (/单/.test(t)) week_pattern = "odd";
  else if (/双/.test(t)) week_pattern = "even";
  const m = t.match(/(\d{1,2})\s*[-—~～至]\s*(\d{1,2})/);
  let first_half = false;
  let second_half = false;
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (b <= 8) first_half = true;
    else if (a >= 9) second_half = true;
  }
  return { week_pattern, first_half, second_half };
}

function parseTerm(value) {
  const t = String(value == null ? "" : value).trim();
  return { first_half: /秋|春/.test(t), second_half: /冬|夏/.test(t) };
}

function range(from, to) {
  const out = [];
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) out.push(i);
  return out;
}

function splitSemi(value) {
  return String(value == null ? "" : value)
    .split(/[;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 从「周二第6,7,8节」这类文本里拆出星期。
function parseDayFromTime(s) {
  const m = String(s || "").match(/周([一二三四五六日天1-7])/);
  if (!m) return 0;
  return WEEKDAY_CN[m[1]] || Number(m[1]);
}

// 从「第6,7,8节」「第1-2节」「第9节」里拆出节次。
function parsePeriodsFromTime(s) {
  const m = String(s || "").match(/第([^节]{1,12})节/);
  return m ? parsePeriods(m[1]) : [];
}

// 「上课时间」可含多个时段（分号隔开），每个时段 = 星期 + 节次。
function parseTimeSessions(value) {
  const t = String(value == null ? "" : value).trim();
  if (!t) return [];
  const out = [];
  for (const part of t.split(/[;；]/)) {
    const s = part.trim();
    if (!s) continue;
    const day = parseDayFromTime(s);
    const periods = parsePeriodsFromTime(s);
    if (day && periods.length) out.push({ day, periods });
  }
  return out;
}

function makeCourse({ name, course_id, teacher, location, day_of_week, periods, weeks, term, index }) {
  const w = parseWeeks(weeks);
  let first_half = w.first_half;
  let second_half = w.second_half;
  if (term) {
    const t = parseTerm(term);
    first_half = t.first_half;
    second_half = t.second_half;
  }
  return {
    id: "file-" + index,
    source: "zju-undergraduate",
    course_id: course_id || null,
    course_name: name,
    teacher: teacher || "",
    location: location || null,
    day_of_week,
    periods,
    first_half,
    second_half,
    week_pattern: w.week_pattern,
    confirmed: true,
  };
}

function academicYearStart(now) {
  const d = now instanceof Date ? now : new Date();
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}

function buildSnapshot(courses, academic_year_start, season) {
  const now = new Date();
  return {
    schema_version: 1,
    source: "zju-file-import",
    academic_year_start:
      Number.isInteger(academic_year_start) ? academic_year_start : academicYearStart(now),
    season: season || "",
    courses,
    assignments: [],
    fetched_at: now.toISOString(),
  };
}

// 表头可能不在第 0 行（第 0 行可能是「XXXX-XXXX学年…课表」标题行）。
function findHeaderIndex(rows) {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const cells = rows[i].map((c) => String(c == null ? "" : c).trim());
    if (mapColumns(cells).name !== undefined) return i;
  }
  return 0;
}

// 从标题行里取「2026-2027学年秋冬学期」作为学年/学季。
function titleInfo(rows, headerIndex) {
  for (let i = 0; i < headerIndex; i++) {
    const joined = rows[i].map((c) => String(c == null ? "" : c)).join(" ");
    const m = joined.match(/(\d{4})-(\d{4})学年\s*([^ ]{0,4}?)学期/);
    if (!m) continue;
    const s = String(m[3] || "").replace(/\s+/g, "");
    let season = "";
    if (s === "秋") season = "1|秋";
    else if (s === "冬") season = "1|冬";
    else if (s === "春") season = "2|春";
    else if (s === "夏") season = "2|夏";
    return { academic_year_start: Number(m[1]), season };
  }
  return null;
}

// 二维表（含表头行，前面可有标题行）→ 课表快照。CSV 与 XLSX 共用。
function rowsToCourses(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("表格内容为空。");
  const headerIndex = findHeaderIndex(rows);
  const headerCells = rows[headerIndex].map((c) => String(c == null ? "" : c).trim());
  const col = mapColumns(headerCells);
  if (col.name === undefined) throw new Error("缺少「课程名称」列，请检查表头。");
  const hasTime = col.time !== undefined;
  const hasDayPeriods = col.day !== undefined && col.periods !== undefined;
  if (!hasTime && !hasDayPeriods) {
    throw new Error("需要「星期」「节次」两列，或「上课时间」一列（如「周一第1-2节」）。");
  }

  const cell = (row, idx) =>
    idx === undefined ? "" : String(row[idx] == null ? "" : row[idx]).trim();
  const courses = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const name = cell(row, col.name);
    if (!name) continue;
    let sessions = [];
    if (hasTime) sessions = parseTimeSessions(cell(row, col.time));
    if (!sessions.length && hasDayPeriods) {
      const d = parseDay(cell(row, col.day));
      const p = parsePeriods(cell(row, col.periods));
      if (d && p.length) sessions = [{ day: d, periods: p }];
    }
    if (!sessions.length) continue;
    const locations = splitSemi(cell(row, col.location));
    const teacher = cell(row, col.teacher);
    const course_id = cell(row, col.code) || null;
    const term = cell(row, col.term);
    const weeks = cell(row, col.weeks);
    for (let j = 0; j < sessions.length; j++) {
      courses.push(
        makeCourse({
          name,
          course_id,
          teacher,
          location: locations[j] || locations[0] || null,
          day_of_week: sessions[j].day,
          periods: sessions[j].periods,
          weeks,
          term,
          index: courses.length,
        }),
      );
    }
  }
  if (!courses.length) {
    throw new Error("未能解析出课表项，请检查「星期」「节次」或「上课时间」的格式。");
  }
  const ti = titleInfo(rows, headerIndex);
  return buildSnapshot(courses, ti ? ti.academic_year_start : null, ti ? ti.season : "");
}

// ---- CSV ----

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === "," || ch === "，") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function parseScheduleCsv(text) {
  const lines = String(text == null ? "" : text)
    .replace(/^﻿/, "")
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV 内容不足：至少需要表头和一行的数据。");
  return rowsToCourses(lines.map(splitCsvLine));
}

// ---- XLSX（调用方已用 read-excel-file 读成二维表） ----

export function parseScheduleXlsx(rows) {
  if (!Array.isArray(rows)) throw new Error("无法读取 Excel 表格。");
  return rowsToCourses(rows);
}

// ---- ICS ----

function icsUnescape(s) {
  return s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function unfoldIcs(text) {
  const raw = String(text == null ? "" : text).replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const out = [];
  for (const line of raw) {
    if ((line[0] === " " || line[0] === "\t") && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

// 从 Y/M/D 直接算星期（1=周一 … 7=周日），避免时区把日期推歪。
function weekdayOf(y, m, d) {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (m < 3) y -= 1;
  const w = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1] + d) % 7;
  return w === 0 ? 7 : w;
}

function parseIcsDateTime(value) {
  const m = String(value || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/);
  if (!m) return null;
  return {
    y: Number(m[1]),
    m: Number(m[2]),
    d: Number(m[3]),
    hh: m[4] ? Number(m[4]) : 0,
    mm: m[5] ? Number(m[5]) : 0,
  };
}

function minutes(hh, mm) {
  return hh * 60 + mm;
}

function periodsFromTime(start, end) {
  if (!start) return [];
  const s = minutes(start.hh, start.mm);
  let first = 0;
  let last = 0;
  for (let i = 0; i < PERIOD_STARTS.length; i++) {
    const pStart = minutes(PERIOD_STARTS[i][0], PERIOD_STARTS[i][1]);
    const nextStart =
      i + 1 < PERIOD_STARTS.length
        ? minutes(PERIOD_STARTS[i + 1][0], PERIOD_STARTS[i + 1][1])
        : 24 * 60;
    if (s >= pStart - 15 && s < nextStart && !first) first = i + 1;
    if (end && minutes(end.hh, end.mm) > pStart) last = i + 1;
  }
  if (!first) return [];
  if (!last) last = first;
  return range(first, last);
}

function periodsFromDescription(desc) {
  if (!desc) return [];
  let m = desc.match(/节次\s*[:：]?\s*第?\s*(\d{1,2})\s*[-—~～至]\s*(\d{1,2})\s*节?/);
  if (m) return parsePeriods(m[1] + "-" + m[2]);
  m = desc.match(/第\s*(\d{1,2})\s*[-—~～至]\s*(\d{1,2})\s*节/);
  if (m) return parsePeriods(m[1] + "-" + m[2]);
  m = desc.match(/(\d{1,2})\s*[-—~～至]\s*(\d{1,2})\s*节/);
  if (m) return parsePeriods(m[1] + "-" + m[2]);
  m = desc.match(/第\s*(\d{1,2})\s*节/);
  if (m) return parsePeriods(m[1]);
  return [];
}

function weeksFromDescription(desc) {
  if (!desc) return "";
  const m =
    desc.match(/周次\s*[:：]?\s*([^\n;,，；]+)/) ||
    desc.match(/(\d{1,2}\s*[-—~～至]\s*\d{1,2}\s*周[^\n;,，；]*)/);
  return m ? m[1].trim() : "";
}

function teacherFromDescription(desc) {
  if (!desc) return "";
  const m = desc.match(/(?:教师|老师|任课教师)\s*[:：]?\s*([^\n;,，；]+)/);
  return m ? m[1].trim() : "";
}

function parseEvent(block) {
  let summary = "";
  let location = "";
  let description = "";
  let dtstart = null;
  let dtend = null;
  for (const raw of block) {
    const m = raw.match(/^([^;:]+)((?:;[^:]*)?):(.*)$/);
    if (!m) continue;
    const name = m[1].toUpperCase();
    const value = icsUnescape(m[3]);
    if (name === "SUMMARY" && !summary) summary = value.trim();
    else if (name === "LOCATION" && !location) location = value.trim();
    else if (name === "DESCRIPTION") description = description ? description + "\n" + value : value;
    else if (name === "DTSTART" && !dtstart) dtstart = parseIcsDateTime(value);
    else if (name === "DTEND" && !dtend) dtend = parseIcsDateTime(value);
  }
  const day_of_week = dtstart ? weekdayOf(dtstart.y, dtstart.m, dtstart.d) : 0;
  let periods = periodsFromDescription(description);
  if (!periods.length) periods = periodsFromTime(dtstart, dtend);
  return {
    name: summary,
    teacher: teacherFromDescription(description),
    location,
    day_of_week,
    periods,
    weeks: weeksFromDescription(description),
    dtstart,
  };
}

export function parseScheduleIcs(text) {
  const lines = unfoldIcs(text);
  const events = [];
  let inEvent = false;
  let block = [];
  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) {
      inEvent = true;
      block = [];
    } else if (/^END:VEVENT$/i.test(line)) {
      inEvent = false;
      events.push(parseEvent(block));
    } else if (inEvent) {
      block.push(line);
    }
  }
  if (!events.length) throw new Error("ICS 中没有找到任何事件（VEVENT）。");

  const courses = [];
  for (const ev of events) {
    if (!ev.name || !ev.day_of_week || !ev.periods.length) continue;
    courses.push(
      makeCourse({
        name: ev.name,
        course_id: null,
        teacher: ev.teacher,
        location: ev.location,
        day_of_week: ev.day_of_week,
        periods: ev.periods,
        weeks: ev.weeks,
        term: "",
        index: courses.length,
      }),
    );
  }
  if (!courses.length) {
    throw new Error("未能从 ICS 中解析出课程，请确认文件是包含周课表事件的日历导出。");
  }
  let season = "";
  let academic_year_start = null;
  const firstDt = events.find((e) => e.dtstart);
  if (firstDt && firstDt.dtstart) {
    const { y, m } = firstDt.dtstart;
    academic_year_start = m >= 9 ? y : y - 1;
    if (m >= 9 && m <= 11) season = "1|秋";
    else if (m === 12 || m === 1) season = "1|冬";
    else if (m >= 2 && m <= 4) season = "2|春";
    else season = "2|夏";
  }
  return buildSnapshot(courses, academic_year_start, season);
}

// ---- 分发（仅文本格式；XLSX 由调用方用 read-excel-file 处理） ----

export function parseScheduleFile(filename, text) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    throw new Error("Excel 文件请使用「从文件导入」的表格解析方式。");
  }
  if (lower.endsWith(".ics") || lower.endsWith(".ical")) return parseScheduleIcs(text);
  if (lower.endsWith(".csv")) return parseScheduleCsv(text);
  if (/\bBEGIN:VCALENDAR\b/i.test(text)) return parseScheduleIcs(text);
  if (/[，,]/.test(text || "")) return parseScheduleCsv(text);
  throw new Error("无法识别课表文件格式，请选择 .xlsx、.ics 或 .csv 文件。");
}
