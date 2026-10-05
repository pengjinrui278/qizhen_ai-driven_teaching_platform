// Explicit local QA account; one real mathematical query, no personal account impersonation.
const {chromium}=require('playwright');const fs=require('fs');const assert=require('assert/strict');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 const context=await b.newContext({viewport:{width:1440,height:900}});
 const credentials=JSON.parse(fs.readFileSync('data/preview/r4-smoke-account.json','utf8'));
 const base='http://127.0.0.1:3011';const login=await context.request.post(base+'/api/v2/auth/login',{headers:{'X-Mirror-Request':'1'},data:credentials});assert.equal(login.status(),200);
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/student/learn?mode=live&course=mathematical_analysis',{waitUntil:'networkidle'});
 await p.getByLabel('聊天课程',{exact:true}).waitFor({timeout:20000}).catch(async e=>{console.log('Page errors:',errors,'UI:',(await p.locator('body').innerText()).slice(0,700));throw e;});
 assert.equal(await p.getByLabel('聊天课程',{exact:true}).count(),1);assert.equal(await p.getByLabel('当前课程',{exact:true}).count(),0);
 const question='请详细证明：闭区间上连续函数列的一致极限仍连续。重点说明量词顺序与三角不等式，给出完整的主要流程，最后一步估计留给我。';
 await p.getByLabel('发送消息',{exact:true}).fill(question);await p.getByRole('button',{name:'发送',exact:true}).click();
 assert.equal(await p.getByLabel('发送消息',{exact:true}).inputValue(),'');
 await p.locator('.chatThinking').waitFor();console.log('Input cleared immediately; waiting for deep mathematical response');
 let aid;for(let i=0;i<12;i++){aid=new URL(p.url()).searchParams.get('attempt');if(aid)break;await p.waitForTimeout(300);}
 assert.ok(aid);
 let pending;for(let i=0;i<12;i++){const m=await context.request.get(base+'/api/v2/memory');pending=(await m.json()).activities.find(a=>a.attempt_id===aid);if(pending?.status==='pending')break;await p.waitForTimeout(300);}
 assert.equal(pending?.status,'pending');console.log('Activity is visible while generation is pending');
 await p.locator('.chatThinking').waitFor({state:'hidden',timeout:330000});
 assert.equal(await p.locator('.chatError').count(),0);
 await p.locator('.chatAssistant').waitFor();
 const card=p.locator('.chatSessionList button[aria-current=true]');assert.ok((await card.getAttribute('title')).startsWith('创建于'));
 assert.ok((await card.innerText()).length<60);assert.notEqual(await card.innerText(),question.slice(0,55));
 assert.equal(await card.evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');
 await p.screenshot({path:'data/preview/r5-chat.png'});
 const m=await context.request.get(base+'/api/v2/memory');const activity=(await m.json()).activities.find(a=>a.attempt_id===aid);
 assert.equal(activity.status,'answered');assert.equal(activity.question,question);
 await p.goto(base+'/student/observations?mode=live',{waitUntil:'networkidle'});await p.getByLabel('课程会话学习记录').waitFor();
 assert.ok(await p.locator('a[href*="attempt='+aid+'"]').count()>0);
 await p.screenshot({path:'data/preview/r5-feedback.png'});
 await p.goto(base+'/student/resources?mode=live',{waitUntil:'networkidle'});await p.locator('.mlCover img').first().waitFor();assert.equal(await p.locator('.mlCover img').first().evaluate(e=>getComputedStyle(e).objectFit),'cover');
 await p.setViewportSize({width:390,height:844});await p.goto(base+'/student/learn?mode=live&attempt='+aid,{waitUntil:'networkidle'});await p.locator('.chatAssistant').waitFor();
 await p.getByRole('button',{name:'打开对话列表'}).click();await p.getByLabel('聊天课程',{exact:true}).waitFor();await p.getByRole('button',{name:'收起左栏'}).click();
 assert.equal(await p.getByLabel('聊天课程',{exact:true}).isVisible(),false);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 assert.deepEqual(errors,[]);fs.writeFileSync('data/preview/r5-live-result.json',JSON.stringify({passed:true,attempt:aid,activity_status:activity.status}));console.log('PASS: real deep math, immediate clear, one course selector, summarized timestamped history, pending/answered feedback, mobile sidebar, cover fill');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
