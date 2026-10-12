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
      // 旧会话：本地没有链路记录，只能靠服务端标题里的【引用追问】识别（跨浏览器/早期会话）
      'legacy-followup': {
        id: 'legacy-followup', course_id: 'mathematical_analysis', title: '【引用追问】旧的追问：一致连续',
        created_at: new Date(Date.now() - 3600e3).toISOString(), problem: {text: '（旧追问）'}, events: [],
      },
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
    const orderNow = async () => page.locator('.chatPane').evaluateAll(els => els.map(e => e.querySelector('.chatPaneTitle')?.textContent));
    // 编号按位置派生后，标题序列恒为 1..N，判断真实顺序要用面板 id
    const orderIds = async () => page.locator('.chatPane').evaluateAll(els => els.map(e => e.dataset.paneId));

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

    // ---- 2b. 自由框选：拖选几个字（公式仍整块，文字到字） ----
    const paraBox = await para.boundingBox();
    await page.mouse.move(paraBox.x + 16, paraBox.y + paraBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(paraBox.x + 96, paraBox.y + paraBox.height / 2, {steps: 6});
    await page.mouse.up();
    await page.waitForTimeout(150);
    await page.locator('.quoteHud').getByText(/已选 3 \/ \d+ 处/).waitFor();
    const partialCard = page.locator('.quoteTray .quoteCard').last().locator('.quoteCardBody');
    const partialText = (await partialCard.innerText()).trim();
    assert.ok(partialText.length >= 2 && partialText.length < 40, '拖选应只取到一小段文字，实际 " ' + partialText + ' "');
    assert.ok('先看定义：数列收敛要求对任意'.includes(partialText.slice(0, 4)), '拖选内容应来自该段落：' + partialText);

    // ---- 3. Esc 退出剪刀模式 ----
    await page.keyboard.press('Escape');
    assert.equal(await scissors.getAttribute('aria-pressed'), 'false');

    // ---- 4. 拼接成子页面（Esc 后走输入框上方的引用托盘） ----
    await page.locator('.quoteTray').getByRole('button', {name: '拼接成子页面'}).click();
    const pane = page.locator('.chatPane[data-pane-index="1"]');
    await pane.waitFor();
    assert.equal(await pane.locator('.quoteCard').count(), 3, '三张引用卡片（两整块 + 一段自由框选）');
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
    const child = page.locator('.chatHistoryRow[data-depth="1"]').first();
    await child.waitFor();
    assert.match(await child.textContent(), /追问/);
    assert.match(await child.textContent(), /为什么 N 不能依赖 n/);
    assert.equal(await page.locator('.chatHistoryBadge').count() >= 1, true, '追问行应带徽标');
    // 没有本地链路的旧追问也要被认出来：按标题标记显示徽标，而不是混成普通会话
    const legacy = page.locator('.chatHistoryRow[data-depth="0"]', {hasText: '旧的追问'}).first();
    assert.equal(await legacy.locator('.chatHistoryBadge').count(), 1, '仅凭标题标记也应识别为追问');

    // ---- 6. 子页面内再剪 → 子页面 2（嵌套）；顺便验证计数按面板隔离 ----
    await pane.getByRole('button', {name: /^剪刀/}).click();
    const subPara = pane.locator('[data-quote-src$=":ai"] p[data-quote-unit="text"]').first();
    await subPara.click({position: {x: 8, y: 8}});
    await pane.locator('.quoteHud').getByText(/已选 1 \/ \d+ 处/).waitFor();
    assert.equal(await pane.locator('.quoteToolCount').innerText(), '1', '子页面工具条应显示本页计数');
    assert.equal(await page.locator('.chatWorkspace .quoteToolCount').count(), 0, '主面板不应显示子页面的已选数');
    await pane.locator('.quoteHud').getByRole('button', {name: '拼接成子页面'}).click();
    const pane2 = page.locator('.chatPane[data-pane-index="2"]');
    await pane2.waitFor();
    assert.equal(await pane2.locator('.chatPaneTitle').textContent(), '子页面 2', '编号应等于位置');
    assert.deepEqual(await orderNow(), ['子页面 1', '子页面 2'], '主页面之后的编号应连续：' + (await orderNow()).join(','));
    await page.screenshot({path: 'data/preview/quote-nested-desktop.png', fullPage: true});

    // ---- 7. M2：第三个面板自动收纳为抽页 ----
    const mainScissors = page.locator('.chatWorkspace').getByRole('button', {name: /^剪刀/});
    await mainScissors.click();
    await page.locator('.chatWorkspace [data-quote-src$=":ai"] li[data-quote-unit="text"]').first().click();
    await page.locator('.chatWorkspace .quoteHud').getByRole('button', {name: '拼接成子页面'}).click();
    await page.locator('.chatPane[data-pane-index="3"]').waitFor();
    await page.waitForTimeout(400);
    const tabs = page.locator('.chatPane[data-state="tab"]');
    assert.ok(await tabs.count() >= 1, '放不下的面板应自动收纳为抽页，实际 ' + await tabs.count());
    await page.screenshot({path: 'data/preview/quote-drawer-desktop.png', fullPage: true});

    // ---- 8. 点击抽页标签 → 抽出定格 ----
    const tabThree = page.locator('.chatPane[data-pane-index="3"]');
    if (await tabThree.getAttribute('data-state') === 'tab') {
      const tabWidth = await tabThree.evaluate(e => e.getBoundingClientRect().width);
      assert.ok(tabWidth < 80, '抽页应收成窄条（实际 ' + tabWidth + 'px）');
      await tabThree.locator('.paneTabOpen').click();
      await page.waitForTimeout(300);
      assert.equal(await tabThree.getAttribute('data-state'), 'open', '点击抽页应抽出');
    }

    // ---- 8b. 手动折叠键：按意愿收起，再点页边展开；顺序始终按编号 ----
    const indexOrder = async () => page.locator('.chatPane').evaluateAll(els => els.map(e => Number(e.dataset.paneIndex)));
    assert.deepEqual(await indexOrder(), [1, 2, 3], '折叠页边与展开页面应统一按编号排列');
    const openPane = page.locator('.chatPane[data-state="open"]').first();
    const openIndex = await openPane.getAttribute('data-pane-index');
    await openPane.locator('.chatPaneCollapse').click();
    await page.waitForTimeout(320);
    assert.equal(await page.locator(`.chatPane[data-pane-index="${openIndex}"]`).getAttribute('data-state'), 'tab', '手动收起应立即收成页边');
    assert.deepEqual(await indexOrder(), [1, 2, 3], '收起后仍按编号排列');
    await page.locator(`.chatPane[data-pane-index="${openIndex}"] .paneTabOpen`).click();
    await page.waitForTimeout(320);
    assert.equal(await page.locator(`.chatPane[data-pane-index="${openIndex}"]`).getAttribute('data-state'), 'open', '点击页边应重新展开');

    // ---- 9. Alt+方向键换位（同父级相邻兄弟） ----
    const before = await orderIds();
    await page.locator('.chatPane[data-pane-index="3"] .paneGrip').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await page.waitForTimeout(200);
    const after = await orderIds();
    // 子页面 3 与它的前一个同父兄弟（子页面 1）交换；子页面 2 是子页面 1 的孩子，跟着走
    assert.deepEqual(after, [before[2], before[0], before[1]], '换位结果应为：' + before.join(',') + ' → ' + after.join(','));
    assert.deepEqual(await orderNow(), ['子页面 1', '子页面 2', '子页面 3'], '编号应随位置重排');

    // ---- 9b. 关掉抽页标签，给分隔条留出可分配余量 ----
    page.on('dialog', dialog => dialog.accept());
    for (let guard = 0; guard < 6 && await page.locator('.paneTabClose:visible').count(); guard += 1) {
      await page.locator('.paneTabClose:visible').first().click();
      await page.waitForTimeout(120);
    }
    assert.equal(await page.locator('.chatPane[data-state="open"]').count(), 1, '应只剩一个展开的子页面');

    // ---- 10. 分隔条拖动缩放 ----
    const resizer = page.locator('.paneResizer').first();
    const neighbor = page.locator('.chatPane[data-state="open"]').first();
    const rb = await resizer.boundingBox();
    const widthBefore = await page.locator('.chatWorkspace').evaluate(el => el.getBoundingClientRect().width);
    const nbBefore = await neighbor.evaluate(el => el.getBoundingClientRect().width);
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await page.mouse.down();
    await page.mouse.move(rb.x + rb.width / 2 + 140, rb.y + rb.height / 2, {steps: 8});
    await page.mouse.up();
    await page.waitForTimeout(200);
    const widthAfter = await page.locator('.chatWorkspace').evaluate(el => el.getBoundingClientRect().width);
    const nbAfter = await neighbor.evaluate(el => el.getBoundingClientRect().width);
    assert.ok(widthAfter > widthBefore + 25, '拖动分隔条应加宽主面板：' + widthBefore + ' → ' + widthAfter);
    assert.ok(nbAfter < nbBefore - 25, '相邻面板应等量变窄：' + nbBefore + ' → ' + nbAfter);

    // ---- 11. 刷新后宽度、顺序与收纳态恢复 ----
    const stateBefore = await page.locator('.chatPane').evaluateAll(els => els.map(e => e.dataset.state));
    const orderBeforeReload = await orderIds();
    await page.reload();
    // 主面板的就绪标志（同一句话也可能出现在引用卡片里，必须限定在主面板内）
    await page.locator('.chatWorkspace').getByText('量词顺序不能交换').first().waitFor({timeout: 20000});
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.chatPane').count(), stateBefore.length, '刷新后应恢复全部子页面');
    assert.deepEqual(await page.locator('.chatPane').evaluateAll(els => els.map(e => e.dataset.state)), stateBefore, '刷新后应收纳态一致');
    assert.deepEqual(await orderIds(), orderBeforeReload, '刷新后应保持顺序');

    // ---- 12. 关闭全部 → 主页面恢复全宽（关闭父页面会连带子页面，需确认） ----
    page.on('dialog', dialog => dialog.accept());
    const closeButtons = page.locator('.chatPane .chatPaneClose:visible, .chatPane .paneTabClose:visible');
    for (let guard = 0; guard < 8 && await closeButtons.count(); guard += 1) {
      await closeButtons.first().click();
      await page.waitForTimeout(100);
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
    console.log('PASS: 剪刀选块/公式、自由框选到字、每页独立计数、位置化编号、Esc 退出、拼接子页面、引用卡片渲染、子页面提问序列化、嵌套子页面、自动抽页收纳、抽页抽出、Alt+方向键换位、分隔条缩放、刷新恢复、关闭恢复、390px 无溢出');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
