// Read-only external navigation audit; no accounts, uploads, or paid model calls.
const {chromium}=require('playwright');
const fs=require('node:fs');
const catalog=require('../apps/web/src/lib/ai-tools.json');
async function main(){
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const results=[];let next=0;
 try{await Promise.all(Array.from({length:4},async()=>{
  while(next<catalog.length){const tool=catalog[next++],page=await browser.newPage();
   try{const response=await page.goto(tool.url,{waitUntil:'domcontentloaded',timeout:25000});
    results.push({id:tool.id,url:tool.url,status:response?.status(),final:page.url(),title:await page.title()});
   }catch(e){results.push({id:tool.id,url:tool.url,error:e.message.split('\n')[0]});}
   finally{await page.close();}
  }
 }));}finally{await browser.close();}
 fs.mkdirSync('data/ai-preview',{recursive:true});
 fs.writeFileSync('data/ai-preview/tool-link-audit.json',JSON.stringify({checked_at:new Date().toISOString(),note:'Navigation only, not authenticated feature availability',results},null,2));
 console.log(JSON.stringify(results,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
