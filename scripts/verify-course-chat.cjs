// Browser regression with synthetic API responses; no account or paid model calls.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
async function main(){
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1365,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const course={course_id:'mathematical_analysis',display_name:'数学分析',profile_id:'chen-jixiu-3e',available:true};
 const session={id:'fixture-attempt',course_id:course.course_id,problem:{text:'合成验收问题'},events:[]};
 let calls=0,firstRequest='';
 await page.route('**/api/v2/**',async route=>{
  const path=new URL(route.request().url()).pathname.replace('/api/v2','');let data=[];
  if(path==='/me')data={id:'fixture',nickname:'验收',role:'student',status:'active'};
  if(path==='/courses')data=[course];
  if(path==='/memory')data={observations:[],hypotheses:[]};
  if(path==='/attempts')data=route.request().method()==='POST'?session:session.events.length?[session]:[];
  if(path==='/attempts/'+session.id)data=session;
  if(path.endsWith('/messages/stream')){
   const body=route.request().postDataJSON();calls++;
   if(calls===1){firstRequest=body.request_id;await route.fulfill({status:200,contentType:'text/event-stream',body:'event: error\ndata: {"detail":"验收用暂时故障"}\n\n'});return;}
   assert.equal(body.request_id,firstRequest,'Retry must preserve request ID');
   const response={answer:String.raw`先核对这一步：\[\begin{aligned}a&=b+c\\d&=e\end{aligned}\]你能解释条件吗？`,citations:[],hint_level:1};
   session.events=[{request_id:body.request_id,message:body.message,response}];
   await route.fulfill({status:200,contentType:'text/event-stream',body:'event: progress\ndata: {"stage":"checking"}\n\nevent: done\ndata: '+JSON.stringify(response)+'\n\n'});return;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 try{
  await page.goto('http://127.0.0.1:3010/student/learn?mode=live');
  await page.getByLabel('发送消息',{exact:true}).fill('请提示我如何核对条件');
  await page.getByLabel('发送消息',{exact:true}).press('Enter');
  await page.getByRole('alert').filter({hasText:'验收用暂时故障'}).waitFor();
  await page.getByRole('button',{name:'重试',exact:true}).click();
  await page.locator('.chatAssistant .katex-display').waitFor();
  assert.equal(await page.locator('.katex-error').count(),0);
  await page.getByRole('button',{name:'新对话',exact:true}).click();
  assert.equal(await page.locator('.chatAssistant').count(),0);
  assert.equal(await page.getByLabel('发送消息',{exact:true}).inputValue(),'');
  await page.locator('.chatSessionList button').first().click();
  await page.locator('.chatAssistant .katex-display').waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: SSE error/retry identity, math, new conversation reset, history restore, mobile width');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
