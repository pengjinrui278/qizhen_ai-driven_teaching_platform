// UI-B1: synthetic API and local schedule only; never contacts a real backend.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.MIRROR_WEB_PREVIEW_URL||'http://127.0.0.1:3011';
const before=process.argv.includes('--before');
const out=path.resolve(process.env.MIRROR_UI_OUTPUT_DIR||'artifacts/ui-b1');
const courses=[['mathematical_analysis','数学分析'],['linear_algebra_analytic_geometry','高等代数与解析几何'],['university_physics','大学物理'],['point_set_topology','点集拓扑'],['ordinary_differential_equations','常微分方程']].map(([course_id,display_name])=>({course_id,display_name,available:true}));
const snapshot={schema_version:1,source:'zju-local-connector',academic_year_start:2026,season:'1|秋',fetched_at:'2026-09-26T06:00:00Z',assignments:[],courses:[1,2,3,4,5,7].map((day,i)=>({id:'schedule-'+day,source:'zju-undergraduate',course_id:null,course_name:courses[i%courses.length].display_name,teacher:'示例教师',location:'示例教室',day_of_week:day,periods:[1,2],first_half:true,second_half:true,week_pattern:'all',confirmed:true}))};
const attempt={id:'fixture-attempt',course_id:courses[0].course_id,problem:{text:'合成验收：核对极限定义'},events:[]};
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-09-26T06:00:00Z')});
 await context.addInitScript(value=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('learning-mirror.zju-schedule.v1',JSON.stringify(value));sessionStorage.setItem('seeded','1');}},snapshot);
 let role='student',empty=false,fail=false,extra=false,guest=false,logout=0,holdCourses=null;
 const handleRoute=async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==new URL(base).origin){external.push(url.href);await route.abort();return;}
  if(!url.pathname.startsWith('/api/v2/')){await route.continue();return;}
  const p=url.pathname.slice('/api/v2'.length);let data=[];
  if(p==='/me'){
   if(guest){await route.fulfill({status:401,json:{detail:'请登录'}});return;}
   data={id:'fixture-user',nickname:'合成验收用户',role,status:'active'};
  }
  if(p==='/courses'){
   if(holdCourses)await holdCourses;
   if(fail){await route.fulfill({status:503,json:{detail:'合成课程加载失败'}});return;}
   data=empty?[]:extra?[...courses,...['python_programming','electronic_circuits','psychology_applications','college_english'].map((course_id,i)=>({course_id,display_name:['Python','电子电路基础','心理学及应用','大学英语'][i],available:false}))]:courses;
  }
  if(p==='/sandboxes')data=empty||role!=='student'?[]:[{id:'fixture-homework',course_id:courses[0].course_id,title:'合成作业：定义与条件',status:'open',expires_at:'2026-09-28T12:00:00Z'}];
  if(p==='/attempts')data=empty?[]:[attempt];
  if(p==='/attempts/'+attempt.id)data=attempt;
  if(p==='/memory')data={observations:[],hypotheses:[]};
  if(p==='/config')data={};
  if(p==='/auth/logout'){logout++;guest=true;data={};}
  await route.fulfill({status:200,json:data});
 };
 await context.route('**/*',handleRoute);
 const goto=async route=>{await page.goto(base+route);await page.locator('.portal').waitFor();if(new URL(base+route).pathname==='/student')await page.getByRole('heading',{name:'我的课程',exact:true}).waitFor();};
 const photo=async name=>{await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});};
 const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'page must not overflow');
 const styles=async selector=>page.locator(selector).first().evaluate(el=>{const s=getComputedStyle(el);return Object.fromEntries(['color','backgroundColor','fontFamily','fontSize','padding','borderRadius'].map(k=>[k,s[k]]));});
 try{
  await goto('/student?mode=live');await page.locator('.zjuCourseSlip').first().waitFor();
  for(const [width,height,label] of [[1440,900,'desktop'],[390,844,'mobile'],[768,1024,'tablet']]){
   await page.setViewportSize({width,height});await page.evaluate(()=>{document.activeElement?.blur();document.querySelector('.zjuWeekGrid').scrollLeft=0;});await photo((before?'before':'after')+'-'+label);
   if(!before){
    await noOverflow();
    const sidebar=page.locator('.lmStudentSidebar');
    assert.equal(Math.round((await sidebar.boundingBox()).width),width>900?240:60);
    const links=sidebar.locator('nav a');assert.equal(await links.count(),7);
    for(const link of await links.all()){assert.ok(await link.getAttribute('aria-label'));const box=await link.boundingBox();assert.ok(box.width>=44&&box.height>=44);}
    const grid=page.locator('.zjuWeekGrid');await grid.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
    const sunday=await page.locator('.zjuDayColumn').last().boundingBox(),viewport=await grid.boundingBox();
    assert.ok(sunday.x>=viewport.x-1&&sunday.x+sunday.width<=viewport.x+viewport.width+1,'Sunday reachable within schedule');
    await grid.focus();assert.equal(await grid.evaluate(el=>el===document.activeElement),true);
    if(width===390){const cards=await page.locator('.lmCourseCard').all();assert.equal(Math.round((await cards[0].boundingBox()).x),Math.round((await cards[1].boundingBox()).x));}
   }
  }
  await page.setViewportSize({width:1440,height:900});
  await goto('/student/privacy?mode=live');await page.getByRole('button',{name:'导出我的档案'}).waitFor();
  const privacy=await styles('.lmStudentPrivacy .lmPrivacyCard, .pilotCard');
  role='teacher';await goto('/teacher?mode=live');await page.getByRole('heading',{name:'教学总览',exact:true}).waitFor();
  const teacher=await styles('.portalSidebar');await photo((before?'before':'after')+'-teacher');
  guest=true;await page.goto(base+'/login');await page.getByRole('button',{name:'登录',exact:true}).waitFor();
  const login=await styles('.loginSurface');await photo((before?'before':'after')+'-login');
  const scope={privacy,teacher,login};
  if(before){fs.writeFileSync(path.join(out,'before-styles.json'),JSON.stringify(scope,null,2));console.log('Saved BEFORE screenshots and style baseline (synthetic data).');return;}
  const hasBaseline=fs.existsSync(path.join(out,'before-styles.json'));
  if(hasBaseline){
   // Privacy was intentionally migrated in UI-B2; its interactions and layout
   // are covered by verify-web-ui-b2.cjs privacy, not the pre-B1 style snapshot.
   const previous=JSON.parse(fs.readFileSync(path.join(out,'before-styles.json')));
   assert.deepEqual({teacher:scope.teacher,login:scope.login},{teacher:previous.teacher,login:previous.login},'teacher/login content styles unchanged');
  }else console.log('No pre-change baseline supplied: visual before/after comparison skipped.');
  guest=false;role='student';await goto('/student?mode=live');
  assert.equal(await page.locator('.lmCourseCard').count(),5);
  assert.equal(await page.getByRole('link',{name:'切换到教师端',exact:true}).count(),0);
  assert.equal(await page.locator('.lmStudentSidebar [aria-current="page"]').getAttribute('href'),'/student?mode=live');
  await page.locator('.lmCourseCard').first().click();await page.getByLabel('发送消息',{exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('course'),courses[0].course_id);
  await goto('/student?mode=live');await page.locator('.lmRecentLink').first().click();
  await page.waitForURL(url=>url.searchParams.get('attempt')===attempt.id);
  assert.equal(new URL(page.url()).searchParams.get('attempt'),attempt.id);await page.getByLabel('发送消息',{exact:true}).waitFor();
  await goto('/student/ai/notes?mode=live');assert.equal(await page.locator('.lmStudentSidebar [aria-current="page"]').getAttribute('aria-label'),'AI 学习');
  await page.getByRole('navigation',{name:'学生端导航'}).getByRole('link',{name:'学习首页',exact:true}).click();await page.locator('.lmStudentHome').waitFor();
  for(const [section,label] of [['resources','资源中心'],['assignments','我的作业'],['observations','学习反馈'],['privacy','档案与隐私']]){
   await page.getByRole('navigation',{name:'学生端导航'}).getByRole('link',{name:label,exact:true}).click();
   await page.waitForURL(url=>url.pathname==='/student/'+section);
   await page.locator('.lmStudentSidebar [aria-current="page"]').filter({hasText:label}).waitFor();
   assert.equal(await page.locator('.lmStudentHome').count(),0,'home CSS scope is absent on '+section);
  }
  await goto('/student?mode=live');
  extra=true;await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.lmCourseCard').length===9);
  assert.ok((await page.locator('.lmCourseCard').allTextContents()).some(s=>s.includes('点集拓扑')));
  assert.equal(await page.getByText('教材待补充',{exact:true}).count(),0,'available is not textbook coverage');
  empty=true;await page.reload();await page.getByText('暂无可选课程',{exact:true}).waitFor();
  await page.getByText('暂无进行中作业',{exact:true}).waitFor();await page.getByText('暂无学习记录',{exact:true}).waitFor();
  await photo('empty-desktop');
  empty=false;extra=false;fail=true;await page.reload();await page.getByRole('alert').filter({hasText:'合成课程加载失败'}).waitFor();await photo('error-desktop');
  fail=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.locator('.lmCourseCard').first().waitFor();
  let release;holdCourses=new Promise(resolve=>{release=resolve;});
  await page.reload();await page.getByRole('status').filter({hasText:'正在加载学习首页'}).waitFor();
  assert.equal(await page.locator('.lmHomeSkeleton').first().evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion disables loading animation');
  await photo('loading-desktop');release();holdCourses=null;await page.locator('.lmCourseCard').first().waitFor();
  await page.getByRole('button',{name:'清除本机课表'}).click();await page.getByRole('heading',{name:'还没有课表'}).waitFor();
  const file=page.locator('.zjuSchedule input[type=file]');
  await file.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await page.getByRole('alert').filter({hasText:'课表文件不是'}).waitFor();
  await file.setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});await page.locator('.zjuCourseSlip').first().waitFor();
  await page.reload();await page.locator('.zjuCourseSlip').first().waitFor();
  // A separate live-mode context has no seed or localStorage from the screenshot fixture.
  const clean=await browser.newContext();await clean.route('**/*',handleRoute);
  try{
   const live=await clean.newPage();await live.goto(base+'/student?mode=live');
   await live.getByRole('heading',{name:'还没有课表'}).waitFor();
   assert.equal(await live.evaluate(()=>localStorage.getItem('learning-mirror.zju-schedule.v1')),null);
   const cleanFile=live.locator('.zjuSchedule input[type=file]');
   const missing={...snapshot,courses:[{...snapshot.courses[0],teacher:'',location:null}]};
   await cleanFile.setInputFiles({name:'missing.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(missing))});
   await live.getByText('地点待定',{exact:true}).waitFor();
   assert.equal(await live.getByText('示例教师',{exact:true}).count(),0);
   await live.getByRole('button',{name:'清除本机课表'}).click();
   delete missing.courses[0].teacher;
   await cleanFile.setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(missing))});
   await live.getByRole('alert').filter({hasText:'课表文件不是'}).waitFor();
   assert.equal(await live.locator('.zjuCourseSlip').count(),0);
  }finally{await clean.close();}
  await page.getByRole('navigation',{name:'学生端导航'}).getByRole('link',{name:'学习首页',exact:true}).focus();
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'课程学习');
  await page.goto(base+'/teacher?mode=live');await page.waitForURL('**/student');
  await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.waitForURL('**/login');assert.equal(logout,1);
  await page.goto(base+'/student');await page.waitForURL('**/login');
  guest=false;role='ta';await goto('/student');assert.equal(await page.getByRole('link',{name:'切换到教师端',exact:true}).count(),1);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[],'no runtime third-party requests');
  const result={passed:true,synthetic:true,base,widths:[1440,768,390],baselineCompared:hasBaseline,checks:['dynamic courses','loading/empty/error/retry','seven navigation entries/role/auth/logout','schedule import/persist/clear and seven days','keyboard/touch targets/reduced motion','no page overflow','no external requests']};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
