// 剪刀验收：框选 → 拼接 → 并排子页面 → 子页面内再剪（嵌套）→ 关闭恢复全宽 → 390px
// 全部走合成接口（拦截 /api/v2/**），不调用真实模型。
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.MIRROR_WEB_PREVIEW_URL || 'http://127.0.0.1:3011';

const MAIN_ANSWER = [
  '先看定义：数列收敛要求对任意 \\(\\varepsilon>0\\) 存在 \\(N\\)，当 \\(n>N\\) 时 \\(|a_n-a|<\\varepsilon\\)。',
  '',
  '\\[\\lim_{n\\to\\infty}a_n=0\\]',
  '',
  '- 第一条：量词顺序不能交换',
  '- 第二条：\\(N\\) 可以依赖 \\(\\varepsilon\\)',
].join('\n');

const SUB_ANSWER = [
  '这里的 \\(N\\) 依赖 \\(\\varepsilon\\)，但不依赖 \\(n\\)：',
  '',
  '\\[\\forall\\varepsilon>0\\ \\exists N\\ \\forall n>N\\]',
  '',
  '- 说明：先固定 \\(\\varepsilon\\)，再选 \\(N\\)。',
].join('\n');

(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const external = [];
    page.on('request', r => {
      if (/^https?:/.test(r.url()) && !r.url().startsWith(BASE + '/')) external.push(r.url());
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // ---- 合成接口 ----
    const stores = {
      'quote-session': {
        id: 'quote-session', course_id: 'mathematical_analysis', title: '一致收敛的讨论',
        created_at: new Date().toISOString(), problem: {text: '请解释数列收敛的定义。'}, events: [
          {request_id: 'r1', message: '请解释数列收敛的定义。', response: {answer: MAIN_ANSWER, decision: {hint_scale_version: 'course-hints-v1-three'}, citations: []}},
        ],
      },
    };
    let createdCount = 0;
    let lastCreate = null;
    let lastMessage = null;
    await page.route('**/api/v2/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/v2', '');
      const method = route.request().method();
      const json = value => route.fulfill({json: value});
      if (path === '/me') return json({id: 'quote-fixture', role: 'student', status: 'active', retention_days: 30});
      if (path === '/config') return json({environment: 'test', model: 'deepseek-flash'});
      if (path === '/courses') return json([{course_id: 'mathematical_analysis', display_name: '数学分析'}]);
      if (path === '/memory') return json({observations: [], hypotheses: []});
      if (path === '/sandboxes') return json([]);
      if (path === '/attempts' && method === 'GET') return json(Object.values(stores));
      if (path === '/attempts' && method === 'POST') {
        lastCreate = route.request().postDataJSON();
        createdCount += 1;
        const id = 'pane-session-' + createdCount;
        stores[id] = {id, course_id: 'mathematical_analysis', title: '【引用追问】为什么 N 不能依赖 n？', created_at: new Date().toISOString(), problem: {text: lastCreate.text}, events: []};
        return json(stores[id]);
      }
      const single = path.match(/^\/attempts\/([^/]+)$/);
      if (single && method === 'GET') return json(stores[decodeURIComponent(single[1])] || {});
      const stream = path.match(/^\/attempts\/([^/]+)\/messages\/stream$/);
      if (stream) {
        const aid = decodeURIComponent(stream[1]);
        lastMessage = route.request().postDataJSON();
        const store = stores[aid];
        if (!store) return route.fulfill({status: 404, json: {detail: '会话不存在'}});
        store.events.push({request_id: lastMessage.request_id, message: lastMessage.message, response: {answer: SUB_ANSWER, citations: []}});
        return route.fulfill({contentType: 'text/event-stream', body: 'event: progress\ndata: {"stage":"generating"}\n\nevent: done\ndata: ' + JSON.stringify({answer: SUB_ANSWER}) + '\n\n'});
      }
      if (/^\/attempts\/[^/]+\/messages$/.test(path)) {
        const aid = decodeURIComponent(path.split('/')[2]);
        lastMessage = route.request().postDataJSON();
        stores[aid]?.events.push({request_id: lastMessage.request_id, message: lastMessage.message, response: {answer: SUB_ANSWER, citations: []}});
        return json({ok: true});
      }
      return json([]);
    });

    await page.goto(BASE + '/student/learn?mode=live&attempt=quote-session');
    await page.getByText('量词顺序不能交换').waitFor({timeout: 20000});

    // ---- 1. 打开剪刀，块级标记生效 ----
    const scissors = page.getByRole('button', {name: /^剪刀/});
    await scissors.click();
    assert.equal(await scissors.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-quoting]').count(), 1, '主面板应进入剪刀模式');
    const para = page.locator('.chatWorkspace [data-quote-src$=":ai"] p[data-quote-unit="text"]').first();
    assert.ok(await para.count(), '段落应带引用标记');

    // ---- 2. 点选段落 + 公式，出现虚线框与计数 ----
    await para.click({position: {x: 8, y: 8}});
    const formula = page.locator('.chatWorkspace [data-quote-src$=":ai"] [data-quote-unit="mathBlock"]').first();
    await formula.click();
    await page.locator('.quoteHud').getByText(/已选 2 \/ \d+ 处/).waitFor();
    assert.equal(await para.evaluate(el => getComputedStyle(el).outlineStyle), 'dashed');
    assert.equal(await formula.evaluate(el => getComputedStyle(el).outlineStyle), 'dashed');

    // ---- 3. Esc 退出剪刀模式 ----
    await page.keyboard.press('Escape');
    assert.equal(await scissors.getAttribute('aria-pressed'), 'false');

    // ---- 4. 拼接成子页面（Esc 后走输入框上方的引用托盘） ----
    await page.locator('.quoteTray').getByRole('button', {name: '拼接成子页面'}).click();
    const pane = page.locator('.chatPane[data-pane-index="1"]');
    await pane.waitFor();
    assert.equal(await pane.locator('.quoteCard').count(), 2, '两张引用卡片');
    assert.ok(await pane.locator('.quoteCard .katex').count() > 0, '卡片内公式应渲染');
    const splitWidth = await page.locator('.chatWorkspace').evaluate(el => el.getBoundingClientRect().width);
    const panesWidth = await page.locator('.chatPanes').evaluate(el => el.getBoundingClientRect().width);
    assert.ok(splitWidth < panesWidth * 0.7, '主页面应收缩到并排宽度以内，实际 ' + splitWidth + '/' + panesWidth);
    await page.screenshot({path: 'data/preview/quote-splice-desktop.png', fullPage: true});

    // ---- 5. 子页面里针对性提问 ----
    const composer = pane.locator('[role="textbox"][aria-label="发送消息"]');
    await composer.fill('为什么 N 不能依赖 n？');
    await pane.getByRole('button', {name: '发送'}).click();
    await pane.getByText('先固定').waitFor({timeout: 15000});
    assert.ok(lastCreate, '应创建子会话');
    assert.match(lastCreate.text, /【引用追问】/);
    assert.match(lastCreate.text, /先看定义/);
    assert.match(lastCreate.text, /主页面 · 第 1 轮回答/);
    assert.match(lastCreate.text, /\\\[\\lim_/);
    assert.match(lastMessage.message, /为什么 N 不能依赖 n？/);

    // ---- 5b. 历史列表里追问归组到父会话下 ----
    const kids = page.locator('.chatHistoryKids').first();
    await kids.waitFor({timeout: 15000});
    assert.match(await kids.textContent(), /追问 1/);
    await kids.click();
    const child = page.locator('.chatHistoryChild').first();
    await child.waitFor();
    assert.match(await child.textContent(), /追问/);
    assert.match(await child.textContent(), /为什么 N 不能依赖 n/);

    // ---- 6. 子页面内再剪 → 子页面 2（嵌套） ----
    await pane.getByRole('button', {name: /^剪刀/}).click();
    const subPara = pane.locator('[data-quote-src$=":ai"] p[data-quote-unit="text"]').first();
    await subPara.click({position: {x: 8, y: 8}});
    await pane.locator('.quoteHud').getByRole('button', {name: '拼接成子页面'}).click();
    const pane2 = page.locator('.chatPane[data-pane-index="2"]');
    await pane2.waitFor();
    assert.equal(await pane2.locator('.chatPaneTitle').textContent(), '子页面 2');
    await page.screenshot({path: 'data/preview/quote-nested-desktop.png', fullPage: true});

    // ---- 7. 关闭全部 → 主页面恢复全宽（关闭父页面会连带子页面，需确认） ----
    page.on('dialog', dialog => dialog.accept());
    const closeButtons = page.locator('.chatPane .chatPaneClose');
    for (let guard = 0; guard < 6 && await closeButtons.count(); guard += 1) {
      await closeButtons.first().click();
      await page.waitForTimeout(80);
    }
    assert.equal(await page.locator('.chatPane').count(), 0, '子页面应全部关闭');
    const width = await page.locator('.chatWorkspace').evaluate(el => el.getBoundingClientRect().width);
    assert.ok(width > splitWidth * 1.8, '主页面应恢复全宽：' + splitWidth + ' → ' + width);
    assert.ok(await page.locator('[data-quote-src] [data-quote-unit]').count() > 0);

    // ---- 8. 390px 无横向溢出 ----
    await page.setViewportSize({width: 390, height: 844});
    await page.waitForTimeout(300);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390px 不应横向溢出');
    await page.screenshot({path: 'data/preview/quote-mobile.png', fullPage: true});

    assert.deepEqual(external, [], '不应有外部请求');
    assert.deepEqual(errors, [], '不应有页面错误');
    console.log('PASS: 剪刀选块/公式、计数与虚线框、Esc 退出、拼接子页面、引用卡片渲染、子页面提问序列化、嵌套子页面、关闭恢复、390px 无溢出');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
