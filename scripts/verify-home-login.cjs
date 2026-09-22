// Local UI regression test. Synthetic account and schedule; zero LLM calls.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const prompts=require('../apps/web/src/lib/course-prompts.json');
async function main(){
 const base='http://127.0.0.1:3010',headers={'X-Mirror-Request':'1'};
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const username='home_test_'+Date.now(),password='test-only-'+Date.now();let registered=false;
 const snapshot={schema_version:1,source:'zju-local-connector',academic_year_start:2026,season:'1|秋',assignments:[],courses:[{id:'synthetic-course',source:'zju-undergraduate',course_id:null,course_name:'课表验收示例',teacher:'示例教师',location:'示例教室',day_of_week:1,periods:[1,2],first_half:true,second_half:true,week_pattern:'all',confirmed:true}]};
 try{
  await page.goto(base+'/');
  await page.getByRole('heading',{name:'登录学镜'}).waitFor();
  assert.equal(await page.locator('.portalSidebar').count(),0);
  await page.screenshot({path:'data/ai-preview/login-desktop.png',fullPage:true});
  for(const route of ['/student','/teacher','/student/ai/tools','/student/ai/resources','/student?mode=demo','/mirror','/builder']){
   await page.goto(base+route);await page.waitForURL('**/login');
   await page.getByRole('button',{name:'登录',exact:true}).waitFor();
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'data/ai-preview/login-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.getByRole('button',{name:'没有账号？注册',exact:true}).click();
  await page.getByLabel('账号',{exact:true}).fill(username);
  await page.getByLabel('昵称',{exact:true}).fill('首页验收');
  await page.getByLabel('密码',{exact:true}).fill(password);
  await page.getByLabel('确认密码',{exact:true}).fill('mismatch-password');
  await page.getByRole('button',{name:'注册并进入',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'两次输入的密码不一致'}).waitFor();
  await page.getByLabel('确认密码',{exact:true}).fill(password);
  const registration=page.waitForResponse(r=>r.url().endsWith('/auth/register')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'注册并进入',exact:true}).click();
  assert.equal((await registration).status(),200);registered=true;
  await page.waitForURL('**/student');
  await page.getByRole('heading',{name:'我的课表',exact:true}).waitFor();
  await page.locator('.zjuSchedule input[type=file]').setInputFiles({name:'synthetic-schedule.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});
  await page.getByRole('heading',{name:'课表验收示例'}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'课表验收示例'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:'data/ai-preview/home-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'data/ai-preview/home-desktop.png',fullPage:true});
  await page.goto(base+'/student/resources');
  assert.equal(await page.locator('.zjuSchedule').count(),0);
  await page.getByRole('link',{name:'查看首页课表 →'}).click();
  await page.getByRole('heading',{name:'课表验收示例'}).waitFor();
  await page.getByRole('button',{name:'清除本机课表'}).click();
  for(const [course,items] of Object.entries(prompts)){
   await page.goto(base+(course==='ai'?'/student/ai':'/student/learn?course='+course));
   const box=page.getByRole('textbox',{name:course==='ai'?'你的问题':'发送消息',exact:true});
   for(const prompt of items){await page.getByRole('button',{name:prompt.title,exact:true}).click();assert.equal(await box.inputValue(),prompt.question);}
  }
  await page.goto(base+'/login');await page.waitForURL('**/student');
  await page.goto(base+'/teacher');await page.waitForURL('**/student');
  await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await page.waitForURL('**/login');
  await page.getByLabel('账号',{exact:true}).fill(username);
  await page.getByLabel('密码',{exact:true}).fill('wrong-password');
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('alert').waitFor();assert.equal(new URL(page.url()).pathname,'/login');
  await page.getByLabel('密码',{exact:true}).fill(password);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.waitForURL('**/student');await page.getByRole('heading',{name:'我的课表',exact:true}).waitFor();
  await context.clearCookies();await page.goto(base+'/student/ai/notes');await page.waitForURL('**/login');
  const teacherContext=await browser.newContext();
  try{
   await teacherContext.route('**/api/v2/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(route.request().url().endsWith('/me')?{id:'fixture-teacher',role:'teacher',nickname:'教师路由验收'}:[])}));
   const teacherPage=await teacherContext.newPage();await teacherPage.goto(base+'/login');await teacherPage.waitForURL('**/teacher');
   await teacherPage.getByRole('heading',{name:'教学总览',exact:true}).waitFor();
  }finally{await teacherContext.close();}
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,registration:true,login:true,logout:true,protected_routes:7,schedule:'import/persist/remove',prompts:18,mobile_no_overflow:true,paid_calls:0}));
 }finally{
  try{if(registered){await context.request.post(base+'/api/v2/auth/login',{headers,data:{username,password}});const del=await context.request.post(base+'/api/v2/me/delete',{headers,data:{password,confirmed:true}});console.log('Synthetic cleanup:',del.status());assert.equal(del.status(),200);}}
  finally{await browser.close();}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
