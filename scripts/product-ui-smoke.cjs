const {chromium}=require("playwright");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
(async()=>{
 const browser=await chromium.launch({channel:"msedge",headless:true});
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await ctx.newPage(),errors=[],apiCalls=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("request",r=>{if(r.url().includes("/api/v2/"))apiCalls.push(r.url());});
 const base=process.env.MIRROR_BROWSER_URL||"http://127.0.0.1:3010";
 const dir=path.resolve(__dirname,"../artifacts");fs.mkdirSync(dir,{recursive:true});
 const routes=["/student","/student/learn","/student/assignments","/student/observations","/student/privacy","/teacher","/teacher/assignments","/teacher/review","/teacher/reports","/teacher/course","/teacher/settings"];
 async function visit(route){const r=await page.goto(base+route);assert.equal(r.status(),200);await page.locator(".portalContent").waitFor();await page.waitForFunction(()=>!document.body.innerText.includes("正在加载")&&!document.body.innerText.includes("正在恢复登录"));await page.waitForTimeout(150);}
 try{
  for(const route of routes){await visit(route);const text=await page.locator("body").innerText();assert(!/Sandbox|开发清单|开发团队|参数训练|剩余事项|执行回归/.test(text),route);assert(!page.locator('a[href*="/pending"]').count()||await page.locator('a[href*="/pending"]').count()===0);}
  await visit("/student/learn");await page.locator(".problemList button").first().click();await page.getByRole("button",{name:"我卡住了，给点提示",exact:true}).click();await page.getByRole("alert").filter({hasText:"课程助手暂不可用"}).waitFor();assert.equal(await page.locator(".turn").count(),0);
  await visit("/student/observations");await page.getByRole("button",{name:"纠正记录"}).first().click();await page.getByLabel("更正说明").fill("此条记录不符合本次学习情况");await page.getByRole("button",{name:"保存",exact:true}).click();await page.getByText("已纠正：此条记录不符合本次学习情况").waitFor();
  await page.screenshot({path:path.join(dir,"feedback-blue.png"),fullPage:true});
  await visit("/student/assignments");await page.getByRole("button",{name:"提交作业",exact:true}).first().click();await page.getByLabel("作答内容").fill("网页验收作品：任给正数 ε，选择 N 大于 1/ε。");await page.getByRole("checkbox",{name:"将此内容提交给教师"}).check();await page.getByRole("button",{name:"确认提交",exact:true}).click();await page.getByText("已提交",{exact:true}).waitFor();
  await visit("/teacher/review");await page.locator(".workList button").first().click();await page.getByText("网页验收作品：",{exact:false}).waitFor();await page.getByLabel("批注",{exact:true}).fill("已核对参数与精度的依赖");await page.getByRole("button",{name:"保存批改",exact:true}).click();await page.getByText("已保存批改",{exact:true}).waitFor();
  await page.screenshot({path:path.join(dir,"teacher-review-blue.png"),fullPage:true});
  await visit("/teacher/reports");const dl=page.waitForEvent("download");await page.getByRole("button",{name:"导出报告"}).click();await dl;assert.equal(await page.locator("form").count(),0);
  await visit("/teacher/course");await page.locator(".historyButton").first().click();await page.getByLabel("审校说明",{exact:true}).fill("本次仅验证示例题目的网页编辑");await page.getByRole("checkbox").check();await page.getByRole("button",{name:"教师确认发布新版本"}).click();await page.getByText("已发布",{exact:true}).first().waitFor();
  await page.screenshot({path:path.join(dir,"teacher-course-blue.png"),fullPage:true});
  await visit("/teacher/assignments");await page.getByRole("button",{name:"布置作业"}).click();await page.getByLabel("作业名称").fill("网页验收作业");assert.equal(await page.getByLabel("资料保留时长（小时）").inputValue(),"3");await page.getByRole("checkbox").check();await page.getByRole("button",{name:"发布",exact:true}).click();await page.getByRole("heading",{name:"网页验收作业"}).waitFor();
  for(const route of routes){await page.setViewportSize({width:390,height:844});await visit(route);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"mobile overflow "+route);}
  await visit("/student/learn");
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=","base64");
  assert.equal(await page.getByLabel("拍照",{exact:true}).getAttribute("capture"),"environment");
  await page.getByLabel("上传图片",{exact:true}).setInputFiles({name:"test.png",mimeType:"image/png",buffer:png});
  await page.getByAltText("待识别图片").waitFor();
  await page.screenshot({path:path.join(dir,"student-mobile-blue.png"),fullPage:true});
  await page.getByRole("button",{name:"识别文字",exact:true}).click();await page.getByRole("alert").filter({hasText:"暂时无法识别"}).waitFor();
  await page.getByRole("button",{name:"移除图片"}).click();assert.equal(await page.getByAltText("待识别图片").count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(apiCalls,[]);
  console.log(JSON.stringify({passed:true,routes:routes.length,mobileWidth:390,checked:["no developer copy","no prerecorded answers","record correction","student submit to teacher review","report export","course publish","teacher assignment","photo preview and capture input"],realModel:false,realOCR:false}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
