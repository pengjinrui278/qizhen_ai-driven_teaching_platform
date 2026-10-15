// 我的笔记验收：知识库目录树（科目/时间）、浅灰时间、星标/改名/备注、附件、回收站。
// 合成接口就地生效，不连数据库、不调模型。运行：node scripts/verify-notes.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.MIRROR_WEB_PREVIEW_URL || 'http://127.0.0.1:3011';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const COURSES = [
  {course_id: 'mathematical_analysis', display_name: '数学分析'},
  {course_id: 'ai_literacy', display_name: 'AI 教学'},
];

// 合成笔记库：写操作就地生效，断言界面确实跟着数据走，而不是只画了一次静态 DOM。
let notes = [
  {id: 'n1', course_id: 'mathematical_analysis', folder_path: '第8章 反常积分',
   title: '第8章 反常积分·预习笔记', kind: 'md',
   content: '# 反常积分\n\n比较判别法：$0 \\le f \\le g$。\n\n```mermaid\nflowchart TD\n  A[无穷限积分] --> B{被积函数正?}\n  B -->|是| C[比较判别法]\n```\n',
   starred: false, remark: '', source: 'agent', source_meta: {}, deleted_at: null, deleted_from: '',
   created_at: '2026-10-12T09:00:00Z', updated_at: '2026-10-13T15:20:00Z', has_content: true,
   attachments: [{id: 'a1', note_id: 'n1', filename: '课堂板书.png', mime: 'image/png', size: 2048,
                  kind: 'image', created_at: '2026-10-13T15:20:00Z'},
                 {id: 'a2', note_id: 'n1', filename: '第8章课件.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                  size: 40960, kind: 'ppt', created_at: '2026-10-13T15:21:00Z'}]},
  {id: 'n2', course_id: 'mathematical_analysis', folder_path: '',
   title: '错题与碎片知识点', kind: 'md', content: '一致收敛的坑',
   starred: true, remark: '考前再看一遍', source: 'student', source_meta: {}, deleted_at: null, deleted_from: '',
   created_at: '2026-10-10T09:00:00Z', updated_at: '2026-10-11T09:00:00Z', has_content: true, attachments: []},
  {id: 'n3', course_id: 'ai_literacy', folder_path: '',
   title: 'AI 学习笔记', kind: 'md', content: '知识表示', starred: false, remark: '',
   source: 'agent', source_meta: {}, deleted_at: null, deleted_from: '', created_at: '2026-10-09T09:00:00Z',
   updated_at: '2026-10-09T09:00:00Z', has_content: true, attachments: []},
  {id: 'n4', course_id: 'mathematical_analysis', folder_path: '第3章 极限',
   title: '已删掉的笔记', kind: 'md', content: '不要了', starred: false, remark: '', source: 'student',
   source_meta: {}, deleted_at: '2026-10-13T10:00:00Z', deleted_from: '第3章 极限',
   created_at: '2026-10-08T09:00:00Z', updated_at: '2026-10-13T10:00:00Z', has_content: true, attachments: []},
];

const writes = [];
const brief = n => { const {content, attachments, ...rest} = n; return rest; };
const find = id => notes.find(n => n.id === id);

(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.route('**/api/v2/**', route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace('/api/v2', '');
      const method = request.method();
      const json = body => route.fulfill({json: body});

      if (path === '/me') return json({id: 'u', role: 'student', status: 'active'});
      if (path === '/config') return json({});
      if (path === '/courses') return json(COURSES);

      if (path === '/notes' && method === 'GET') {
        const trash = url.searchParams.get('trash') === '1';
        const q = (url.searchParams.get('q') || '').trim();
        const starred = url.searchParams.get('starred') === '1';
        const courseId = url.searchParams.get('course_id') || '';
        let items = notes.filter(n => trash ? n.deleted_at : !n.deleted_at);
        if (courseId) items = items.filter(n => n.course_id === courseId);
        if (starred) items = items.filter(n => n.starred);
        if (q) items = items.filter(n => (n.title + n.remark + (n.content || '')).includes(q));
        return json({items: items.map(brief), total: items.length});
      }

      if (path === '/notes' && method === 'POST') {
        const body = JSON.parse(request.postData() || '{}');
        const created = {id: 'new' + (notes.length + 1), starred: false, remark: '', source: 'student',
          source_meta: {}, deleted_at: null, deleted_from: '', attachments: [], has_content: true,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(), kind: 'md', ...body};
        notes.unshift(created);
        writes.push({method, path, body});
        return json(created);
      }

      if (path === '/notes/bulk' && method === 'POST') {
        const body = JSON.parse(request.postData() || '{}');
        writes.push({method, path, body});
        for (const id of body.ids) {
          const note = find(id);
          if (!note || note.deleted_at) continue;
          if (body.course_id !== undefined) note.course_id = body.course_id;
          if (body.folder_path !== undefined) note.folder_path = body.folder_path;
          if (body.starred !== undefined) note.starred = body.starred;
        }
        return json({ok: true, updated: body.ids, count: body.ids.length, skipped: 0});
      }

      const attachment = path.match(/^\/notes\/attachments\/(.+)$/);
      if (attachment) return route.fulfill({status: 200, contentType: 'image/png', body: PNG});

      const upload = path.match(/^\/notes\/([^/]+)\/attachments$/);
      if (upload && method === 'POST') {
        writes.push({method, path, multipart: true});
        const created = {id: 'a9', note_id: upload[1], filename: '新附件.png', mime: 'image/png',
          size: 3, kind: 'image', created_at: new Date().toISOString()};
        const note = find(upload[1]);
        if (note) note.attachments = [...note.attachments, created];
        return json(created);
      }

      const restore = path.match(/^\/notes\/([^/]+)\/restore$/);
      if (restore && method === 'POST') {
        writes.push({method, path});
        const note = find(restore[1]);
        note.deleted_at = null; note.deleted_from = '';
        return json(note);
      }

      const single = path.match(/^\/notes\/([^/]+)$/);
      if (single) {
        const note = find(single[1]);
        if (!note) return route.fulfill({status: 404, json: {detail: '笔记不存在'}});
        if (method === 'GET') return json(note);
        if (method === 'PATCH') {
          const body = JSON.parse(request.postData() || '{}');
          writes.push({method, path, body});
          Object.assign(note, body, {updated_at: new Date().toISOString()});
          return json(note);
        }
        if (method === 'DELETE') {
          writes.push({method, path, purge: url.searchParams.get('purge') === '1'});
          if (url.searchParams.get('purge') === '1') notes = notes.filter(n => n.id !== single[1]);
          else { note.deleted_at = new Date().toISOString(); note.deleted_from = note.folder_path; }
          return json({ok: true, purged: url.searchParams.get('purge') === '1'});
        }
      }
      return json([]);
    });

    await page.goto(BASE + '/student/notes');
    await page.getByRole('heading', {name: '我的笔记'}).waitFor({timeout: 20000});

    // 1. 目录树按科目分组（科目 ▸ 目录 ▸ 笔记）
    const group = page.locator('.nmGroupHead').filter({hasText: '数学分析'});
    await group.waitFor({timeout: 10000});
    assert.match(await group.innerText(), /\b2\b/, '数学分析科目应显示笔记数（回收站里的那份不算）');
    assert.ok(await page.locator('.nmFolderHead').filter({hasText: '第8章 反常积分'}).isVisible(),
      '应按目录分层');
    assert.equal(await page.locator('.nmRow').count(), 3, '回收站与 AI 科目的笔记不应混进当前列表');

    // 2. 浅灰小字：创建与修改时间
    const stamp = page.locator('.nmRow').filter({hasText: '第8章 反常积分·预习笔记'}).locator('.nmRowTime').first();
    const stampText = await stamp.innerText();
    assert.match(stampText, /建于/, '应显示创建时间');
    assert.match(stampText, /改于/, '应显示修改时间');
    await page.screenshot({path: 'data/preview/notes-tree.png', fullPage: true});

    // 3. 星标：行内工具按钮写回后端并立刻反映在树上
    const row = page.locator('.nmRow').filter({hasText: '第8章 反常积分·预习笔记'});
    await row.hover();
    await row.getByRole('button', {name: '☆'}).click();
    await page.waitForTimeout(300);
    assert.ok(writes.some(w => w.method === 'PATCH' && w.body?.starred === true), '星标应写回 starred=true');
    await page.locator('.nmRow.isStarred').filter({hasText: '第8章 反常积分·预习笔记'}).waitFor({timeout: 5000});

    // 4. 重命名走对话框，不弹 window.prompt
    await row.hover();
    await row.getByRole('button', {name: '改名'}).click();
    const dialog = page.getByRole('dialog', {name: '重命名'});
    await dialog.waitFor();
    await dialog.getByLabel('标题').fill('第8章 反常积分·复习笔记');
    await dialog.getByRole('button', {name: '确定'}).click();
    await page.waitForTimeout(300);
    assert.ok(writes.some(w => w.method === 'PATCH' && w.body?.title === '第8章 反常积分·复习笔记'),
      '重命名应写回新标题');
    await page.locator('.nmRowTitle').filter({hasText: '复习笔记'}).first().waitFor({timeout: 5000});

    // 5. 备注
    const renamed = page.locator('.nmRow').filter({hasText: '复习笔记'});
    await renamed.hover();
    await renamed.getByRole('button', {name: '备注'}).click();
    const remark = page.getByRole('dialog', {name: '写备注'});
    await remark.waitFor();
    await remark.getByLabel('备注').fill('判别法容易混，考前再看');
    await remark.getByRole('button', {name: '确定'}).click();
    await page.waitForTimeout(300);
    assert.ok(writes.some(w => w.body?.remark === '判别法容易混，考前再看'), '备注应写回');

    // 6. 附件：图片内联预览，PPT 只给下载/新标签
    await renamed.locator('.nmRowMain').click();
    const reader = page.locator('.nmReader');
    await reader.waitFor({timeout: 5000});
    assert.match(await reader.locator('.nmBreadcrumb').innerText(), /数学分析[\s\S]*第8章 反常积分/,
      '面包屑应给出精确位置');
    // 正文里的 ```mermaid 要真的画成图（mermaid 是懒加载块，此处等待渲染完成）。
    // SVG 不是 HTMLElement，取文字要用 textContent 而不是 innerText。
    await reader.locator('.mmdSvg svg').waitFor({timeout: 20000});
    assert.match((await reader.locator('.mmdSvg svg').textContent()) || '', /无穷限积分/,
      'mermaid 流程图应渲染出节点文字');
    assert.ok(await reader.locator('.katex').count() > 0, '公式应经 KaTeX 渲染');

    assert.ok(await reader.locator('img.nmAttachPreview').isVisible(), '图片附件应内联预览');
    const ppt = reader.locator('.nmAttach').filter({hasText: '第8章课件.pptx'});
    assert.ok(await ppt.locator('a[download]').isVisible(), 'PPT 应提供下载');
    assert.match(await ppt.innerText(), /不内嵌预览/, 'Office 文件应说明只能下载或新标签打开');

    // 导出：details 收起时选项不在无障碍树里，要先展开
    await reader.getByText('导出', {exact: true}).click();
    for (const label of ['Markdown', 'Word', 'PPT', '可打印 HTML']) {
      assert.equal(await reader.getByRole('link', {name: label}).count(), 1, `应能导出 ${label}`);
    }
    assert.match(await reader.getByRole('link', {name: 'Word'}).getAttribute('href'),
      /\/api\/v2\/notes\/n1\/export\?format=docx$/, 'Word 导出应指向 docx 端点');
    await page.screenshot({path: 'data/preview/notes-reader.png', fullPage: true});

    // 7. 换一种整理口径：按时间
    await page.getByRole('button', {name: '按科目整理'}).click();
    await page.locator('.nmTreeTime .nmGroupHead').first().waitFor({timeout: 5000});

    // 8. 回收站：默认不含已删笔记，进去可见并可还原
    await page.getByRole('button', {name: '回收站'}).click();
    const trashed = page.locator('.nmRow').filter({hasText: '已删掉的笔记'});
    await trashed.waitFor({timeout: 5000});
    await trashed.hover();
    await trashed.getByRole('button', {name: '还原'}).click();
    await page.waitForTimeout(300);
    assert.ok(writes.some(w => w.path.endsWith('/restore')), '还原应调用 restore 端点');
    await page.locator('.nmEmpty').filter({hasText: '回收站是空的'}).waitFor({timeout: 5000});

    // 9. 搜索
    await page.getByRole('button', {name: '回收站'}).click();
    await page.getByLabel('搜索笔记').fill('碎片');
    await page.getByRole('button', {name: '搜索'}).click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.nmRow').count(), 1, '搜索应只剩命中项');

    await page.screenshot({path: 'data/preview/notes-library.png', fullPage: true});
    assert.deepEqual(errors, [], '不应有页面错误');
    console.log('PASS: 我的笔记目录树、浅灰时间、星标/改名/备注、mermaid 与公式渲染、附件预览与下载、导出、回收站还原、搜索');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
