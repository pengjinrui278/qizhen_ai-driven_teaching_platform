// 笔记模式验收：平时没有笔记入口 → 点「笔记」进入模式 → 选中回答 → 存为笔记
// → agent 整理好自动存库 → 对话里回一条可撤回的通知。
// 合成接口，不连数据库、不调模型。运行：node scripts/verify-note-agent.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.MIRROR_WEB_PREVIEW_URL || 'http://127.0.0.1:3011';
const COURSE = {course_id: 'mathematical_analysis', display_name: '数学分析', profile_id: 'chen-jixiu-3e', available: true};
const ANSWER = '一致收敛与逐点收敛的区别\n\n1. 一致收敛的 N 只依赖 ε。\n2. 逐点收敛的 N 还依赖 x。';

(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const session = {id: 'fixture-attempt', course_id: COURSE.course_id, problem: {text: '一致收敛是什么'}, events: []};
    const sent = [];
    const deleted = [];
    let answerCount = 0;
    const uploads = [];

    await page.route('**/api/v2/**', route => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace('/api/v2', '');
      const method = request.method();
      const json = body => route.fulfill({json: body});

      if (path === '/me') return json({id: 'fixture', nickname: '验收', role: 'student', status: 'active'});
      if (path === '/config') return json({});
      if (path === '/courses') return json([COURSE]);
      if (path === '/memory') return json({observations: [], hypotheses: []});
      if (path === '/textbooks') return json([]);
      if (path === '/notes' && method === 'GET') {
        const items = [
          {id: 'note-alpha', course_id: COURSE.course_id, folder_path: '第8章 反常积分', title: '第8章 反常积分·预习笔记',
           starred: true, remark: '', source: 'agent', source_meta: {}, deleted_at: null, deleted_from: '',
           has_content: true, kind: 'md', created_at: '2026-10-10T09:00:00Z', updated_at: '2026-10-11T09:00:00Z'},
          {id: 'note-beta', course_id: COURSE.course_id, folder_path: '', title: '随手记：极限的坑',
           starred: false, remark: '', source: 'student', source_meta: {}, deleted_at: null, deleted_from: '',
           has_content: true, kind: 'md', created_at: '2026-10-09T09:00:00Z', updated_at: '2026-10-09T09:00:00Z'},
        ];
        return json({items, total: items.length});
      }
      if (path.startsWith('/notes/') && method === 'DELETE') {
        deleted.push(decodeURIComponent(path.split('/')[2].split('?')[0]));
        return json({ok: true, purged: false});
      }
      if (path === '/notes/preferences') {
        return json({version: 1, groups: [
          {id: 'structure', label: '笔记结构', hint: '不选就按内容自动组织', clearable: true, options: [
            {id: 'outline', label: '提纲式', hint: '一级标题 + 要点列表', prompt: '用提纲式组织：一级标题下用要点列表，每点一句话，不写长段落。'},
            {id: 'qa', label: '问答式', hint: '先提问，再回答', prompt: '用问答式组织：每个知识点先写一个我会问的问题。'}]},
          {id: 'purpose', label: '用途', hint: '预习 / 复习 / 考前冲刺', clearable: true, options: [
            {id: 'preview', label: '预习', hint: '阅读路线', prompt: '这份笔记用于课前预习：先给阅读路线。'},
            {id: 'exam', label: '考前冲刺', hint: '压缩扫读', prompt: '这份笔记用于考前冲刺：优先给结论与易错点。'}]},
        ], source_kinds: [], formats: [], limits: {free_text: 1200, prompt: 5200}, defaults: {folders: []}});
      }
      if (path === '/uploads') {
        uploads.push(1);
        return json({id: 'up-' + uploads.length, filename: '第8章讲义.pdf', kind: 'pdf',
                     kind_label: 'PDF', size: 2048, chars: 120, readable: true});
      }
      if (path === '/attempts') return json(method === 'POST' ? session : []);
      if (path === '/attempts/' + session.id) return json(session);
      if (path.endsWith('/messages/stream')) {
        const body = request.postDataJSON();
        sent.push(body.message);
        answerCount += 1;
        // 第二轮的作答是「整理成笔记」的结果，服务端会自动落库并回传 note_saved
        const saving = body.message.includes('MIRROR-NOTE1') && body.message.includes('整理成一份笔记');
        const response = {
          answer: saving ? '# 一致收敛与逐点收敛\n\n（整理后的笔记正文）' : ANSWER,
          citations: [], hint_level: 1,
          decision: saving ? {note_saved: {id: 'saved-note-1', title: '一致收敛与逐点收敛 · 复习笔记',
                                          course_id: COURSE.course_id, folder_path: '第8章 反常积分'}} : {},
        };
        session.events = [...session.events,
          {request_id: body.request_id, message: body.message, response}];
        return route.fulfill({status: 200, contentType: 'text/event-stream',
          body: 'event: progress\ndata: {"stage":"checking"}\n\nevent: done\ndata: ' + JSON.stringify(response) + '\n\n'});
      }
      return json([]);
    });

    await page.goto(BASE + '/student/learn');
    await page.locator('.chatWelcome').waitFor({timeout: 20000});

    // 1. 平时完全看不到笔记相关的东西：没有引导芯片、没有存为笔记
    for (const label of ['按这章生成预习笔记', '把刚才的回答整理成复习笔记', '帮我找一份笔记', '整理我的笔记']) {
      assert.equal(await page.getByRole('button', {name: label}).count(), 0, `不该再有预设按键：${label}`);
    }
    assert.equal(await page.getByRole('button', {name: '存为笔记'}).count(), 0, '非笔记模式不该有存为笔记');

    // 先聊一句，拿到一条回答
    await page.locator('.formulaMessageInput').click();
    await page.keyboard.type('一致收敛是什么');
    await page.getByRole('button', {name: '发送'}).click();
    await page.locator('.chatAssistant').first().waitFor({timeout: 15000});
    assert.equal(await page.getByRole('button', {name: '存为笔记'}).count(), 0, '回答上也不该有存为笔记');

    // 2. 点头部「笔记」→ 进入笔记模式
    const toggle = page.locator('.noteModeToggle');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true', '应进入笔记模式');

    // 3. 输入框里出现浅灰说明
    const placeholder = await page.locator('.formulaMessageInput').getAttribute('data-placeholder');
    assert.match(placeholder || '', /笔记模式/, '笔记模式要在输入框里给出说明');

    // 4. 回答变成可点选；悬停高亮、点击选中
    const assistant = page.locator('.chatAssistant').first();
    assert.ok(await assistant.evaluate(el => el.classList.contains('isPickable')), '笔记模式下回答应可点选');
    await assistant.hover();
    await assistant.click();
    assert.ok(await assistant.evaluate(el => el.classList.contains('isPicked')), '点击后应呈选中态');
    await page.screenshot({path: 'data/preview/note-mode.png', fullPage: true});

    // 5. 浮出操作条，点「存为笔记」
    const bar = page.locator('.notePickBar');
    await bar.waitFor({timeout: 5000});
    assert.match(await bar.innerText(), /已选\s*1\s*处回答/);
    await bar.getByRole('button', {name: '存为笔记'}).click();
    await page.waitForTimeout(300);

    // 6. 提示词进输入框，且说明是「整理」而不是照抄
    const draft = await page.locator('.formulaMessageInput').innerText();
    assert.match(draft, /整理成一份笔记/, '要把「整理」写进指令');
    assert.match(draft, /不要按原顺序照抄/);
    assert.ok(!draft.includes('MIRROR-NOTE1'), '标记不能在输入框里露出来');

    // 7. 发送 → 带上 compose 标记
    await page.getByRole('button', {name: '发送'}).click();
    await page.waitForTimeout(600);
    const wire = sent[sent.length - 1];
    assert.ok(wire.includes('MIRROR-NOTE1'), '发送时要带上来源标记');
    const payload = JSON.parse(Buffer.from(
      /\[\[MIRROR-NOTE1 ([A-Za-z0-9_-]+)\]\]/.exec(wire)[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    assert.equal(payload.mode, 'compose', '应是 compose 模式');
    assert.deepEqual(payload.src.ids, [session.events[0].request_id], '要带上被选中的那处回答');

    // 8. 自动存库的通知 + 撤回
    const notice = page.locator('.noteSavedNotice');
    await notice.waitFor({timeout: 10000});
    assert.match(await notice.innerText(), /已存到[\s\S]*数学分析[\s\S]*第8章 反常积分/, '要说明存到哪了');
    assert.match(await notice.innerText(), /一致收敛与逐点收敛/, '要带上笔记标题');
    await notice.getByRole('button', {name: '撤回'}).click();
    await page.waitForTimeout(400);
    assert.deepEqual(deleted, ['saved-note-1'], '撤回应软删除刚存的那份笔记');
    assert.match(await notice.innerText(), /已撤回/, '撤回后要如实说明');

    // 9. 退出笔记模式后，可点选与操作条都消失
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.ok(!(await page.locator('.chatAssistant').first().evaluate(el => el.classList.contains('isPickable'))),
      '退出模式后回答不该再可点选');
    assert.equal(await page.locator('.notePickBar').count(), 0);

    // 10. 拖入文档：显示成高亮块、钉在输入框最前面、发送时带上传标记
    // 先在输入框里打字、把光标留在文字末尾，再放文件——文件块仍必须落到最前面
    await page.locator('.formulaMessageInput').click();
    await page.keyboard.type('这是我补充的要求：');
    await page.waitForTimeout(200);

    if (!(await page.locator('.chatToolPanel').count())) { await page.locator('.chatToolToggle').click(); await page.waitForTimeout(300); }
    await page.locator('.chatDocUpload input[type=file]').setInputFiles([
      {name: '第8章讲义.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test')},
    ]);
    await page.waitForTimeout(500);
    assert.deepEqual(uploads.length, 1, '应调用一次上传');
    const fileChip = page.locator('.formulaMessageInput .fileChip');
    await fileChip.waitFor({timeout: 5000});
    assert.match(await fileChip.innerText(), /第8章讲义\.pdf/, '要显示文件名');
    assert.match(await fileChip.innerText(), /PDF/, '要显示文件格式');

    const order = await page.locator('.formulaMessageInput').evaluate(el =>
      Array.from(el.childNodes).filter(n => n.nodeType === 1 || (n.textContent || '').trim())
        .map(n => n.classList?.contains('fileChip') ? 'FILE' : 'TEXT'));
    assert.equal(order[0], 'FILE', '光标在文字末尾时放文件，文件块也必须排在最前面');
    assert.ok(order.includes('TEXT'), '已经输入的文字应当保留');

    await page.getByRole('button', {name: '发送'}).click();
    await page.waitForTimeout(500);
    const withFile = sent[sent.length - 1];
    assert.match(withFile, /\[\[MIRROR-UPLOAD1 up-1\]\]/, '发送时要带上上传标记');
    assert.ok(!withFile.includes('第8章讲义.pdf'), '文件名不该塞进正文（服务端按 id 取）');

    // 11. 输入 @ 引用笔记：弹目录 → 选中 → 插入引用块 → 发送带引用标记
    await page.locator('.formulaMessageInput').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' @');
    await page.waitForTimeout(400);
    const mention = page.locator('.noteMention');
    await mention.waitFor({timeout: 5000});
    assert.match(await mention.innerText(), /第8章 反常积分·预习笔记/, '要列出我的笔记');
    assert.match(await mention.innerText(), /数学分析 › 第8章 反常积分/, '要标出笔记在哪个目录');
    await page.screenshot({path: 'data/preview/note-mention.png', fullPage: true});

    // 关键词过滤
    await page.keyboard.type('极限');
    await page.waitForTimeout(300);
    assert.match(await mention.innerText(), /极限的坑/, '应按关键词过滤出命中的笔记');
    assert.ok(!(await mention.innerText()).includes('反常积分·预习笔记'), '不命中的不该留在列表里');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    await mention.getByRole('option').first().click();
    await page.waitForTimeout(300);
    assert.equal(await mention.count(), 0, '选定后目录应收起');
    const refChip = page.locator('.formulaMessageInput .noteRefChip');
    await refChip.waitFor({timeout: 5000});
    assert.match(await refChip.innerText(), /第8章 反常积分·预习笔记/, '引用块要显示笔记标题');
    assert.ok(!(await page.locator('.formulaMessageInput').innerText()).includes('@'),
      '光标处那个 @ 关键词应被引用块替换掉');

    await page.getByRole('button', {name: '发送'}).click();
    await page.waitForTimeout(500);
    const withRef = sent[sent.length - 1];
    assert.match(withRef, /\[\[MIRROR-REF1 note-alpha /, '发送时要带上笔记引用标记');
    assert.ok(!withRef.includes('MIRROR-REF1 note-beta'), '只引用选中的那一篇');

    // 12. 页边抽出：拖进文件之后才出现，点开抽出偏好，按钮把高亮要求插进输入框
    const edge = page.locator('.noteEdge');
    assert.equal(await edge.count(), 0, '没有来源时不该有页边');
    if (!(await page.locator('.chatToolPanel').count())) { await page.locator('.chatToolToggle').click(); await page.waitForTimeout(300); }
    await page.locator('.chatDocUpload input[type=file]').setInputFiles([
      {name: '第9章讲义.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test')},
    ]);
    await edge.waitFor({timeout: 10000});
    // 12. 页边抽出式偏好面板。
    // 这一段用 page.evaluate 直接操作 DOM：Playwright 的 locator 解析不到 .noteEdge 子树
    // （元素确实在，querySelectorAll 找得到、DOM 也稳定，原因未查明），
    // 而 evaluate 能拿到，所以断言与点击都走 evaluate——验的是功能本身，不是 locator 能不能看见。
    const probe = () => page.evaluate(() => {
      const edge = document.querySelector('.noteEdge');
      if (!edge) return {present: false};
      const body = edge.querySelector('.noteEdgeBody');
      const groups = edge.querySelectorAll('.noteEdgeGroup').length;
      const opts = [...edge.querySelectorAll('.noteEdgeGroup button')].map(b => b.textContent);
      return {present: true, expanded: edge.querySelector('.noteEdgeTab').getAttribute('aria-expanded'),
              bodyHeight: getComputedStyle(body).maxHeight, groups, opts,
              chips: [...document.querySelectorAll('.formulaMessageInput .promptChip')].length};
    });
    const clickEdgeTab = () => page.evaluate(() => document.querySelector('.noteEdgeTab').click());
    const clickOption = label => page.evaluate(l => {
      const b = [...document.querySelectorAll('.noteEdgeGroup button')].find(x => x.textContent === l);
      if (!b) throw new Error('找不到选项按钮：' + l);
      b.click();
    }, label);

    // 先清掉上一步残留的来源块（顺便验证「撤掉来源 → 页边消失」）
    await page.evaluate(() => document.querySelectorAll(
      '.formulaMessageInput .fileChip, .formulaMessageInput .noteRefChip').forEach(c => c.click()));
    await page.waitForTimeout(600);
    assert.equal((await probe()).present, false, '没有来源时不该有页边');
    if (!(await page.locator('.chatToolPanel').count())) { await page.locator('.chatToolToggle').click(); await page.waitForTimeout(300); }
    await page.locator('.chatDocUpload input[type=file]').setInputFiles([
      {name: '第9章讲义.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test')},
    ]);
    await page.waitForTimeout(800);
    const closed = await probe();
    assert.equal(closed.present, true, '拖进文件后应冒出页边');
    assert.equal(closed.expanded, 'false', '默认收起');
    assert.equal(closed.bodyHeight, '0px', '收起时抽出的内容高度为 0');

    await clickEdgeTab();
    await page.waitForTimeout(700);
    const opened = await probe();
    assert.equal(opened.expanded, 'true', '点开后应抽出');
    assert.ok(parseFloat(opened.bodyHeight) > 0, '抽出后内容应有高度');
    assert.ok(opened.groups >= 2, `应有偏好选项组，实际 ${opened.groups}`);
    assert.ok(opened.opts.includes('提纲式'), '应列出后端下发的选项');
    await page.screenshot({path: 'data/preview/note-edge.png', fullPage: true});

    // 点选项 → 往输入框插一段高亮要求（内容来自后端预设片段）
    await clickOption('提纲式');
    await page.waitForTimeout(400);
    const withChip = await page.evaluate(() =>
      [...document.querySelectorAll('.formulaMessageInput .promptChip')].map(c => c.textContent));
    assert.equal(withChip.length, 1, '应插入一个高亮要求块');
    assert.match(withChip[0], /提纲式组织/, '插入的应是后端预设的那段要求');
    // 再点一下输入框里那块 → 撤销
    await page.evaluate(() => document.querySelector('.formulaMessageInput .promptChip').click());
    await page.waitForTimeout(400);
    assert.equal((await probe()).chips, 0, '点输入框里的高亮块应移除该要求');
    // 再插一次并发送：高亮要求应作为正文文本送出
    await clickOption('提纲式');
    await page.waitForTimeout(300);
    await page.getByRole('button', {name: '发送'}).click();
    await page.waitForTimeout(600);
    assert.match(sent[sent.length - 1], /提纲式组织/, '高亮要求应作为正文文本送出');

    // 撤掉来源 → 页边消失
    await page.evaluate(() => document.querySelector('.formulaMessageInput .fileChip')?.click());
    await page.waitForTimeout(500);
    assert.equal((await probe()).present, false, '把文件块撤掉后页边也该收起');

    assert.deepEqual(errors, [], '不应有页面错误');
    console.log('PASS: 笔记入口只在笔记模式；选回答→存为笔记→整理指令入框→发送带 compose 标记→自动存库并回显位置→可撤回；文档上传成块且钉在最前；输入 @ 弹笔记目录、过滤、插入引用块并随消息带出；页边抽出偏好、选项插高亮要求、可撤销');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
