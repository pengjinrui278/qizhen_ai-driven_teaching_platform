// All API data below is synthetic demonstration data; never writes a real backend.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const base=process.env.MIRROR_WEB_PREVIEW_URL||'http://127.0.0.1:3011';
const target=process.argv[2]||'chat';const out=path.resolve('artifacts/ui-b2',target);fs.mkdirSync(out,{recursive:true});
const courses=[{course_id:'mathematical_analysis',display_name:'数学分析',available:true},{course_id:'university_physics',display_name:'大学物理',available:true}];
const formula=String.raw`\[\begin{aligned}f(x)&=\sum_{k=1}^{n}\frac{x^k}{k}+\int_0^1 t^2\,dt+\frac{a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8}{1+x^2}\\g(x)&=\begin{cases}x^2&x>0\\0&x\le0\end{cases}\end{aligned}\]`;
const book={source_id:'book-a',title:'示例教材：数学分析',volume:'上册',edition:'演示版',chapter_count:2,chunk_count:2};
const exam={paper_id:'exam-a',course_id:courses[0].course_id,title:'示例试卷：条件、量词与证明',year:2025,exam_type:'期末',semester:'秋',question_count:1,has_answers:false};
const boxes=[{id:'box-a',title:'示例作业：核对定义中的量词与依赖',course_id:courses[0].course_id,assignment:'请解释每个量词的含义，并说明条件之间的依赖。'.repeat(5),expires_at:'2026-09-29T10:00:00Z',status:'open',purged:false,retention_hours:72},{id:'box-b',title:'示例作业：运动学条件',assignment:'本项已结束，不再接受提交。',expires_at:'2026-09-20T10:00:00Z',status:'closed',purged:false}];
let user={id:'fixture',nickname:'示例同学',role:'student',status:'active',retention_days:90};
let session={id:'attempt-a',course_id:courses[0].course_id,problem:{text:'如何核对下面推导的适用条件？'},events:[{request_id:'original',message:'如何核对下面推导的适用条件？',mode:'first_hint',response:{answer:'先找出变量的取值范围，再检查边界。\n\n'+formula+'\n\n你能指出其中需要补充的条件吗？',hint_level:1,citations:[{source_id:'book-a',locator:'示例教材 · 第 12 页'}]}}]};
async function main(){
 if(target==='resources'){console.log('R3 supersedes the chunk reader: running catalog/PDF verification.');const r=require('node:child_process').spawnSync(process.execPath,['scripts/verify-web-library-r3.cjs'],{stdio:'inherit',env:process.env});if(r.error)throw r.error;if(r.status!==0)throw Error('R3 library tests failed');return;}
 const browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});const page=await context.newPage();
 const errors=[],writes=[],external=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-09-26T06:00:00Z')});
 let empty=false,guest=false,resourceFail=false,assignmentFail=false;const held=new Map();
 function hold(key){let release,started;const start=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No request received: '+key)),15000);started=()=>{clearTimeout(timer);resolve();};});const result=new Promise(r=>{release=r;});held.set(key,{started,result});return {start,release,key};}
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==new URL(base).origin){external.push(url.href);await route.abort();return;}
  if(!url.pathname.startsWith('/api/v2/')){await route.continue();return;}
  const p=url.pathname.slice(7),key=decodeURI(p+url.search),method=route.request().method();let data=[];
  if(held.has(key)){const pending=held.get(key);held.delete(key);pending.started();const result=await pending.result;await route.fulfill({status:result.status||200,json:result.data});return;}
  if(p==='/me'){if(guest){await route.fulfill({status:401,json:{detail:'请登录'}});return;}data=user;if(method==='PATCH'){writes.push({p,body:route.request().postDataJSON()});user={...user,...route.request().postDataJSON()};data=user;}}
  else if(p==='/config')data={default_retention_hours:72};
  else if(p==='/courses')data=courses;
  else if(p==='/memory')data={observations:[],hypotheses:[]};
  else if(p==='/sandboxes'){if(assignmentFail){await route.fulfill({status:503,json:{detail:'示例作业暂不可用'}});return;}data=empty||user.role!=='student'?[]:boxes;}
  else if(p==='/attempts'){data=method==='POST'?session:empty?[]:[session];}
  else if(p==='/attempts/attempt-a')data=session;
  else if(p.endsWith('/messages/stream')){const b=route.request().postDataJSON();writes.push({p,body:b});session.events.push({request_id:b.request_id,message:b.message,response:{answer:'请继续核对条件。'+formula,citations:[]}});await route.fulfill({contentType:'text/event-stream',body:'event: progress\ndata: {"stage":"checking"}\n\nevent: done\ndata: {"answer":"请继续核对条件。"}\n\n'});return;}
  else if(p==='/recognize')data={text:'识别后的示例题干，请核对。'};
  else if(p==='/textbooks/related')data=[{chunk_id:'related-a',chapter:'极限与条件',locator:'示例教材 · 第12页',content:'这是供界面验收的示例教材段落，请核对定义中的条件。'}];
  else if(p==='/textbooks'||p==='/exams'){
   if(resourceFail){await route.fulfill({status:503,json:{detail:'示例资源加载失败'}});return;}
   data=empty||url.searchParams.get('course_id')!==courses[0].course_id?[]:p==='/textbooks'?[book]:[exam];
  }
  else if(p==='/textbooks/search')data=empty?[]:[{chunk_id:'chunk-a',source_id:'book-a',title:'条件 <img src=x onerror="window.fixtureXss=true">',chapter:'第一章',locator:'示例教材 · 第12页',content:'条件与量词的示例片段。'+formula}];
  else if(p.endsWith('/chapters'))data=[{chapter:'第一章'},{chapter:'第二章'}];
  else if(p.endsWith('/chunks'))data=[{chunk_id:'chunk-a',title:'theorem · 条件与量词',content:'当前章节：'+url.searchParams.get('chapter')+'\n\n'+formula}];
  else if(p==='/exams/exam-a')data={paper:exam,questions:[{question_id:'q-a',number:1,statement:'这是一道用于验收的示例题干。'.repeat(12)+'\n\n'+formula,answer:null,solution:null}]};
  else if(p==='/me/export')data={user_id:user.id,records:['仅为演示导出']};
  else if(p==='/me/delete'){writes.push({p,body:route.request().postDataJSON()});guest=true;data={};}
  else if(method!=='GET'){writes.push({p,body:route.request().postDataJSON()});data={};}
  await route.fulfill({json:data});
 });
 async function complete(pending,result){const response=page.waitForResponse(r=>{const u=new URL(r.url());return decodeURI(u.pathname.slice(7)+u.search)===pending.key;});pending.release(result);await (await response).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
 async function goto(route){await page.goto(base+route);await page.locator('.lmStudentSidebar').waitFor();}
 async function shot(name){await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:path.join(out,name+'.png'),fullPage:true,animations:'disabled'});}
 async function views(selector){await page.locator(selector).first().waitFor();for(const [width,height,label] of [[1440,900,'desktop'],[390,844,'mobile'],[768,1024,'tablet']]){await page.setViewportSize({width,height});await shot(label);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,target+' overflow at '+width);}await page.setViewportSize({width:1440,height:900});}
 try{
  if(target==='chat'){
   await goto('/student/learn?mode=live&course=mathematical_analysis&attempt=attempt-a');await page.locator('.chatAssistant .katex-display').waitFor();await views('.chatAssistant');
   await page.setViewportSize({width:390,height:844});
   await page.getByLabel('发送消息',{exact:true}).fill('第一行想法\n第二行条件\n第三行问题');await page.waitForFunction(()=>{const el=document.querySelector('[aria-label="发送消息"]');return el.scrollHeight<=el.clientHeight+1;});
   await page.getByLabel('发送消息',{exact:true}).fill('手机输入可达');assert.equal(await page.getByLabel('发送消息',{exact:true}).inputValue(),'手机输入可达');await page.getByLabel('发送消息',{exact:true}).fill('');
   const composer=await page.locator('.chatComposer').boundingBox(),chat=await page.locator('.courseChat').boundingBox();assert.ok(composer.y+composer.height<=chat.y+chat.height+1,'mobile composer must not be clipped');
   await page.setViewportSize({width:1440,height:900});
   assert.equal(await page.locator('.katex-error').count(),0);
   await page.getByText('资料来源',{exact:true}).click();await page.getByText('示例教材 · 第 12 页',{exact:true}).waitFor();
   await page.locator('.chatAttachments').evaluate(el=>el.open=true);
   await page.getByLabel('上传图片',{exact:true}).setInputFiles({name:'example.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
   await page.getByRole('button',{name:'识别文字',exact:true}).click();await page.getByText('极限与条件',{exact:false}).waitFor();
   await page.getByLabel('发送消息',{exact:true}).fill('');await page.getByRole('button',{name:'引用到对话'}).click();assert.ok((await page.getByLabel('发送消息',{exact:true}).inputValue()).includes('参考教材'));
   await shot('related-desktop');await page.getByRole('button',{name:'关闭相关教材'}).click();
   await page.getByRole('button',{name:'新对话',exact:true}).click();await shot('empty-desktop');
   const delayed=hold('/attempts/attempt-a');await page.getByRole('button',{name:'打开对话列表'}).click();await page.locator('.chatSessionList button').first().click();await delayed.start;await page.getByRole('status').filter({hasText:'正在打开对话'}).waitFor();await shot('loading-desktop');delayed.release({data:session});await page.locator('.chatAssistant').first().waitFor();
   const failed=hold('/attempts/attempt-a/messages/stream');await page.getByLabel('发送消息',{exact:true}).fill('界面错误重试验收');await page.getByRole('button',{name:'发送',exact:true}).click();await failed.start;failed.release({status:503,data:{detail:'示例连接暂不可用'}});await page.getByRole('alert').filter({hasText:'示例连接'}).waitFor();await shot('error-desktop');await page.getByRole('button',{name:'重试',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.chatThinking'));
  }
  if(target==='assignments'){
   await goto('/student/assignments?mode=live');await views('.assignmentCards article');
   await page.setViewportSize({width:390,height:844});await page.locator('.lmAssignmentRequirements summary').first().click();await page.getByText(boxes[0].assignment,{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await shot('requirements-mobile');await page.locator('.lmAssignmentRequirements summary').first().click();await page.setViewportSize({width:1440,height:900});
   await page.getByLabel('作业码',{exact:true}).fill('EXAMPLE');await page.getByRole('button',{name:'加入作业'}).click();await page.getByText('已加入',{exact:true}).waitFor();
   const list=hold('/sandboxes');await page.getByRole('button',{name:'加入作业'}).click();await list.start;await page.getByRole('status').filter({hasText:'正在加载作业'}).waitFor();await shot('loading-desktop');list.release({data:boxes});await page.waitForFunction(()=>!document.querySelector('.lmAssignmentsLoading'));
   await page.getByRole('button',{name:'提交作业',exact:true}).click();await page.getByLabel('作答内容',{exact:true}).fill('示例作答，用户确认后才提交。');await page.getByRole('button',{name:'确认提交',exact:true}).click();assert.equal(writes.filter(w=>w.p.endsWith('/submissions')).length,0);
   await page.getByLabel('将此内容提交给教师').check();await page.getByRole('button',{name:'确认提交',exact:true}).click();await page.getByText('已提交',{exact:true}).waitFor();const submission=writes.find(w=>w.p.endsWith('/submissions'));assert.equal(submission.body.explicit_submission,true);assert.equal(submission.body.synthetic,false);
   empty=true;await page.reload();await page.getByText('暂无作业',{exact:true}).waitFor();await shot('empty-desktop');empty=false;
   // Target component reload without turning the parent Portal request into an auth error.
   assignmentFail=true;await page.getByLabel('作业码',{exact:true}).fill('RETRY');await page.getByRole('button',{name:'加入作业'}).click();await page.getByRole('alert').filter({hasText:'示例作业'}).waitFor();await shot('error-desktop');assignmentFail=false;await page.getByRole('button',{name:'重新加载作业'}).click();await page.locator('.assignmentCards article').first().waitFor();
  }
  if(target==='privacy'){
   await goto('/student/privacy?mode=live');await views('.lmStudentPrivacy');
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出我的档案'}).click();assert.equal((await download).suggestedFilename(),'my-mathmirror.json');
   await page.getByLabel('个人详细记录保留天数').fill('30');await page.getByLabel('档案状态',{exact:true}).selectOption('frozen');await page.getByRole('button',{name:'保存个人策略'}).click();await page.getByText('已保存',{exact:true}).waitFor();assert.deepEqual(writes.find(w=>w.p==='/me').body,{retention_days:30,status:'frozen'});
   const fail=hold('/me');await page.getByRole('button',{name:'保存个人策略'}).click();await fail.start;await shot('loading-desktop');fail.release({status:403,data:{detail:'示例权限不足'}});await page.getByRole('alert').filter({hasText:'示例权限不足'}).waitFor();await shot('error-desktop');
   delete user.retention_days;await page.reload();await page.getByText('服务暂未提供保留天数，请确认后填写。',{exact:true}).waitFor();assert.equal(await page.getByLabel('个人详细记录保留天数').inputValue(),'');await shot('missing-policy-desktop');
   await page.getByText('删除账号和个人学习记录',{exact:true}).click();await page.getByLabel('再次输入口令').fill('example-password');page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'删除我的账号'}).click();assert.equal(writes.filter(w=>w.p==='/me/delete').length,0);
   page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'删除我的账号'}).click();await page.waitForURL('**/login');assert.equal(writes.find(w=>w.p==='/me/delete').body.confirmed,true);
  }
  if(target==='scopes'||target==='baseline'){
   const scope={};
   for(const [name,route,selector] of [['feedback','/student/observations','.feedbackPage'],['ai','/student/ai','.aiLearning'],['teacher','/teacher','.portalSidebar'],['login','/login','.loginSurface']]){
    user.role=name==='teacher'?'teacher':'student';guest=name==='login';await page.goto(base+route);await page.locator(selector).waitFor();await shot(name);
    scope[name]=await page.locator(selector).evaluate(el=>{const s=getComputedStyle(el);return Object.fromEntries(['color','backgroundColor','fontSize','padding','borderRadius','fontFamily'].map(k=>[k,s[k]]));});
   }
   if(target==='baseline')fs.writeFileSync(path.join(out,'styles.json'),JSON.stringify(scope,null,2));else {const previous=JSON.parse(fs.readFileSync('artifacts/ui-b2/baseline/styles.json'));delete scope.ai;delete previous.ai;assert.deepEqual(scope,previous);console.log('AI chat is intentionally restyled by R3; verified separately by verify-web-r3.cjs.');}
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const result={page:target,passed:true,synthetic:true,base,writes:writes.map(w=>w.p),screenshots:fs.readdirSync(out).filter(n=>n.endsWith('.png'))};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
