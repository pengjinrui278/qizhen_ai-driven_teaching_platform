// 笔记偏好的两个入口验收：窄边上的「按教材章生成」（完整偏好面板：来源 + 存放位置）
// 与「整理我的笔记」。这两件事在别处没有入口——删掉引导芯片之后，
// 模态偏好面板与整理对话框一度完全不可达（只有关闭、没有打开）。
// 合成接口，不连数据库、不调模型。运行：node scripts/verify-note-panel.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.MIRROR_WEB_PREVIEW_URL || 'http://127.0.0.1:3011';
const COURSE = {course_id: 'mathematical_analysis', display_name: '数学分析',
                profile_id: 'chen-jixiu-3e', available: true};

(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const sent = [];
    const calls = {prompt: 0, textbooks: 0, chapters: 0};
    const session = {id: 'fixture-attempt', course_id: COURSE.course_id,
                     problem: {text: '一致收敛是什么'}, events: []};

    await page.route('**/api/v2/**', route => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace('/api/v2', '');
      const method = request.method();
      const json = body => route.fulfill({json: body});
      if (path === '/me') return json({id: 'fixture', nickname: '验收', role: 'student', status: 'active'});
      if (path === '/config') return json({});
      if (path === '/courses') return json([COURSE]);
      if (path === '/memory') return json({observations: [], hypotheses: []});
      if (path === '/notes/preferences') return json({
        version: 1, groups: [{id: 'structure', label: '笔记结构', hint: '', clearable: true,
                              options: [{id: 'outline', label: '提纲式', hint: '', prompt: '用提纲式组织。'}]}],
        source_kinds: [{id: 'chapter', label: '教材章节', hint: ''},
                       {id: 'chat', label: '刚才的回答', hint: ''}],
        formats: [{id: 'markdown', label: 'Markdown'}],
        limits: {free_text: 1200, prompt: 5200}, defaults: {folders: ['第8章 反常积分']}});
      if (path === '/textbooks') { calls.textbooks += 1; return json([
        {source_id: 'book-1', title: '数学分析（下册）', volume: '下册', course_id: COURSE.course_id}]); }
      if (path === '/textbooks/book-1/chapters') { calls.chapters += 1; return json([
        {chapter: '第8章 反常积分', order: 1}]); }
      if (path === '/notes/prompt' && method === 'POST') {
        calls.prompt += 1;
        const body = request.postDataJSON();
        assert.equal(body.source.kind, 'chapter', '要带上教材章节这个来源');
        assert.equal(body.source.source_id, 'book-1');
        assert.equal(body.source.chapter, '第8章 反常积分');
        assert.equal(body.dest.folder_path, '第8章 反常积分', '存放位置要跟着走');
        return json({prompt: '请为《数学分析》生成一份预习笔记。\n\n【依据】教材《数学分析（下册）》「第8章 反常积分」整章内容。',
                     marker: '[[MIRROR-NOTE1 ' + Buffer.from(JSON.stringify({
                       v: 1, mode: 'generate',
                       src: {k: 'chapter', sid: 'book-1', ch: '第8章 反常积分'},
                       d: {f: body.dest.folder_path}})).toString('base64url') + ']]',
                     preview_sections: [{label: '笔记结构', text: '用提纲式组织。'}], warnings: []});
      }
      if (path === '/notes' && method === 'GET') return json({items: [], total: 0});
      if (path === '/attempts') return json(method === 'POST' ? session : []);
      if (path === '/attempts/' + session.id) return json(session);
      if (path.endsWith('/messages/stream')) {
        const body = request.postDataJSON();
        sent.push(body.message);
        const response = {answer: '好的。', citations: [], hint_level: 1, decision: {}};
        session.events = [...session.events, {request_id: body.request_id, message: body.message, response}];
        return route.fulfill({status: 200, contentType: 'text/event-stream',
          body: 'event: done\ndata: ' + JSON.stringify(response) + '\n\n'});
      }
      return json([]);
    });

    await page.goto(BASE + '/student/learn?attempt=' + session.id, {waitUntil: 'domcontentloaded'});
    await page.locator('.noteModeToggle').waitFor({timeout: 20000});
    await page.locator('.noteModeToggle').click();
    await page.waitForTimeout(400);

    // 1. 两件事都要有真入口，且在笔记模式下就看得见（不用先拖文件才会冒出来）
    const bar = page.locator('.noteEdgeBar');
    await bar.waitFor({timeout: 5000});
    const labels = await bar.getByRole('button').allInnerTexts();
    assert.ok(labels.some(t => /按教材章生成/.test(t)), `窄边上要有「按教材章生成」，实际 ${labels}`);
    assert.ok(labels.some(t => /整理我的笔记/.test(t)), `窄边上要有「整理我的笔记」，实际 ${labels}`);

    // 2. 按教材章生成 → 完整偏好面板：来源（教材章节）与存放位置都在这
    await page.getByRole('button', {name: /按教材章生成/}).click();
    const panel = page.locator('.npPanel');
    await panel.waitFor({timeout: 5000});
    assert.equal(await panel.getByText('笔记的来源').count(), 1, '面板要有「笔记的来源」');
    assert.equal(await panel.getByText('存在哪里').count(), 1, '面板要有「存在哪里」');

    // 3. 选来源 → 教材与章节下拉真的从后端取
    await panel.getByRole('button', {name: '教材章节'}).click();
    await page.waitForTimeout(500);
    assert.ok(calls.textbooks >= 1, '要拉教材列表');
    assert.ok(calls.chapters >= 1, '选了教材要拉章节列表');
    const chapterOptions = await panel.locator('select[aria-label="选择章节"] option').allInnerTexts();
    assert.ok(chapterOptions.includes('第8章 反常积分'), `章节要列出来，实际 ${chapterOptions}`);
    await panel.locator('select[aria-label="选择章节"]').selectOption('第8章 反常积分');

    // 4. 生成提示词 → 进输入框（不自动发送）
    await panel.getByRole('button', {name: /生成提示词/}).click();
    await page.waitForTimeout(600);
    assert.equal(calls.prompt, 1, '要调一次 /notes/prompt');
    assert.equal(await panel.count(), 0, '生成之后面板要收起');
    const draft = await page.locator('.formulaMessageInput').innerText();
    assert.match(draft, /第8章 反常积分/, '提示词要进输入框');
    assert.ok(!draft.includes('MIRROR-NOTE1'), '标记不能露在输入框里');
    assert.ok(await page.getByRole('button', {name: '发送'}).isEnabled(), '用户自己按发送');

    // 5. 发送 → 带 generate 标记，来源与存放位置都在标记里
    await page.getByRole('button', {name: '发送'}).click();
    await page.waitForTimeout(700);
    const wire = sent[sent.length - 1] || '';
    const match = /\[\[MIRROR-NOTE1 ([A-Za-z0-9_-]+)\]\]/.exec(wire);
    assert.ok(match, '发送时要带上标记');
    const payload = JSON.parse(Buffer.from(
      match[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    assert.equal(payload.mode, 'generate');
    assert.equal(payload.src.sid, 'book-1', '教材来源要带给服务端');
    assert.equal(payload.src.ch, '第8章 反常积分', '章节要带给服务端');
    assert.equal(payload.d.f, '第8章 反常积分', '存放目录要带给服务端');

    // 6. 整理我的笔记 → 确定性方案（勾选 + 目标目录），不让模型猜
    await page.getByRole('button', {name: /整理我的笔记/}).click();
    await page.waitForTimeout(600);
    assert.equal(await page.getByRole('dialog').count() >= 1, true, '整理对话框要打开');
    await page.screenshot({path: 'data/preview/note-panel-entry.png', fullPage: true});
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: /取消|关闭/}).first().click().catch(() => {});
    await page.waitForTimeout(300);

    assert.deepEqual(errors, [], '不应有页面错误');
    console.log('PASS: 窄边上「按教材章生成」与「整理我的笔记」都有真入口；'
      + '完整偏好面板能选教材章节来源与存放位置；提示词入框不自动发送；'
      + '发送时来源与目录随 generate 标记带出；整理走确定性对话框');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
