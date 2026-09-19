const {chromium}=require("playwright");
const assert=require("node:assert/strict");
(async()=>{
 const browser=await chromium.launch({channel:"msedge",headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 const base=process.env.MIRROR_BROWSER_URL||"http://127.0.0.1:3010";
 try{
  await page.goto(base+"/student?mode=live");
  await page.getByRole("button",{name:"注册账号",exact:true}).click();
  await page.getByLabel("账号",{exact:true}).fill("product_live_"+Date.now());
  await page.getByLabel("昵称",{exact:true}).fill("界面验收合成学生");
  await page.getByLabel("口令",{exact:true}).fill("synthetic-product-test-2026");
  await page.getByRole("button",{name:"创建账号",exact:true}).click();
  await page.getByRole("heading",{name:"我的课程",exact:true}).waitFor();
  await page.goto(base+"/student/learn?mode=live");
  const config=await (await page.request.get(base+"/api/v2/config")).json();
  const realModel=config.model!=="离线演示";
  if(realModel&&process.env.MIRROR_LIVE_MODEL_TEST!=="1")throw Error("Real model configured. Set MIRROR_LIVE_MODEL_TEST=1 to authorize a paid synthetic browser check.");
  await page.locator(".problemList button").first().click();
  await page.getByRole("button",{name:"我卡住了，给点提示",exact:true}).click();
  if(realModel){await page.locator(".turn").first().waitFor({timeout:170000});assert.equal(await page.locator(".turn").count(),1);}
  else{await page.getByRole("alert").filter({hasText:"课程助手暂不可用"}).waitFor();assert.equal(await page.locator(".turn").count(),0);}
  await page.getByRole("button",{name:"我做出来了",exact:true}).click();
  await page.getByText("已保存反馈",{exact:true}).waitFor();
  await page.goto(base+"/student?mode=live");
  await page.locator(".recentLearning").first().click();
  await page.locator(".currentProblem").waitFor();
  await page.goto(base+"/student/observations?mode=live");
  await page.getByText("学生自报做出来了，独立性未验证",{exact:true}).waitFor();
  await page.goto(base+"/student/privacy?mode=live");
  const dl=page.waitForEvent("download");await page.getByRole("button",{name:"导出我的档案"}).click();await dl;
  await page.goto(base+"/teacher?mode=live");
  await page.getByRole("heading",{name:"当前账号没有教师权限"}).waitFor();
  assert.equal(await page.getByRole("heading",{name:"教学总览",exact:true}).count(),0);
  await page.getByRole("button",{name:"退出登录",exact:true}).click();
  await page.getByRole("button",{name:"登录",exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log("PASS: real local API registration, persistent attempt and feedback, recent-learning navigation, privacy export, role denial, logout; model mode="+(realModel?"official-live":"unavailable"));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
