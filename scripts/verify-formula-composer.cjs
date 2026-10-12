const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:1000}});const external=[];p.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:3011/'))external.push(r.url());});const errors=[];p.on('pageerror',e=>errors.push(e.message));let attempt=null,payload=null;
 await p.route('**/api/v2/**',async r=>{const path=new URL(r.request().url()).pathname.replace('/api/v2','');let value=[];
 if(path==='/me')value={id:'formula-fixture',role:'student',status:'active'};
 if(path==='/courses')value=[{course_id:'mathematical_analysis',display_name:'数学分析'}];if(path==='/memory')value={observations:[],hypotheses:[]};if(path==='/config')value={};
 if(path==='/attempts'&&r.request().method()==='POST'){attempt={id:'formula-session',course_id:'mathematical_analysis',problem:{text:r.request().postDataJSON().text},events:[]};value=attempt;}
 else if(path==='/attempts')value=attempt?[attempt]:[];
 if(path==='/attempts/formula-session')value=attempt;
 if(path.endsWith('/messages/stream')){payload=r.request().postDataJSON();attempt.events.push({request_id:payload.request_id,message:payload.message,response:{answer:'已收到公式。'}});await r.fulfill({contentType:'text/event-stream',body:'event: done\ndata: {"answer":"已收到公式。"}\n\n'});return;}
 await r.fulfill({json:value});});
 await p.goto('http://127.0.0.1:3011/student/learn?mode=live');const input=p.getByRole('textbox',{name:'发送消息',exact:true});await input.waitFor();await input.fill('前文后文');
 await input.evaluate(e=>{const r=document.createRange();r.setStart(e.firstChild,2);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);});
 await p.getByRole('button',{name:'插入公式',exact:true}).click();await p.locator('math-field').waitFor();await p.getByRole('button',{name:'分式',exact:true}).click();assert.equal(await input.innerText(),'前文后文');
 // Fill the visible mathfield using its public input API, not the chat textbox.
 await p.locator('math-field').evaluate(e=>{e.value=String.raw`\frac{1}{2}+x^2`;e.dispatchEvent(new Event('input',{bubbles:true}));});
 const box=await input.boundingBox(),panel=await p.locator('.formulaPanel').boundingBox();assert.ok(Math.abs(panel.width-box.width)<2);assert.ok(Math.abs(panel.y+panel.height-box.y)<2);await p.screenshot({path:'data/preview/formula-panel-desktop.png',fullPage:true});
 await p.getByRole('button',{name:'完成',exact:true}).click();assert.equal(await p.locator('.formulaPanel').count(),0);assert.equal(await input.locator('.formulaChip').count(),1);assert.ok(!(await input.innerText()).includes('\\frac'));assert.equal(await input.evaluate(e=>e.firstChild.textContent),'前文');assert.equal(await input.evaluate(e=>e.lastChild.textContent),'后文');
 await input.locator('.formulaChip').click();await p.locator('math-field').waitFor();assert.match(await p.locator('math-field').evaluate(e=>e.value),/frac/);await p.locator('math-field').evaluate(e=>{e.value='y^3';e.dispatchEvent(new Event('input',{bubbles:true}));});await p.getByRole('button',{name:'完成',exact:true}).click();assert.equal(await input.locator('.formulaChip').count(),1);
 await p.getByRole('button',{name:'插入公式',exact:true}).click();await p.locator('math-field').waitFor();await p.getByRole('heading',{name:/你好/}).click();assert.equal(await p.locator('.formulaPanel').count(),0);
 await p.screenshot({path:'data/preview/formula-insert-desktop.png',fullPage:true});
 await p.getByRole('button',{name:'发送',exact:true}).click();await p.getByText('已收到公式。',{exact:true}).waitFor();assert.match(payload.message,/前文\\\(y\^\{?3\}?\\\)后文/);assert.equal(await input.innerText(),'');
 await input.fill(String.raw`直接输入 \(\sqrt{x}\) 也可以`);await p.getByRole('button',{name:'发送',exact:true}).click();await p.locator('.chatAssistant').nth(1).waitFor();assert.ok(payload.message.includes(String.raw`\sqrt{x}`));
 await p.getByRole('button',{name:'新对话',exact:true}).click();await p.getByRole('button',{name:'插入公式',exact:true}).click();await p.locator('math-field').waitFor();await p.getByRole('button',{name:'分式',exact:true}).click();await p.getByRole('button',{name:'完成',exact:true}).click();await p.getByRole('alert').filter({hasText:'空格'}).waitFor();
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:'data/preview/formula-panel-mobile.png',fullPage:true});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.getByRole('button',{name:'清空',exact:true}).click();await p.getByRole('button',{name:'分式',exact:true}).click();
 // 视口尺寸变化后 MathLive 的焦点会晚一帧落回编辑区；真实用户不会在同一毫秒内打字，这里等焦点就位再输入
 await p.waitForFunction(()=>document.activeElement&&document.activeElement.tagName==='MATH-FIELD',null,{timeout:5000});
 await p.keyboard.type('1');await p.getByRole('button',{name:'下一格',exact:true}).click();
 await p.waitForFunction(()=>document.activeElement&&document.activeElement.tagName==='MATH-FIELD',null,{timeout:5000});
 await p.keyboard.type('2');await p.getByRole('button',{name:'完成',exact:true}).click();assert.equal(await input.locator('.formulaChip').count(),1);assert.match(await input.locator('.formulaChip').getAttribute('data-latex'),/frac(?:\{1\}\{2\}|12)/);
 await p.getByRole('button',{name:'插入公式',exact:true}).click();await p.locator('math-field').waitFor();await p.keyboard.press('Escape');assert.equal(await p.locator('.formulaPanel').count(),0);
 await p.getByRole('button',{name:'新对话',exact:true}).click();assert.equal(await input.innerText(),'');await input.fill('中文输入');await input.dispatchEvent('compositionstart');await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});assert.equal(await input.innerText(),'中文输入');await input.dispatchEvent('compositionend');
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);console.log('PASS: visual formula, caret insertion, edit replacement, outside close, width alignment, serialization, raw LaTeX, placeholder keyboard input, IME, mobile');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
