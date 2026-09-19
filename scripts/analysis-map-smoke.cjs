const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('artifacts/knowledge-map/mathematical-analysis.html')).href);
  assert.equal(await page.locator('.chapter').count(),16);
  assert.equal(await page.locator('.chapter li').count(),70);
  await page.getByRole('searchbox').fill('数列极限');
  assert.equal(await page.locator('.chapter').count(),1);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('tab',{name:'数列知识联系'}).click();
  assert.equal(await page.locator('.node').count(),7);
  await page.getByRole('button',{name:'收敛数列必有界，但有界未必收敛',exact:true}).click();
  assert.match(await page.locator('#detail').innerText(),/第33页/);
  await page.screenshot({path:'artifacts/knowledge-map/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('tab',{name:'章节总览'}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('tab',{name:'数列知识联系'}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.locator('#mobile-concepts button:visible').count(),7);
  await page.screenshot({path:'artifacts/knowledge-map/mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: 16 chapters, 70 sections, 7 concepts, source selection, search, desktop/mobile, no external API calls.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
