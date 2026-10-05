// Browser regression with synthetic API responses; no account or paid model calls.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const previewUrl=process.env.MIRROR_WEB_PREVIEW_URL||'http://127.0.0.1:3010';
async function main(){
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1365,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const course={course_id:'mathematical_analysis',display_name:'数学分析',profile_id:'chen-jixiu-3e',available:true};
 const session={id:'fixture-attempt',course_id:course.course_id,problem:{text:'合成验收问题'},events:[]};
 let calls=0,firstRequest='',ocrReply=null;
 await page.route('**/api/v2/**',async route=>{
  const path=new URL(route.request().url()).pathname.replace('/api/v2','');let data=[];
  if(path==='/recognize'){
   assert.ok(ocrReply,'Recognition must be explicitly controlled by the test');
   const reply=ocrReply;ocrReply=null;reply.started();
   const result=await reply.result;
   await route.fulfill({status:result.status||200,contentType:'application/json',body:JSON.stringify(result.body)});return;
  }
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
  console.log('Preview: '+previewUrl);
  await page.goto(new URL('/student/learn?mode=live',previewUrl).href);
  await page.getByLabel('发送消息',{exact:true}).fill('请提示我如何核对条件');
  await page.getByLabel('发送消息',{exact:true}).press('Enter');
  await page.getByRole('alert').filter({hasText:'验收用暂时故障'}).waitFor();
  await page.getByRole('button',{name:'重试',exact:true}).click();
  await page.locator('.chatAssistant .katex-display').waitFor();
  assert.equal(await page.locator('.katex-error').count(),0);
  await page.getByRole('button',{name:'新对话',exact:true}).click();
  assert.equal(await page.locator('.chatAssistant').count(),0);
  assert.equal(await page.getByLabel('发送消息',{exact:true}).inputValue(),'');
  if(!await page.locator('.chatSessionList button').first().isVisible()) await page.getByRole('button',{name:'打开对话列表'}).click();
  await page.locator('.chatSessionList button').first().click();
  await page.locator('.chatAssistant .katex-display').waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const failures=[];
  const check=(condition,message)=>{if(!condition)failures.push(message);};
  const draft=page.getByLabel('发送消息',{exact:true});
  async function upload(){
   await page.locator('.chatAttachments').evaluate(el=>{el.open=true;});
   await page.getByLabel('上传图片',{exact:true}).setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
   await page.getByAltText('待识别图片').waitFor();
   await page.getByRole('button',{name:'识别文字',exact:true}).waitFor();
  }
  async function beginRecognition(){
   let release,started;
   const start=new Promise(resolve=>{started=resolve;});
   ocrReply={started,result:new Promise(resolve=>{release=resolve;})};
   await page.getByRole('button',{name:'识别文字',exact:true}).click();await start;
   return async(body,status=200)=>{
    const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/recognize'));
    release({body,status});await (await response).finished();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   };
  }
  for(const target of ['new','history'])for(const outcome of ['success','failure']){
   await page.getByRole('button',{name:'新对话',exact:true}).click();await upload();
   const finish=await beginRecognition();
   if(target==='new')await page.getByRole('button',{name:'新对话',exact:true}).click();
   else{
    if(!await page.locator('.chatSessionList button').first().isVisible()) await page.getByRole('button',{name:'打开对话列表'}).click();
    await page.locator('.chatSessionList button').first().click();
    await page.locator('.chatAssistant .katex-display').waitFor();
   }
   check(await page.getByAltText('待识别图片').count()===0,target+': preview must reset');
   await draft.fill('当前对话草稿');
   await finish(outcome==='success'?{text:'旧图片识别结果'}:{detail:'旧识别失败'},outcome==='success'?200:503);
   check(await draft.inputValue()==='当前对话草稿',target+': stale recognition must not fill draft');
   check(await page.locator('.relatedPanel').count()===0,target+': stale recognition must not search textbooks');
   check(await page.locator('.courseChat [role="alert"]').count()===0,target+': stale errors must be ignored');
  }
  await page.getByRole('button',{name:'新对话',exact:true}).click();await upload();
  const removed=await beginRecognition();
  const remove=page.getByRole('button',{name:'移除图片',exact:true});
  const canRemove=await remove.isEnabled();check(canRemove,'remove: must be available during recognition');
  if(canRemove)await remove.click();
  await draft.fill('移除后的草稿');await removed({text:'已移除图片的迟到结果'});
  check(await draft.inputValue()==='移除后的草稿','remove: stale recognition must not fill draft');
  if(canRemove)check(await page.getByAltText('待识别图片').count()===0,'remove: preview must disappear');
  await page.getByRole('button',{name:'新对话',exact:true}).click();await upload();
  const failed=await beginRecognition();await failed({detail:'合成识别故障'},503);
  await page.getByRole('alert').filter({hasText:'暂时无法识别'}).waitFor();
  check(await page.getByAltText('待识别图片').count()===1,'retry: keep preview after failure');
  const retried=await beginRecognition();await retried({text:'请确认的合成题干'});
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="发送消息"]').value==='请确认的合成题干');
  check(await page.locator('.courseChat [role="alert"]').count()===0,'retry: clear old error');
  check(calls===2,'OCR must not automatically send a chat message');
  // A late failure from a removed image must not overwrite the next image's success.
  await page.getByRole('button',{name:'新对话',exact:true}).click();await upload();
  const staleFailure=await beginRecognition();
  if(await remove.isEnabled()){
   await remove.click();await upload();const latest=await beginRecognition();
   await staleFailure({detail:'旧图片失败'},503);
   check(await page.getByRole('button',{name:'处理中…',exact:true}).isDisabled(),'replacement: stale completion must not unlock current request');
   await latest({text:'新图片文字'});
   check(await draft.inputValue()==='新图片文字','replacement: preserve latest text');
   check(await page.locator('.courseChat [role="alert"]').count()===0,'replacement: ignore stale errors');
  }else await staleFailure({detail:'旧图片失败'},503);
  assert.deepEqual(errors,[]);
  assert.deepEqual(failures,[]);
  console.log('PASS: SSE retry identity, math, history, mobile width, photo reset, stale OCR isolation, removal, failure/retry, manual confirmation');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
