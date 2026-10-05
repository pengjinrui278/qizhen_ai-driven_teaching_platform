// Offline R3 UI verification. Every API and asset response is synthetic.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const base=process.env.MIRROR_WEB_PREVIEW_URL||'http://127.0.0.1:3011',target=process.argv[2]||'ai';
const out=path.resolve('artifacts/r3',target);fs.mkdirSync(out,{recursive:true});
const courses=[{course_id:'electronic_circuits',display_name:'电子电路基础',available:true},{course_id:'topology',display_name:'点集拓扑',available:true}];
const formula=String.raw`先区分定义与应用。\[\begin{aligned}f(x)&=\sum_{k=1}^{n}\frac{x^k}{k}\\g(x)&=\begin{cases}x^2&x>0\\0&x\le0\end{cases}\end{aligned}\]这是一段演示回答。`;
async function main(){
 const browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();const errors=[],external=[],requests=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 let messages=[],notes=[],failSend=true;
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==new URL(base).origin){external.push(u.href);await route.abort();return;}if(!u.pathname.startsWith('/api/v2/')){await route.continue();return;}const p=u.pathname.slice(7),method=route.request().method();requests.push(p);let data=[];
 if(p==='/me')data={id:'fixture',nickname:'示例同学',role:'student',status:'active',retention_days:90};
 else if(p==='/courses')data=courses;
 else if(p==='/memory')data={observations:[],hypotheses:[]};
 else if(p==='/config')data={default_retention_hours:72};
 else if(p==='/ai/sessions')data=method==='POST'?{id:'ai-one',title:'示例AI会话'}:[{id:'ai-one',title:'示例AI会话'}];
 else if(p==='/ai/sessions/ai-one')data={id:'ai-one',title:'示例AI会话',messages};
 else if(p==='/ai/sessions/ai-one/messages'){const body=route.request().postDataJSON();writes.push({p,body});if(failSend){failSend=false;await route.fulfill({status:503,json:{detail:'示例请求失败，请重试'}});return;}messages=[{id:'m-one',question:body.text,answer:formula,has_image:!!body.image,citations:[{id:'source-one',title:'示例AI资料',pdf_page:12,heading:'定义与条件'}]}];data={};}
 else if(p==='/ai/notes'){if(method==='POST'){notes=[{id:'note-one',...route.request().postDataJSON(),citations:[]}];data=notes[0];}else data=notes;}
 await route.fulfill({json:data});});
 async function shot(name){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,name+'.png'),fullPage:true,animations:'disabled'});}
 try{
 if(target==='ai'){
 await page.goto(base+'/student/ai?mode=live');await page.getByRole('heading',{name:'从一个问题开始'}).waitFor();await shot('empty-desktop');
 await page.getByLabel('你的问题',{exact:true}).fill('示例：怎样理解这些条件？');await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByRole('alert').filter({hasText:'示例请求失败'}).waitFor();await shot('error-desktop');await page.getByRole('button',{name:'发送',exact:true}).click();await page.locator('.aiAnswer .katex-display').waitFor();assert.equal(writes[0].body.request_id,writes[1].body.request_id);assert.equal(await page.locator('.katex-error').count(),0);
 await page.getByText('教材依据',{exact:true}).click();await page.getByText(/PDF 第 12 页/).waitFor();
 for(const [width,height,name] of [[1440,900,'desktop'],[390,844,'mobile'],[768,1024,'tablet']]){await page.setViewportSize({width,height});await shot(name);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
 await page.getByRole('button',{name:'整理为笔记'}).click();await page.getByLabel('笔记标题').fill('示例笔记');await page.getByRole('button',{name:'确认保存'}).click();await page.getByText('笔记已保存',{exact:true}).waitFor();
 await page.getByRole('button',{name:'打开AI对话列表'}).click();await page.getByRole('button',{name:'新对话',exact:true}).click();assert.equal(await page.locator('.aiAnswer').count(),0);
 await page.getByRole('button',{name:'打开AI对话列表'}).click();await page.getByRole('button',{name:'示例AI会话',exact:true}).click();await page.locator('.aiAnswer').waitFor();
 assert.equal(await page.locator('.hintToolbar').count(),0);assert.ok(!requests.some(p=>p.startsWith('/attempts/')||p.startsWith('/sandboxes/')||p==='/recognize'));
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);const result={passed:true,synthetic:true,base,target,writes:writes.map(w=>w.p)};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(result);
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
