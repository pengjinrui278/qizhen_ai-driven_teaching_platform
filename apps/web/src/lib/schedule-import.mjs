// 课表文件导入解析（纯浏览器本地解析，不上传服务器，密码/账号不涉及）。
// 支持两种格式：
//   - CSV：表头含「课程名称、教师、星期、节次、周次、地点」等列，可缺省或使用别名。
//   - ICS：iCalendar VEVENT（浙大教务 / 学在浙大导出的 .ics 日历文件），尽量从描述里取节次/周次/教师。

const WEEKDAY_CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };

// 浙大本科常见节次起始时间（第 1–12 节），仅当 ICS 描述里没有「节次」时按时间兜底。
const PERIOD_STARTS = [
  [8, 0], [8, 50], [9, 50], [10, 40], [11, 30], [13, 15],
  [14, 5], [15, 5], [15, 55], [18, 30], [19, 20], [20, 10],
];

const CSV_HEADERS = {
  name: ["课程名称", "课程名", "课程", "名称", "name", "course", "title"],
  teacher: ["教师", "老师", "授课教师", "任课教师", "teacher"],
  day: ["星期", "星期几", "周几", "day", "weekday"],
  periods: ["节次", "节", "periods", "period"],
  weeks: ["周次", "周", "weeks", "week"],
  location: ["地点", "教室", "上课地点", "location", "room"],
};

function normalizeHeader(value) {
  return String(value == null ? "" : value).replace(/^﻿/, "").trim().toLowerCase();
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

function makeCourse({ name, teacher, location, day_of_week, periods, weeks, index }) {
  const w = parseWeeks(weeks);
  return {
    id: "file-" + index,
    source: "zju-undergraduate",
    course_id: null,
    course_name: name,
    teacher: teacher || "",
    location: location || null,
    day_of_week,
    periods,
    first_half: w.first_half,
    second_half: w.second_half,
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

  const headerCells = splitCsvLine(lines[0]);
  const col = {};
  headerCells.forEach((h, i) => {
    const key = normalizeHeader(h);
    for (const field of Object.keys(CSV_HEADERS)) {
      if (CSV_HEADERS[field].includes(key) && col[field] === undefined) col[field] = i;
    }
  });
  if (col.name === undefined) throw new Error("CSV 缺少「课程名称」列，请检查表头。");
  if (col.day === undefined || col.periods === undefined) {
    throw new Error("CSV 至少需要「课程名称」「星期」「节次」三列。");
  }

  const courses = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const name = (cells[col.name] || "").trim();
    if (!name) continue;
    const day_of_week = parseDay(cells[col.day]);
    const periods = parsePeriods(cells[col.periods]);
    if (!day_of_week || !periods.length) continue;
    courses.push(
      makeCourse({
        name,
        teacher: col.teacher !== undefined ? (cells[col.teacher] || "").trim() : "",
        location: col.location !== undefined ? (cells[col.location] || "").trim() : "",
        day_of_week,
        periods,
        weeks: col.weeks !== undefined ? cells[col.weeks] : "",
        index: courses.length,
      }),
    );
  }
  if (!courses.length) {
    throw new Error("未能从 CSV 中解析出课表项，请检查「星期」（1–7）和「节次」（如 1-2）的格式。");
  }
  return buildSnapshot(courses);
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
  const out = [];
  for (let i = first; i <= last; i++) out.push(i);
  return out;
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
        teacher: ev.teacher,
        location: ev.location,
        day_of_week: ev.day_of_week,
        periods: ev.periods,
        weeks: ev.weeks,
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

// ---- 分发 ----

export function parseScheduleFile(filename, text) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".ics") || lower.endsWith(".ical")) return parseScheduleIcs(text);
  if (lower.endsWith(".csv")) return parseScheduleCsv(text);
  if (/\bBEGIN:VCALENDAR\b/i.test(text)) return parseScheduleIcs(text);
  if (/[，,]/.test(text || "")) return parseScheduleCsv(text);
  throw new Error("无法识别课表文件格式，请选择 .ics 或 .csv 文件。");
}
