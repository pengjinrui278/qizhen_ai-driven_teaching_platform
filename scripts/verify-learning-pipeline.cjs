// 课程学习 → 学习反馈 管线验收：反馈页要按 include_activities=true 取数，并把每一轮课程问答渲染出来
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.MIRROR_WEB_PREVIEW_URL || 'http://127.0.0.1:3011';

(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const memoryCalls = [];
    const activities = [
      {request_id: 'r1', attempt_id: 'a1', course_id: 'mathematical_analysis', question: '请解释一致收敛中量词顺序的区别', mode: 'chat', status: 'completed', created_at: new Date().toISOString()},
      {request_id: 'r2', attempt_id: 'a1', course_id: 'mathematical_analysis', question: '我卡住了，请给我一个方向提示', mode: 'first_hint', status: 'completed', created_at: new Date(Date.now() - 3600e3).toISOString()},
    ];
    await page.route('**/api/v2/**', route => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/v2', '');
      if (path === '/me') return route.fulfill({json: {id: 'u', role: 'student', status: 'active'}});
      if (path === '/config') return route.fulfill({json: {}});
      if (path === '/courses') return route.fulfill({json: [{course_id: 'mathematical_analysis', display_name: '数学分析'}]});
      if (path === '/memory') {
        memoryCalls.push(url.search);
        const withActivities = url.searchParams.get('include_activities') === 'true';
        return route.fulfill({json: {observations: [], hypotheses: [], ...(withActivities ? {activities} : {})}});
      }
      return route.fulfill({json: []});
    });

    await page.goto(BASE + '/student');
    await page.getByRole('heading', {name: '我的课表'}).waitFor({timeout: 20000});
    await page.getByRole('link', {name: '课程学习'}).click();
    await page.waitForTimeout(500);
    assert.ok(memoryCalls.some(q => q.includes('include_activities=false')), '其它页面应继续使用精简查询');

    // 切到「学习反馈」：应改用带活动的查询，并渲染课程问答记录
    await page.getByRole('link', {name: '学习反馈'}).click();
    await page.getByRole('heading', {name: '学习档案与诊断'}).waitFor({timeout: 15000});
    await page.waitForTimeout(600);
    assert.ok(memoryCalls.some(q => q.includes('include_activities=true')), '反馈页必须请求 include_activities=true');

    await page.getByRole('heading', {name: '课程问答记录'}).waitFor();
    const items = page.locator('.lf-course-activity li');
    assert.equal(await items.count(), 2, '两轮课程问答都应出现在反馈页');
    assert.match(await items.first().innerText(), /一致收敛中量词顺序/);
    assert.match(await items.nth(1).innerText(), /我卡住了/);
    assert.match(await items.nth(1).innerText(), /我卡住了/);
    assert.match(await page.locator('.lf-panel').first().innerText() + await page.locator('.learningFeedback').innerText(), /数学分析/, '应标注课程');

    await page.screenshot({path: 'data/preview/learning-pipeline.png', fullPage: true});
    assert.deepEqual(errors, [], '不应有页面错误');
    console.log('PASS: 反馈页按 include_activities=true 取数并渲染课程问答记录（课程学习→学习反馈管线）');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
