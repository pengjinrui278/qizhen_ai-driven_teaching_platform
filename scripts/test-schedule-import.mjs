import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseScheduleCsv,
  parseScheduleXlsx,
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
  assert.throws(() => parseScheduleCsv('课程名称,星期,节次\n,1,1-2'), /未能解析出课表项/);
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

test('XLSX：二维表（含表头）解析出课程', () => {
  const rows = [
    ['课程名称', '教师', '星期', '节次', '周次', '地点'],
    ['数学分析', '张三', 1, '1-2', '1-16', '紫金港东1-101'],
    ['高等代数', '李四', '三', '3-4', '1-8', '紫金港东2-202'],
  ];
  const snap = parseScheduleXlsx(rows);
  assert.equal(snap.source, 'zju-file-import');
  assert.equal(snap.courses.length, 2);
  assert.equal(snap.courses[0].course_name, '数学分析');
  assert.deepEqual(snap.courses[0].periods, [1, 2]);
  assert.equal(snap.courses[1].day_of_week, 3);
  assert.equal(snap.courses[1].first_half, true);
});

test('XLSX：「上课时间」合并列（周一第1-2节）', () => {
  const rows = [
    ['课程名称', '上课时间', '教师', '周次', '地点'],
    ['数学分析', '周一第1-2节', '张三', '1-16', '紫金港东1-101'],
    ['常微分方程', '周三第3-4节', '李四', '9-16', '紫金港东2-202'],
  ];
  const snap = parseScheduleXlsx(rows);
  assert.equal(snap.courses.length, 2);
  assert.equal(snap.courses[0].day_of_week, 1);
  assert.deepEqual(snap.courses[0].periods, [1, 2]);
  assert.equal(snap.courses[1].day_of_week, 3);
  assert.deepEqual(snap.courses[1].periods, [3, 4]);
  assert.equal(snap.courses[1].second_half, true);
});

test('XLSX：缺少「课程名称」列时报错', () => {
  assert.throws(() => parseScheduleXlsx([['教师', '星期', '节次'], ['张三', 1, '1-2']]), /课程名称/);
});

test('XLSX：真实浙大导出（标题行 + 上课时间多时段 + 逗号节次）', () => {
  const rows = [
    ['2026-2027学年秋冬学期吴芷曦的课表', null, null, null, null, null, null, null],
    ['课程代码', '课程名称', '教师姓名', '学期', '上课时间', '上课地点', '选课时间', '选课志愿'],
    ['MATH2131F', '复变函数与积分变换', '孙业顺', '秋', '周二第3,4节;周四第1,2节', '紫金港西2-205;紫金港西2-205', '2026-06-05 09:24:24', 1],
    ['MATH2432F', '概率论与数理统计', '吴国桢', '秋冬', '周三第3,4,5节', '紫金港西2-102', '2026-09-11 09:21:44', 1],
  ];
  const snap = parseScheduleXlsx(rows);
  assert.equal(snap.academic_year_start, 2026);
  assert.equal(snap.season, '');
  assert.equal(snap.courses.length, 3);
  const a = snap.courses[0];
  assert.equal(a.course_name, '复变函数与积分变换');
  assert.equal(a.course_id, 'MATH2131F');
  assert.equal(a.teacher, '孙业顺');
  assert.equal(a.day_of_week, 2);
  assert.deepEqual(a.periods, [3, 4]);
  assert.equal(a.first_half, true);
  assert.equal(a.second_half, false);
  const b = snap.courses[1];
  assert.equal(b.day_of_week, 4);
  assert.deepEqual(b.periods, [1, 2]);
  assert.equal(b.location, '紫金港西2-205');
  const c = snap.courses[2];
  assert.equal(c.course_name, '概率论与数理统计');
  assert.equal(c.day_of_week, 3);
  assert.deepEqual(c.periods, [3, 4, 5]);
  assert.equal(c.first_half, true);
  assert.equal(c.second_half, true);
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
