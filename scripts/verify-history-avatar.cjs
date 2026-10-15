// 历史记录管理（重命名 / 删除）+ 首页头像验收。
// 合成接口，不连数据库、不调模型。运行：node scripts/verify-history-avatar.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.MIRROR_WEB_PREVIEW_URL || 'http://127.0.0.1:3011';
const COURSE = {course_id: 'mathematical_analysis', display_name: '数学分析',
                profile_id: 'chen-jixiu-3e', available: true};
// 1×1 的透明 PNG，够做一次真实的上传→裁剪→保存
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64');

const attempt = (id, title, created, extra = {}) => ({
  id, course_id: COURSE.course_id, problem: {text: title}, sandbox_id: null,
  title, title_source: 'topic_extraction', created_at: created, ...extra});

(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const calls = {patch: [], deleted: []};
    let avatar = "";
    let sessions = [
      attempt('a-main', '连续 · 概念讨论', '2026-10-15T02:00:00Z'),
      attempt('a-orphan', '【引用追问】epsilon · 概念讨论', '2026-10-15T01:00:00Z'),
      attempt('a-second', '级数 · 概念讨论', '2026-10-14T02:00:00Z'),
    ];

    await page.route('**/api/v2/**', route => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace('/api/v2', '');
      const method = request.method();
      const json = body => route.fulfill({json: body});
      if (path === '/me') return json({id: 'fixture', username: 'fixture', nickname: '验收同学',
        role: 'student', status: 'active', retention_days: 180, avatar});
      if (path === '/me/avatar' && method === 'PATCH') {
        avatar = request.postDataJSON().avatar;
        return json({id: 'fixture', username: 'fixture', nickname: '验收同学', role: 'student',
                     status: 'active', retention_days: 180, avatar});
      }
      if (path === '/config') return json({});
      if (path === '/courses') return json([COURSE]);
      if (path === '/sandboxes') return json([]);
      if (path === '/memory') return json({observations: [], hypotheses: []});
      if (path === '/notes') return json({items: [], total: 0});
      if (path === '/attempts' && method === 'GET') return json(sessions);
      if (path.startsWith('/attempts/') && method === 'PATCH') {
        const id = path.split('/')[2];
        calls.patch.push({id, title: request.postDataJSON().title});
        sessions = sessions.map(s => s.id === id ? {...s, title: request.postDataJSON().title,
                                                    title_source: 'custom'} : s);
        return json({id, title: request.postDataJSON().title, title_source: 'custom'});
      }
      if (path.startsWith('/attempts/') && method === 'DELETE') {
        const id = path.split('/')[2];
        calls.deleted.push(id);
        sessions = sessions.filter(s => s.id !== id);
        return json({deleted: true, events: 1, activities: 1});
      }
      if (path.startsWith('/attempts/')) {
        const id = path.split('/')[2];
        const row = sessions.find(s => s.id === id) || sessions[0];
        return json({...row, events: []});
      }
      return json([]);
    });

    // ---- 1. 侧栏：游离追问不再当成一条独立对话 ----
    await page.goto(BASE + '/student/learn', {waitUntil: 'domcontentloaded'});
    await page.locator('.chatSessionList').waitFor({timeout: 20000});
    await page.waitForTimeout(400);
    const titles = await page.locator('.chatHistoryTitle').allInnerTexts();
    assert.ok(titles.includes('连续 · 概念讨论'), `主对话要在：${titles}`);
    assert.ok(!titles.some(t => t.includes('epsilon')),
      `带【引用追问】标记的游离追问不该出现在顶层：${titles}`);

    // ---- 2. 重命名 ----
    const row = page.locator('.chatHistoryRow', {hasText: '连续 · 概念讨论'}).first();
    await row.hover();
    await row.locator('.chatHistoryMore').click();
    await page.getByRole('menuitem', {name: '重命名'}).click();
    const box = page.getByLabel('对话名称');
    await box.fill('我自己起的名字');
    await page.locator('.chatHistoryRename').getByRole('button', {name: '保存'}).click();
    await page.waitForTimeout(500);
    assert.deepEqual(calls.patch, [{id: 'a-main', title: '我自己起的名字'}], '要 PATCH 到这条对话');
    assert.ok((await page.locator('.chatHistoryTitle').allInnerTexts()).includes('我自己起的名字'),
      '侧栏要立刻显示新名字');

    // ---- 3. 删除（必须二次确认） ----
    const second = page.locator('.chatHistoryRow', {hasText: '级数 · 概念讨论'}).first();
    await second.hover();
    await second.locator('.chatHistoryMore').click();
    await page.getByRole('menuitem', {name: '删除'}).click();
    const dialog = page.getByRole('dialog', {name: '删除对话'});
    await dialog.waitFor({timeout: 5000});
    assert.match(await dialog.innerText(), /无法恢复/, '要写清删了不能恢复');
    await dialog.getByRole('button', {name: '取消'}).click();
    await page.waitForTimeout(300);
    assert.deepEqual(calls.deleted, [], '点了取消就不该删');

    await second.hover();
    await second.locator('.chatHistoryMore').click();
    await page.getByRole('menuitem', {name: '删除'}).click();
    await page.getByRole('dialog', {name: '删除对话'}).getByRole('button', {name: '确认删除'}).click();
    await page.waitForTimeout(600);
    assert.deepEqual(calls.deleted, ['a-second'], '确认后才删');
    assert.ok(!(await page.locator('.chatHistoryTitle').allInnerTexts()).includes('级数 · 概念讨论'),
      '删掉的要从侧栏消失');

    // ---- 4. 首页头像：设置 → 拖动缩放 → 保存 ----
    await page.goto(BASE + '/student', {waitUntil: 'domcontentloaded'});
    const avatarBtn = page.locator('.lmAvatarButton');
    await avatarBtn.waitFor({timeout: 20000});
    assert.equal(await avatarBtn.innerText(), '验', '没头像时显示昵称首字');
    // portal.css 里 .portal button(0,1,1) 会盖掉单类选择器的 border-radius，
    // 头像会被压成圆角方框——这里按计算样式守着
    const radius = await avatarBtn.evaluate(el => getComputedStyle(el).borderRadius);
    assert.equal(radius, '50%', `头像必须是圆的，实际 ${radius}`);
    await avatarBtn.click();
    const editor = page.getByRole('dialog', {name: '编辑头像'});
    await editor.waitFor({timeout: 5000});
    await editor.getByLabel('选择头像图片').setInputFiles(
      {name: 'me.png', mimeType: 'image/png', buffer: PNG});
    await page.waitForTimeout(400);
    assert.equal(await editor.locator('.lmAvatarFrame img').count(), 1, '选完图要显示在框里');
    await editor.getByLabel('缩放').fill('2');
    await page.waitForTimeout(200);
    await editor.getByRole('button', {name: '保存'}).click();
    await page.waitForTimeout(700);
    assert.match(avatar, /^data:image\/jpeg;base64,/, '存下来的应当是裁好的 JPEG');
    assert.ok(avatar.length < 380000, '体积要在服务端上限之内');
    assert.equal(await editor.count(), 0, '保存后编辑框要关掉');
    assert.equal(await avatarBtn.locator('img').count(), 1, '首页要立刻显示新头像');

    // 清除
    await avatarBtn.click();
    await page.getByRole('dialog', {name: '编辑头像'}).getByRole('button', {name: '清除头像'}).click();
    await page.waitForTimeout(600);
    assert.equal(avatar, '', '清除后服务端存的是空串');
    assert.equal(await avatarBtn.locator('img').count(), 0, '回到昵称首字');

    await page.screenshot({path: 'data/preview/history-avatar.png', fullPage: true});
    assert.deepEqual(errors, [], '不应有页面错误');
    console.log('PASS: 游离追问不进顶层；可重命名（PATCH）与删除（二次确认，取消不删）；'
      + '首页头像可上传、拖动缩放、保存为裁好的 JPEG、可清除');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
