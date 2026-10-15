// 资源中心验收：封面要被正确裁切（不能只露一截），书目字段真实、角色徽标来自目录。
// 合成接口，不连数据库、不调模型。运行：node scripts/verify-resource-library.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.MIRROR_WEB_PREVIEW_URL || 'http://127.0.0.1:3011';
// 竖版合成封面（60×90）：中间那条横带代表书名，裁切错位就会被切掉
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAADwAAABaCAIAAABrM6JiAAAAeElEQVR42u3XoQ3AMAxFwbgKKAwI6AiFGbk4U2aFggZYvTfB6RPLcfarZOsoCYOGhoaGhv686oxDQ0NDQ0NDQ0NDQ0NDQ0NDQ0ND7yr6fCwNDQ0NDQ0NDQ0N/acnoN3D0tDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NAvWumFAuI/n75zAAAAAElFTkSuQmCC', 'base64');

const items = [
  {resource_id: 'circuits-alexander-sadiku-6e', course_id: 'electronic_circuits', kind: 'textbook',
   title: 'Fundamentals of Electric Circuits', authors: ['Charles K. Alexander', 'Matthew N. O. Sadiku'],
   edition: '第六版', volume: null, publication_year: null, exam_year: null, tags: ['electronic_circuits'],
   cover_url: '/api/v2/material-library/circuits-alexander-sadiku-6e/cover',
   pdf_url: '/api/v2/material-library/circuits-alexander-sadiku-6e/pdf', page_count: 990,
   completeness: 'unverified', availability: 'ready', role: 'unassigned'},
  {resource_id: 'chen-jixiu-3e-vol1', course_id: 'mathematical_analysis', kind: 'textbook',
   title: '数学分析（第三版）上册', authors: ['陈纪修', '於崇华', '金路'],
   edition: '第三版', volume: '上册', publication_year: null, exam_year: null,
   tags: ['mathematical_analysis'],
   cover_url: '/api/v2/material-library/chen-jixiu-3e-vol1/cover',
   pdf_url: '/api/v2/material-library/chen-jixiu-3e-vol1/pdf', page_count: 381,
   completeness: 'unverified', availability: 'ready', role: 'primary'},
];

(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/v2/**', route => {
      const path = new URL(route.request().url()).pathname.replace('/api/v2', '');
      const json = body => route.fulfill({json: body});
      if (/^\/material-library\/[^/]+\/cover$/.test(path)) {
        // 一张竖版封面：卡片是横版，裁切方式错了就会只露出上半截
        return route.fulfill({status: 200, contentType: 'image/png', body: PNG});
      }
      if (path === '/me') return json({id: 'fixture', nickname: '验收', role: 'student', status: 'active'});
      if (path === '/config') return json({});
      if (path === '/courses') return json([{course_id: 'mathematical_analysis', display_name: '数学分析'}]);
      if (path === '/memory') return json({observations: [], hypotheses: []});
      if (path.startsWith('/material-library')) return json({items, total: items.length, page: 1, page_size: 20});
      return json([]);
    });

    await page.goto(BASE + '/student/resources', {waitUntil: 'domcontentloaded'});
    await page.locator('.mlCard').first().waitFor({timeout: 20000});
    await page.waitForTimeout(600);

    // 1. 书目字段来自目录，不编造
    const cards = await page.locator('.mlCard').allInnerTexts();
    assert.equal(cards.length, 2, '两条目录项都要出现');
    assert.match(cards[1], /数学分析（第三版）上册/);
    assert.match(cards[1], /第三版 · 上册/, '版次与册次要显示');
    assert.match(cards[1], /陈纪修 \/ 於崇华 \/ 金路/);
    assert.match(cards[1], /381 页/, '页数来自真实文件');
    assert.match(cards[1], /出版年份：未提供/, '没有证据的字段就写未提供，不猜');
    assert.match(cards[1], /主教材/, 'role=primary 要标出来');
    assert.ok(!cards[0].includes('主教材'), 'unassigned 的不该有主教材徽标');

    // 2. 封面要被正确裁切：图片实际高度等于外框高度。
    //    早先 img 写 height:100% 但那是 grid 行里的百分比、解析不出 190px，
    //    图片按自身比例长到 414px 高，overflow 从顶部裁掉——只露上 46%，
    //    竖版封面的书名正好在被裁掉的那一半里。
    const covers = await page.locator('.mlCard').evaluateAll(nodes => nodes.map(card => {
      const frame = card.querySelector('.mlCover');
      const img = card.querySelector('.mlCover img');
      if (!frame || !img) return null;
      return {frame: Math.round(frame.getBoundingClientRect().height),
              img: Math.round(img.getBoundingClientRect().height),
              natural: [img.naturalWidth, img.naturalHeight],
              position: getComputedStyle(img).position};
    }));
    for (const cover of covers) {
      assert.ok(cover, '每张卡片都要有封面图');
      assert.ok(Math.abs(cover.img - cover.frame) <= 1,
        `封面图高度要等于外框高度（否则会被裁掉一截）：img=${cover.img} frame=${cover.frame}`);
      assert.equal(cover.position, 'absolute', '封面要用绝对定位撑满外框，百分比高度解析不出来');
      assert.ok(cover.natural[1] > cover.natural[0], '这条用例要配竖版封面才有意义');
    }

    // 3. 可以进阅读
    assert.equal(await page.getByRole('button', {name: /阅读 PDF/}).count(), 2);
    await page.screenshot({path: 'data/preview/resource-library.png', fullPage: true});
    assert.deepEqual(errors, [], '不应有页面错误');
    console.log('PASS: 资源中心书目字段来自目录（版次/册次/作者/页数/缺项写未提供/主教材徽标）；'
      + '封面按 cover 正确裁切而不是只露上半截');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
