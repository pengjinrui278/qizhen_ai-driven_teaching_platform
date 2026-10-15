import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseScheduleCsv,
  parseScheduleIcs,
  parseScheduleFile,
} from '../apps/web/src/lib/schedule-import.mjs';

test('CSV：中文表头解析出课程', () => {
  const csv = [
    '课程名称,教师,星期,节次,周次,地点',
    '数学分析,张三,1,1-2,1-16,紫金港东1-101',
    '高等代数,李四,三,3-4,1-8,紫金港东2-202',
  ].join('\n');
  const snap = parseScheduleCsv(csv);
  assert.equal(snap.source, 'zju-file-import');
  assert.equal(snap.courses.length, 2);
  const a = snap.courses[0];
  const b = snap.courses[1];
  assert.equal(a.course_name, '数学分析');
  assert.equal(a.teacher, '张三');
  assert.equal(a.day_of_week, 1);
  assert.deepEqual(a.periods, [1, 2]);
  assert.equal(a.week_pattern, 'all');
  assert.equal(a.location, '紫金港东1-101');
  assert.equal(b.day_of_week, 3);
  assert.deepEqual(b.periods, [3, 4]);
  assert.equal(b.first_half, true);
  assert.equal(b.second_half, false);
});

test('CSV：支持表头别名与单双周', () => {
  const csv = ['课程,老师,周几,节,周,教室', '物理,王五,5,5,1-16单,教三301'].join('\n');
  const snap = parseScheduleCsv(csv);
  assert.equal(snap.courses.length, 1);
  const c = snap.courses[0];
  assert.equal(c.course_name, '物理');
  assert.equal(c.day_of_week, 5);
  assert.deepEqual(c.periods, [5]);
  assert.equal(c.week_pattern, 'odd');
});

test('CSV：节次范围与中文数字星期', () => {
  const csv = ['课程名称,星期,节次', '拓扑,五,3-5', '常微分,日,7'].join('\n');
  const snap = parseScheduleCsv(csv);
  assert.equal(snap.courses.length, 2);
  assert.deepEqual(snap.courses[0].periods, [3, 4, 5]);
  assert.equal(snap.courses[0].day_of_week, 5);
  assert.equal(snap.courses[1].day_of_week, 7);
});

test('CSV：带引号的多个离散节次', () => {
  const csv = ['课程名称,星期,节次', '物理,1,"3,5"'].join('\n');
  const snap = parseScheduleCsv(csv);
  assert.deepEqual(snap.courses[0].periods, [3, 5]);
});

test('CSV：缺少课程名称列时报错', () => {
  assert.throws(() => parseScheduleCsv('教师,星期,节次\n张三,1,1-2'), /课程名称/);
});

test('CSV：没有任何可解析行时报错', () => {
  assert.throws(() => parseScheduleCsv('课程名称,星期,节次\n,1,1-2'), /未能从 CSV/);
});

test('ICS：从 VEVENT 解析出课程、星期与描述字段', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'SUMMARY:数学分析',
    'DTSTART:20260914T080000Z',
    'DTEND:20260914T094500Z',
    'LOCATION:紫金港东1-101',
    'DESCRIPTION:教师:张三\\n节次:第1-2节\\n周次:1-16周',
    'RRULE:FREQ=WEEKLY',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const snap = parseScheduleIcs(ics);
  assert.equal(snap.courses.length, 1);
  const c = snap.courses[0];
  assert.equal(c.course_name, '数学分析');
  assert.equal(c.day_of_week, 1); // 2026-09-14 是周一
  assert.deepEqual(c.periods, [1, 2]);
  assert.equal(c.teacher, '张三');
  assert.equal(c.location, '紫金港东1-101');
  assert.equal(c.week_pattern, 'all');
  assert.equal(snap.season, '1|秋');
});

test('ICS：无节次描述时按时间兜底', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:常微分方程',
    'DTSTART:20260915T095000Z',
    'DTEND:20260915T112500Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const snap = parseScheduleIcs(ics);
  assert.equal(snap.courses.length, 1);
  assert.equal(snap.courses[0].day_of_week, 2); // 2026-09-15 是周二
  assert.deepEqual(snap.courses[0].periods, [3, 4]);
});

test('parseScheduleFile：按扩展名分发', () => {
  const csv = '课程名称,星期,节次\n物理,1,3';
  const snap = parseScheduleFile('timetable.csv', csv);
  assert.equal(snap.courses[0].course_name, '物理');
  assert.deepEqual(snap.courses[0].periods, [3]);
});

test('parseScheduleFile：无扩展名时按内容识别 ICS', () => {
  const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:物理\nDTSTART:20260914T080000Z\nEND:VEVENT\nEND:VCALENDAR';
  const snap = parseScheduleFile('timetable', ics);
  assert.equal(snap.courses.length, 1);
  assert.equal(snap.courses[0].course_name, '物理');
});
