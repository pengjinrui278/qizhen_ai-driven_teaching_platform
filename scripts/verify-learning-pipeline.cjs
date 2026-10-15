// 学习反馈验收：反馈页按 include_activities=true 取数，展示进展/时间线/占比/趋势/笔记产出，
// 并且不再出现「课程问答记录」逐轮列表。合成接口，不连数据库、不调模型。
// 运行：node scripts/verify-learning-pipeline.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.MIRROR_WEB_PREVIEW_URL || 'http://127.0.0.1:3011';
const day = offset => new Date(Date.now() - offset * 86400000).toISOString();

const COURSES = [
  {course_id: 'mathematical_analysis', display_name: '数学分析'},
  {course_id: 'linear_algebra_analytic_geometry', display_name: '高等代数与解析几何'},
  {course_id: 'university_physics', display_name: '大学物理'},
];

const activities = [
  {request_id: 'r1', attempt_id: 'a1', course_id: 'mathematical_analysis', question: '请解释一致收敛中量词顺序的区别',
   mode: 'chat', status: 'completed', summary: '数学分析 · 概念讨论', created_at: day(1)},
  {request_id: 'r2', attempt_id: 'a1', course_id: 'mathematical_analysis', question: '我卡住了，请给我一个方向提示',
   mode: 'first_hint', status: 'completed', summary: '数学分析 · 提示', created_at: day(3)},
  {request_id: 'r3', attempt_id: 'a2', course_id: 'university_physics', question: '刚体转动惯量怎么算',
   mode: 'chat', status: 'completed', summary: '大学物理 · 概念讨论', created_at: day(9)},
];

const observations = [
  {id: 'o1', course_id: 'mathematical_analysis', kind: 'still_stuck', theme: 'quantifiers', text: '量词顺序仍需提醒',
   source: 'self_report', strength: 'medium', created_at: day(3), disputed: false},
  {id: 'o2', course_id: 'mathematical_analysis', kind: 'independent_success', theme: 'conditions', text: '这次独立完成了条件检查',
   source: 'self_report', strength: 'medium', created_at: day(2), disputed: false},
  {id: 'o3', course_id: 'university_physics', kind: 'continued', theme: 'construction', text: '构造辅助量时卡住',
   source: 'self_report', strength: 'weak', created_at: day(8), disputed: true, correction: '其实是题目条件看错'},
];

const hypotheses = [
  {id: 'h1', course_id: 'mathematical_analysis', theme: 'quantifiers', status: 'improving',
   statement: '量词依赖关系的判断出现了相反证据', sufficiency: '证据有限',
   supporting: ['o2'], contradicting: ['o1']},
  {id: 'h2', course_id: 'university_physics', theme: 'construction', status: 'emerging',
   statement: '辅助量的选择方式尚在观察', sufficiency: '证据不足', supporting: ['o3'], contradicting: []},
];

const notes = [
  {id: 'n1', course_id: 'mathematical_analysis', folder_path: '第8章 反常积分', title: '第8章 反常积分·预习笔记',
   starred: true, source: 'agent', created_at: day(1), updated_at: day(1), has_content: true},
  {id: 'n2', course_id: 'university_physics', folder_path: '', title: '刚体转动惯量小结',
   starred: false, source: 'student', created_at: day(20), updated_at: day(20), has_content: true},
];

