// Explicit local browser smoke test: synthetic account, at most two paid model calls.
const {chromium}=require("playwright");
async function main(){
 if(!process.argv.includes("--live"))throw new Error("Pass --live for two real model calls");
 const base=process.env.MIRROR_TEST_WEB||"http://127.0.0.1:3010";
 if(!base.startsWith("http://127.0.0.1:"))throw new Error("Local test only");
 const browser=await chromium.launch({channel:"msedge",headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const password="synthetic-test-"+Date.now();
 const username="ai_smoke_"+Date.now();
 const headers={"X-Mirror-Request":"1"};
 try{
  const reg=await context.request.post(base+"/api/v2/auth/register",{headers,data:{username,password,nickname:"界面验收",role:"student"}});
  if(reg.status()!==200)throw new Error("Registration "+reg.status());
  await page.goto(base+"/student/ai");
  await page.getByRole("textbox",{name:"你的问题"}).fill("根据《人工智能基础》，尼尔逊是怎样定义人工智能的？请注明出处。");
  await page.getByRole("button",{name:"发送",exact:true}).click();
  await page.getByRole("button",{name:"整理为笔记"}).first().waitFor({timeout:150000});
  await page.getByText("教材依据",{exact:true}).click();
  if(!await page.getByText(/PDF 第 15 页/).count())throw new Error("Missing source");
  await page.screenshot({path:"data/ai-preview/chat-desktop.png",fullPage:true});
  await page.getByRole("button",{name:"整理为笔记"}).first().click();
  await page.getByRole("textbox",{name:"笔记标题"}).fill("人工智能的定义");
  await page.getByRole("button",{name:"确认保存"}).click();
  await page.getByText("笔记已保存",{exact:true}).waitFor();
  await page.getByRole("textbox",{name:"你的问题"}).fill("请读出图片中的书名，仅回答书名。");
  await page.getByLabel("上传图片",{exact:true}).setInputFiles("data/ai-preview/page-1.png");
  await page.getByRole("button",{name:"发送",exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll(".aiAnswer").length===2,{},{timeout:150000});
  await page.getByRole("navigation",{name:"AI 学习导航"}).getByRole("link",{name:"我的笔记"}).click();
  await page.getByRole("heading",{name:"人工智能的定义"}).waitFor();
  await page.getByRole("button",{name:"编辑",exact:true}).click();
  await page.getByRole("textbox",{name:"笔记内容"}).fill("我确认并修订了这条笔记。");
  await page.getByRole("button",{name:"确认保存"}).click();
  await page.getByText("我确认并修订了这条笔记。",{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  for(const route of ["","resources","notes","tools","setup"]){
   await page.goto(base+"/student/ai"+(route?"/"+route:""));
   await page.getByRole("heading",{name:"AI 学习",exact:true}).waitFor();
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error("Mobile overflow "+route);
   await page.screenshot({path:"data/ai-preview/mobile-"+(route||"chat")+".png",fullPage:true});
  }
  const exported=await context.request.get(base+"/api/v2/me/export");
  const data=await exported.json();
  if(data.ai_learning.ai_messages.length!==2||data.ai_learning.ai_notes.length!==1)throw new Error("Export failed");
  if(errors.length)throw new Error(errors.join("\n"));
  console.log(JSON.stringify({passed:true,real_model_calls:2,source_pdf_page:15,mobile_routes:5,notes:"create/edit/export",browser_errors:0}));
 }finally{
  const del=await context.request.post(base+"/api/v2/me/delete",{headers,data:{password,confirmed:true}});
  console.log("Synthetic account deleted:",del.status()===200);
  await browser.close();
  if(del.status()!==200)throw new Error("Synthetic account cleanup failed: "+del.status());
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
