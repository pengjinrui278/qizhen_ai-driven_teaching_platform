// Original application, intercepted synthetic API only. Never contacts the database.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.MIRROR_WEB_PREVIEW_URL||'http://127.0.0.1:3011';
const out='artifacts/r4';fs.mkdirSync(out,{recursive:true});
const before=process.argv.includes('--before');
const formula=String.raw`\[f(x)=\sum_{k=1}^{n}\frac{x^k}{k}+\frac{a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9+a_{10}}{1+x^2}\]`;
const courses=[{course_id:'mathematical_analysis',display_name:'数学分析'},{course_id:'university_physics',display_name:'大学物理'},{course_id:'python_programming',display_name:'Python'},{course_id:'electronic_circuits',display_name:'电子电路基础'},{course_id:'psychology_applications',display_name:'心理学及应用'},{course_id:'college_english',display_name:'大学英语'}];
const original={id:'a',course_id:courses[0].course_id,problem:{text:'合成长对话'},events:Array.from({length:24},(_,i)=>({request_id:'old-'+i,message:'条件 '+i,response:{answer:'请检查条件。\n\n'+formula+'\n\n'+('这是用于滚轮测试的合成段落。'.repeat(10)),hint_level:2}}))};
async function main(){
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();
 let sessions=[structuredClone(original)],failList=false,failStream=false,delayStream=null,user='fixture-a';const writes=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==new URL(base).origin)return r.abort();if(!u.pathname.startsWith('/api/'))return r.continue();
 const p=u.pathname.replace('/api/v2',''),method=r.request().method();let data=[];
 if(p==='/me')data={id:user,nickname:'合成同学',role:'student',status:'active'};
 else if(p==='/courses')data=courses;
 else if(p==='/memory')data={observations:[],hypotheses:[]};
 else if(p==='/config')data={};
 else if(p==='/attempts'){
  if(method==='POST'){const b=r.request().postDataJSON();data={id:'new-'+sessions.length,course_id:b.course_id,problem:{text:b.text},events:[]};sessions.push(data);}
  else if(failList)return r.fulfill({status:503,json:{detail:'合成历史加载失败'}});
  else data=sessions;
 }else if(p.endsWith('/messages/stream')){
  const b=r.request().postDataJSON();writes.push(b);if(delayStream)await delayStream;
  if(failStream)return r.fulfill({status:503,json:{detail:'合成回复失败'}});
  const a=sessions.find(a=>p.includes('/'+a.id+'/'));a.events.push({request_id:b.request_id,message:b.message,response:{answer:'合成成功回复 '+formula}});
  return r.fulfill({contentType:'text/event-stream',body:'event: done\ndata: {"answer":"合成成功回复"}\n\n'});
 }else if(p.startsWith('/attempts/')){data=sessions.find(a=>a.id===p.split('/')[2]);if(!data)return r.fulfill({status:404,json:{detail:'无权访问此记录'}});}
 await r.fulfill({json:data});});
 const url=base+'/student/learn?mode=live&course=mathematical_analysis&attempt=a';
 const scroll=()=>page.locator('.chatWorkspace');
 const top=()=>scroll().evaluate(e=>e.scrollTop);
 async function wheel(selector,delta){const e=page.locator(selector).last();await e.scrollIntoViewIfNeeded();const b=await e.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+Math.min(10,b.height/2));const t=await top();await page.mouse.wheel(0,delta);await page.waitForTimeout(250);return {before:t,after:await top()};}
 async function send(text){await page.getByLabel('发送消息',{exact:true}).fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();await page.locator('.chatThinking').waitFor({state:'hidden'});}
 try{
  if(!before){failList=true;await page.goto(url);await page.getByRole('alert').filter({hasText:'历史加载失败'}).waitFor();assert.equal(await page.getByText('暂无对话',{exact:true}).count(),0);assert.ok(await page.getByLabel('聊天课程').locator('option').count()>0);failList=false;await page.getByRole('button',{name:'重新加载历史'}).click();}
  else await page.goto(url);await page.locator('.chatAssistant').last().waitFor();
  const baseline={};for(const [name,sel] of [['text','.chatAssistant p'],['formula','.katex-display'],['input','.chatComposer textarea']])baseline[name]=await wheel(sel,-350);
  const box=await scroll().boundingBox();await page.mouse.move(box.x+box.width-24,box.y+box.height/2);const blankStart=await top();await page.mouse.wheel(0,-350);await page.waitForTimeout(250);baseline.blank={before:blankStart,after:await top()};
  fs.writeFileSync(out+(before?'/wheel-before.json':'/wheel-after.json'),JSON.stringify(baseline,null,2));
  if(before){console.log(baseline);return;}
  for(const [name,r] of Object.entries(baseline))assert.ok(r.after<r.before,name+' must scroll with actual wheel');
  assert.equal(await page.locator('.hintButtons').count(),0,'history must not replay completion timers');
  await page.getByRole('button',{name:'新对话',exact:true}).click();assert.ok(!new URL(page.url()).searchParams.has('attempt'));
  const finished=page.waitForResponse(r=>r.url().endsWith('/messages/stream')).then(()=>Date.now());await send('新建合成问题');assert.ok(new URL(page.url()).searchParams.get('attempt').startsWith('new-'));
  assert.equal(await page.locator('.hintButtons').count(),0);await page.locator('.hintButtons').waitFor();assert.ok(Date.now()-await finished>=2900,'real completion delay');await page.screenshot({path:out+'/actions-desktop.png',fullPage:true});
  const saved=page.url();await page.reload();await page.locator('.chatAssistant').waitFor();assert.equal(page.url(),saved);assert.equal(await page.locator('.hintButtons').count(),0);
  await page.goto(base+'/student?mode=live');await page.goBack();await page.locator('.chatAssistant').waitFor();assert.equal(page.url(),saved);
  await page.getByLabel('聊天课程').selectOption('university_physics');assert.equal(await page.locator('.chatAssistant').count(),0);assert.equal(await page.locator('.chatSessionList button').count(),0);
  await page.getByLabel('聊天课程').selectOption('mathematical_analysis');assert.equal(await page.locator('.chatSessionList button').count(),2);
  failList=true;await send('列表独立失败');await page.getByRole('alert').filter({hasText:'历史加载失败'}).waitFor();assert.equal(await page.getByText('暂无对话',{exact:true}).count(),0);failList=false;await page.getByRole('button',{name:'重新加载历史'}).click();await page.getByRole('alert').filter({hasText:'历史加载失败'}).waitFor({state:'hidden'});
  failStream=true;await send('失败请求');await page.getByRole('alert').filter({hasText:'合成回复失败'}).waitFor();await page.waitForTimeout(3100);assert.equal(await page.locator('.hintButtons').count(),0);
  failStream=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.locator('.chatThinking').waitFor({state:'hidden'});assert.equal(writes.at(-1).request_id,writes.at(-2).request_id);
  await page.getByRole('button',{name:'新对话',exact:true}).click();await page.waitForTimeout(3100);assert.equal(await page.locator('.hintButtons').count(),0,'new cancels actions');
  await page.clock.install();await page.clock.pauseAt(new Date());await send('时钟检查');await page.clock.runFor(2999);assert.equal(await page.locator('.hintButtons').count(),0);await page.clock.runFor(1);await page.locator('.hintButtons').waitFor();
  await page.getByRole('button',{name:'我卡住了',exact:true}).click();await page.locator('.chatThinking').waitFor({state:'hidden'});assert.equal(writes.at(-1).mode,'first_hint');await page.getByLabel('聊天课程').selectOption('university_physics');await page.clock.runFor(4000);assert.equal(await page.locator('.hintButtons').count(),0);
  await send('切历史取消');await page.locator('.chatSessionList button').first().click();await page.clock.runFor(4000);assert.equal(await page.locator('.hintButtons').count(),0);
  await send('卸载取消');await page.goto(base+'/student?mode=live');await page.clock.runFor(4000);await page.goBack();await page.locator('.chatAssistant').last().waitFor();assert.equal(await page.locator('.hintButtons').count(),0);
  await page.clock.resume();await page.goto(url);await page.locator('.chatAssistant').last().waitFor();
  let release;delayStream=new Promise(r=>release=r);await page.getByLabel('发送消息',{exact:true}).fill('不要拉回底部');await page.getByRole('button',{name:'发送',exact:true}).click();await page.locator('.chatThinking').waitFor();await wheel('.chatComposer textarea',-600);const reading=await top();release();delayStream=null;await page.locator('.chatThinking').waitFor({state:'hidden'});assert.ok(Math.abs(await top()-reading)<2,'reply must preserve reading position');
  for(const [width,height] of [[1440,900],[768,1024],[390,844]]){await page.setViewportSize({width,height});await page.screenshot({path:out+'/chat-'+width+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  // Restored history now opens at the beginning; establish a scrollable position with real wheel input.
  await page.mouse.move(220,380);await page.mouse.wheel(0,650);await page.waitForTimeout(300);
  const touchStart=await top();assert.ok(touchStart>0,'touch setup must be below the top');
  const client=await context.newCDPSession(page);await client.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:220,y:380}]});for(let y=400;y<=560;y+=20){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:220,y}]});await page.waitForTimeout(20);}await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);assert.ok(await top()<touchStart,'synthetic touch must scroll');await client.detach();
  await page.getByRole('button',{name:'打开对话列表'}).click();await page.getByRole('button',{name:'收起左栏'}).waitFor();await page.screenshot({path:out+'/history-mobile.png',fullPage:true});await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'收起左栏'}).isVisible(),false);
  await page.goto(base+'/student?mode=live');await page.locator('.lmCourseCard').first().waitFor();assert.equal(await page.locator('.lmCourseCard').count(),courses.length);for(const text of ['理解定义、定理与证明思路','从现象出发，建立物理模型','读懂代码，拆解问题与调试','分析电路，连接原理与计算','理解心理机制，联系生活情境','练习阅读、表达与语言运用'])await page.getByText(text,{exact:true}).waitFor();for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:out+'/home-'+width+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  user='fixture-b';sessions=[];await page.goto(url);await page.getByRole('alert').filter({hasText:'无法打开'}).waitFor();assert.equal(await page.locator('.chatAssistant').count(),0);
  assert.deepEqual(errors,[]);fs.writeFileSync(out+'/results.json',JSON.stringify({passed:true,base,synthetic:true,wheel:baseline,writes:writes.length},null,2));console.log('R4 synthetic checks passed',baseline);
 }catch(e){await page.screenshot({path:out+"/failure.png",fullPage:true});console.log((await page.locator("body").innerText()).slice(0,5000));throw e;}finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
