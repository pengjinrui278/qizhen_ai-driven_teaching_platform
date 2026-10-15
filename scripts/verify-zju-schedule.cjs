// 课表链路验收：本页 → 本地连接器（模拟）→ ready 握手 → 回传快照 → 周视图与 DDL
// 不触碰真实浙大接口，也不调用任何模型。
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.MIRROR_WEB_PREVIEW_URL || 'http://127.0.0.1:3011';

(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // 模拟本地连接器页面：加载即向 opener 报 ready，并暴露一个发送快照的入口。
    // 注意必须挂在 context 上：弹窗是独立页面，page 级 route 拦不到。
    await context.route('http://127.0.0.1:8765/**', route => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><body><p id="mock">本地连接器（模拟）</p><script>
        const origin = new URLSearchParams(location.search).get('return_origin');
        if (origin && window.opener) window.opener.postMessage({type:'learning-mirror-zju-ready'}, origin);
        window.__send = snap => window.opener.postMessage({type:'learning-mirror-zju-snapshot', payload: snap}, origin);
      </script></body></html>`,
    }));
    await context.route('**/api/v2/**', route => {
      const path = new URL(route.request().url()).pathname.replace('/api/v2', '');
      if (path === '/me') return route.fulfill({json: {id: 'u', role: 'student', status: 'active'}});
      if (path === '/config') return route.fulfill({json: {}});
      if (path === '/courses') return route.fulfill({json: [{course_id: 'mathematical_analysis', display_name: '数学分析'}]});
      return route.fulfill({json: []});
    });

    const snapshot = {
      schema_version: 1, source: 'zju-local-connector', academic_year_start: 2026, season: '1|秋',
      fetched_at: new Date().toISOString(),
      courses: [{id: 'c1', source: 'zju-undergraduate', course_id: 'MATH101', course_name: '数学分析', teacher: '陈老师', location: '紫金港东1-101', day_of_week: 1, periods: [1, 2], first_half: false, second_half: false, week_pattern: 'all', confirmed: false}],
      assignments: [{id: 'a1', source: 'zju-learning', source_id: 'x', title: '第 3 章习题', course_name: '数学分析', due_at: '2026-10-20T23:59:00+08:00'}],
    };

    await page.goto(BASE + '/student?mode=live');
    await page.getByRole('heading', {name: '我的课表'}).waitFor({timeout: 20000});
    assert.equal(await page.locator('.zjuScheduleEmpty').count(), 1, '未导入时应显示空状态');

    // 点击连接 → 出现"正在等待本地连接器"
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', {name: '在本机连接浙大'}).click();
    // 模拟连接器可能瞬间握手完成，等待态一闪而过：断言'等待或已连接'先出现即可
    await page.locator('.zjuWaiting, .zjuScheduleNotice').first().waitFor();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    // ready 握手后父页面应切换为"已连接，请登录并同步"
    await page.getByText(/本地连接器已打开/).waitFor({timeout: 8000});

    // 连接器回传快照 → 周视图与 DDL 渲染
    await popup.evaluate(snap => window.__send(snap), snapshot);
    await page.locator('.zjuWeekGrid').waitFor();
    assert.equal(await page.getByText('数学分析', {exact: false}).count() > 0, true, '课表应显示课程');
    assert.match(await page.locator('.zjuCourseSlip').first().innerText(), /陈老师/);
    assert.match(await page.locator('.zjuCourseSlip').first().innerText(), /紫金港东1-101/);
    assert.equal(await page.locator('.zjuDeadlines li').count(), 1, '近期的学在浙大 DDL 应被渲染');
    assert.match(await page.locator('.zjuDeadlines li').first().innerText(), /第 3 章习题/);

    // 刷新后仍在（localStorage）
    await page.reload();
    await page.locator('.zjuWeekGrid').waitFor({timeout: 20000});
    assert.equal(await page.locator('.zjuDeadlines li').count(), 1, '刷新后 DDL 仍在');

    // 清除
    await page.getByRole('button', {name: '清除本机课表'}).click();
    await page.locator('.zjuScheduleEmpty').waitFor();
    assert.ok(await page.evaluate(() => localStorage.getItem('learning-mirror.zju-schedule.v1') === null), '清除后本地不应保留');

    // 连接器未启动：12 秒超时给出可操作指引（用一条不响应 8765 的路由模拟）
    await context.unroute('http://127.0.0.1:8765/**');
    await context.route('http://127.0.0.1:8765/**', route => route.abort());
    const popup2Promise = page.waitForEvent('popup').catch(() => null);
    await page.getByRole('button', {name: '在本机连接浙大'}).click();
    await popup2Promise;
    await page.getByText(/没有检测到本地连接器/).waitFor({timeout: 20000});
    assert.equal(await page.getByRole('link', {name: /连接器说明/}).count(), 1, '应给出可操作的连接器说明入口');

    await page.screenshot({path: 'data/preview/zju-schedule.png', fullPage: true});
    assert.deepEqual(errors, [], '不应有页面错误');
    console.log('PASS: 空状态、等待态、ready 握手、快照回传、周视图、DDL、刷新保留、清除、未启动指引');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
