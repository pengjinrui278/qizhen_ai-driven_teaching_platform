const {chromium}=require('playwright');const assert=require('assert/strict');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const course={course_id:'mathematical_analysis',display_name:'数学分析'};
 const empty={id:'empty',course_id:course.course_id,problem:{text:'生成失败但原题必须可见'},events:[]};
 const saved={id:'saved',course_id:course.course_id,problem:{text:'已有成功历史'},events:[{request_id:'done',message:'已有成功历史',response:{answer:'保存过的真实格式回答。'}}]};
 let release;const delayed=new Promise(r=>release=r);let started;const began=new Promise(r=>started=r);
 await p.route('**/api/v2/**',async route=>{const path=new URL(route.request().url()).pathname.replace('/api/v2','');let value=[];
 if(path==='/me')value={id:'fixture',role:'student',status:'active'};
 if(path==='/courses')value=[course];if(path==='/config')value={};if(path==='/memory')value={observations:[],hypotheses:[]};
 if(path==='/attempts')value=[empty,saved];if(path==='/attempts/empty')value=empty;if(path==='/attempts/saved')value=saved;
 if(path.endsWith('/messages/stream')){started();await delayed;try{await route.fulfill({contentType:'text/event-stream',body:'event: done\ndata: {"answer":"迟到响应不得覆盖历史"}\n\n'});}catch{}return;}
 await route.fulfill({json:value});});
 await p.goto('http://127.0.0.1:3011/student/learn?attempt=empty');
 await p.getByText('这段对话尚无已完成的回答。原问题已保留在下方，可直接发送继续。',{exact:true}).waitFor();
 assert.equal(await p.getByLabel('发送消息',{exact:true}).inputValue(),empty.problem.text);
 assert.equal(await p.getByRole('button',{name:'新对话',exact:true}).count(),1);
 await p.getByRole('button',{name:'发送',exact:true}).click();await began;
 await p.locator('.chatSessionList button').filter({hasText:saved.problem.text}).click();
 await p.getByText('保存过的真实格式回答。',{exact:true}).waitFor();
 assert.equal(await p.getByLabel('发送消息',{exact:true}).isEnabled(),true);release();await p.waitForTimeout(300);
 assert.equal(await p.getByText('迟到响应不得覆盖历史',{exact:true}).count(),0);
 await p.reload();await p.getByText('保存过的真实格式回答。',{exact:true}).waitFor();
 await p.setViewportSize({width:390,height:844});assert.equal(await p.getByRole('button',{name:'新对话',exact:true}).count(),1);
 assert.deepEqual(errors,[]);console.log('PASS: empty history, single new-chat, switch during generation, stale response isolation, reload');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