(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1200}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const memoryCalls = [];

    await page.route('**/api/v2/**', route => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/v2', '');
      if (path === '/me') return route.fulfill({json: {id: 'u', role: 'student', status: 'active'}});
      if (path === '/config') return route.fulfill({json: {}});
      if (path === '/courses') return route.fulfill({json: COURSES});
      if (path === '/notes') return route.fulfill({json: {items: notes, total: notes.length}});
      if (path === '/memory') {
        memoryCalls.push(url.search);
        const withActivities = url.searchParams.get('include_activities') === 'true';
        return route.fulfill({json: {observations, hypotheses,
          ...(withActivities ? {activities} : {})}});
      }
      return route.fulfill({json: []});
    });

    await page.goto(BASE + '/student');
    await page.getByRole('heading', {name: '我的课表'}).waitFor({timeout: 20000});
    await page.getByRole('link', {name: '课程学习'}).click();
    await page.waitForTimeout(500);
    assert.ok(memoryCalls.some(q => q.includes('include_activities=false')), '其它页面应继续使用精简查询');

    // 切到「学习反馈」：应改用带活动的查询
    await page.getByRole('link', {name: '学习反馈'}).click();
    await page.getByRole('heading', {name: '学习档案与诊断'}).waitFor({timeout: 15000});
    await page.waitForTimeout(800);
    assert.ok(memoryCalls.some(q => q.includes('include_activities=true')), '反馈页必须请求 include_activities=true');

    // 1. 用户明确要求：不再记录课程回答记录
    assert.equal(await page.getByRole('heading', {name: '课程问答记录'}).count(), 0, '不该再有「课程问答记录」面板');
    assert.equal(await page.locator('.lf-course-activity').count(), 0, '逐轮问答列表的 DOM 也不该存在');
    assert.equal(await page.getByText('请解释一致收敛中量词顺序的区别').count(), 0,
      '提问原文不该再出现在反馈页');

    // 2. 新面板齐备
    for (const name of ['最近进展', '各科目学习占比', '活动趋势（近 8 周）', '笔记产出', '学习时间线', '持续学习观察']) {
      assert.equal(await page.getByRole('heading', {name}).count(), 1, `应有面板：${name}`);
    }

    // 3. 最近进展只讲证据变化，并明说不算能力
    const progress = page.locator('.lf-panel').filter({has: page.getByRole('heading', {name: '最近进展'})});
    assert.match(await progress.innerText(), /不是能力评分/, '必须写明不是能力评分');
    assert.match(await progress.innerText(), /出现相反证据/, '应列出状态变化的观察');
    assert.match(await progress.innerText(), /观察被更正/, '应列出被更正的观察');

    // 4. 科目占比：堆叠条 + 图例（颜色不是唯一编码）
    const share = page.locator('.lf-panel').filter({has: page.getByRole('heading', {name: '各科目学习占比'})});
    assert.ok(await share.locator('.lcStack .lcSeg').count() >= 2, '应画出堆叠条分段');
    assert.match(await share.innerText(), /数学分析/, '图例要带科目名');
    assert.match(await share.innerText(), /大学物理/);
    assert.match(await share.innerText(), /%/, '要给出百分比数字');

    // 5. 活动趋势：两张小倍数柱图共用刻度，绝无双 Y 轴
    const trend = page.locator('.lf-panel').filter({has: page.getByRole('heading', {name: '活动趋势（近 8 周）'})});
    assert.equal(await trend.locator('figure.lcTrendFigure').count(), 2, '对话轮次与笔记产出各一张');
    // 柱子必须落在正确的周上：位置反推周序号逐个比对，画歪一格就是错的数据主张
    const barWeeks = await trend.evaluate(node => {
      const PAD_L = 30;
      return [...node.querySelectorAll('.lcTrendFigure')].map(figure => {
        const svg = figure.querySelector('svg');
        const step = (svg.viewBox.baseVal.width - PAD_L - 12) / 8;
        return [...svg.querySelectorAll('rect')].filter(r => r.getAttribute('fill') !== 'transparent')
          .map(r => Math.round((+r.getAttribute('x') + +r.getAttribute('width') / 2 - PAD_L - step / 2) / step));
      });
    });
    // 一根柱子 = 一周的合计，所以只比周序号。对话：3 天前/1 天前→第 7 周，9 天前→第 6 周；
    // 笔记：1 天前→第 7 周，20 天前→第 5 周。
    assert.deepEqual(barWeeks[0].sort((a, b) => a - b), [6, 7], '对话柱子应落在第 6、7 周');
    assert.deepEqual(barWeeks[1].sort((a, b) => a - b), [5, 7], '笔记柱子应落在第 5、7 周');

    // 6. 每张图都有数据表（值不能只靠颜色或悬浮读到）
    assert.ok(await trend.locator('.lcTable table').count() === 1, '趋势图要有数据表');
    assert.ok(await share.locator('.lcTable table').count() === 1, '占比图要有数据表');
    await trend.locator('.lcTable summary').click();   // 收起时内容不在 innerText 里
    assert.match(await trend.locator('.lcTable').innerText(), /对话轮次/, '数据表要有列头');
    assert.match(await trend.locator('.lcTable').innerText(), /笔记产出/);

    // 7. 笔记产出：数字来自 /notes
    const notePanel = page.locator('.lf-panel').filter({has: page.getByRole('heading', {name: '笔记产出'})});
    // 默认近 14 天：n2 建于 20 天前，应被时间筛选排除
    assert.match((await notePanel.locator('.lf-kpis li').allInnerTexts()).join(' '), /笔记总数\s*1/,
      '近 14 天只应计入 1 份笔记');
    assert.match(await notePanel.innerText(), /第8章 反常积分·预习笔记/, '应列出最近笔记');
    assert.match((await notePanel.locator('.lf-kpis li').allInnerTexts()).join(' '), /标记为重要\s*1/,
      '星标数应来自笔记数据');

    // 8. 学习时间线：对话与笔记合并
    const timeline = page.locator('.lf-panel').filter({has: page.getByRole('heading', {name: '学习时间线'})});
    assert.ok(await timeline.locator('.lf-timeline > li').count() >= 1, '应有按天分组');
    assert.ok(await timeline.locator('li[data-type="note"]').count() >= 1, '时间线要含笔记');
    assert.ok(await timeline.locator('li[data-type="chat"]').count() >= 1, '时间线要含对话');

    // 9. 时间筛选要真的作用于笔记
    await page.getByLabel('反馈时间').selectOption('all');
    await page.waitForTimeout(400);
    assert.match((await notePanel.locator('.lf-kpis li').allInnerTexts()).join(' '), /笔记总数\s*2/,
      '切到全部时间后应计入 2 份笔记');

    await page.screenshot({path: 'data/preview/learning-feedback.png', fullPage: true});
    // 注：未覆盖 ?mode=demo —— 本仓库里没有任何入口链接到演示模式，
    // 且直接访问时 Portal 的 demo 判定不生效、会走真实 API（3011 上同样如此，非本次改动引入）。
    assert.deepEqual(errors, [], '不应有页面错误');
    console.log('PASS: 反馈页 include_activities=true 取数；已删课程问答记录；进展/时间线/科目占比/趋势/笔记产出齐备且带数据表');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
