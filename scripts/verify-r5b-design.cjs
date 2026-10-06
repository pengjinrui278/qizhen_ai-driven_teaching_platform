const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
const course={course_id:'mathematical_analysis',display_name:'数学分析'};
const sessions=[new Date(),yesterday,new Date('2026-01-01')].map((date,i)=>({id:'s'+i,course_id:course.course_id,title:'一致收敛 · 证明思路 '+i,created_at:date.toISOString(),problem:{text:'合成原题'},events:[{request_id:'r'+i,message:'合成原题',response:{answer:'合成历史回答 '+i}}]}));
let overview=false;
await p.route('**/api/v2/**',async r=>{const u=new URL(r.request().url()),path=u.pathname.replace('/api/v2','');let value=[];
if(path==='/me')value={id:'fixture-r5b',role:'student',status:'active'};
if(path==='/courses')value=[course];if(path==='/config')value={};
if(path==='/attempts')value=sessions;if(path.startsWith('/attempts/'))value=sessions.find(s=>s.id===path.split('/')[2]);
if(path==='/memory'){overview=u.searchParams.get('include_activities')==='false';assert.ok(overview);value={observations:[],hypotheses:[]};}
await r.fulfill({json:value});});
await p.goto('http://127.0.0.1:3011/student/learn?mode=live');await p.locator('.chatHistoryGroup').last().waitFor();
assert.equal(await p.locator('.chatHistoryGroup').count(),3);
const row=p.locator('.chatSessionList button').first();await row.focus();assert.equal(await row.locator('.chatHistoryTime').count(),0);assert.match(await row.getAttribute('title'),/^创建于 /);await row.click();await p.getByText('合成历史回答 0',{exact:true}).waitFor();
await p.getByRole('button',{name:'收起左栏',exact:true}).click();await p.getByRole('button',{name:'展开左栏',exact:true}).click();
await p.screenshot({path:'data/preview/r5b-chat.png',fullPage:true});
await p.goto('http://127.0.0.1:3011/student/observations?mode=live');await p.getByText('暂不足以判断课程进展。',{exact:true}).waitFor();assert.ok(overview);assert.equal(await p.locator('.lf-session').count(),0);assert.equal(await p.locator('.lf-feedback-details').getAttribute('open'),null);
await p.screenshot({path:'data/preview/r5b-feedback.png',fullPage:true});
await p.setViewportSize({width:390,height:844});await p.goto('http://127.0.0.1:3011/student/learn?mode=live');await p.getByRole('button',{name:'打开对话列表',exact:true}).click();await p.locator('.chatHistoryGroup').last().waitFor();assert.ok(await p.locator('.chatHistoryGroup').first().isVisible());await p.keyboard.press('Escape');assert.equal(await p.getByRole('button',{name:'打开对话列表',exact:true}).evaluate(e=>document.activeElement===e),true);
assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('PASS: grouped history, focus timestamp, rail, compact feedback, lean API, mobile drawer');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
