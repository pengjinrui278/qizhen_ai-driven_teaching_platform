// Local UI verification only: no paid LLM calls, no real student data.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
async function main(){
 const base='http://127.0.0.1:3010',headers={'X-Mirror-Request':'1'};
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const username='directory_test_'+Date.now(),password='test-only-'+Date.now();let registered=false;
 try{
  const reg=await context.request.post(base+'/api/v2/auth/register',{headers,data:{username,password,nickname:'目录验收',role:'student'}});
  assert.equal(reg.status(),200);registered=true;
  await page.goto(base+'/student/ai/tools');
  await page.locator('[data-tool]').first().waitFor();
  assert.equal(await page.locator('[data-tool]').count(),30);
  await page.getByRole('button',{name:/^音乐 ·/}).click();
  assert.equal(await page.locator('[data-tool]').count(),4);
  await page.getByRole('textbox',{name:'搜索工具'}).fill('suno');
  assert.equal(await page.locator('[data-tool]').count(),1);
  await page.getByRole('button',{name:'复制 Suno 链接'}).click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'https://suno.com/');
  await page.getByRole('button',{name:'打不开？',exact:true}).click();
  await page.getByRole('link',{name:'海绵音乐 ↗',exact:true}).waitFor();
  const popupPromise=context.waitForEvent('page');
  await page.getByRole('link',{name:'打开 Suno 官网'}).click();
  const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');
  assert.equal(new URL(popup.url()).hostname,'suno.com');await popup.close();
  await page.screenshot({path:'data/ai-preview/tools-suno-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('textbox',{name:'搜索工具'}).fill('');
  await page.getByRole('button',{name:/^全部 ·/}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:'data/ai-preview/tools-mobile.png',fullPage:true});
  assert.equal((await context.request.post(base+'/api/v2/auth/logout',{headers})).status(),200);
  await page.goto(base+'/student/ai/notes');
  await page.waitForURL('**/login');
  await page.getByRole('button',{name:'登录',exact:true}).waitFor();
  await page.getByLabel('账号',{exact:true}).fill(username);
  await page.getByLabel('密码',{exact:true}).fill(password);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:'退出登录',exact:true}).waitFor();
  await page.getByRole('heading',{name:'我的课表',exact:true}).waitFor();
  const snapshot={schema_version:1,source:'zju-local-connector',academic_year_start:2026,season:'1|秋',assignments:[],courses:[{id:'synthetic-course',source:'zju-undergraduate',course_id:null,course_name:'课表验收示例',teacher:'示例教师',location:'示例教室',day_of_week:1,periods:[1,2],first_half:true,second_half:true,week_pattern:'all',confirmed:true}]};
  await page.locator('.zjuSchedule input[type=file]').setInputFiles({name:'synthetic-schedule.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});
  await page.getByText('周一',{exact:true}).waitFor();
  await page.getByRole('heading',{name:'课表验收示例',exact:true}).waitFor();
  await page.screenshot({path:'data/ai-preview/schedule-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'清除本机课表',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('learning-mirror.zju-schedule.v1')),null);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,catalog:30,music:4,private_notes_require_login:true,suno_popup:true,copy_link:true,mobile_no_overflow:true,ui_login:true,schedule_on_home:true,paid_calls:0}));
 }finally{
  if(registered){const del=await context.request.post(base+'/api/v2/me/delete',{headers,data:{password,confirmed:true}});console.log('Synthetic account cleanup:',del.status());assert.equal(del.status(),200);}
  await browser.close();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
