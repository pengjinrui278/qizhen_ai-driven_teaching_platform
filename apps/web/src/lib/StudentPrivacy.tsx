"use client";
import StudentIcon from "./StudentIcon";
import "./student-privacy.css";
type Row=Record<string,any>;
type Api=(path:string,method?:string,body?:any)=>Promise<any>;
export default function StudentPrivacy({api,user,busy,run,onUser,onDeleted}:{api:Api;user:Row;busy:boolean;run:(task:()=>Promise<void>)=>Promise<void>;onUser:(user:Row)=>void;onDeleted:()=>void}){
 async function exportProfile(){const content=await api('/me/export');const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='my-mathmirror.json';link.click();URL.revokeObjectURL(url);}
 return <section className="lmStudentPrivacy">
  <header className="lmPrivacyHeading"><h1>档案与隐私</h1><p>管理个人学习记录的保留策略，或导出自己的档案。</p></header>
  {busy&&<p role="status" className="lmPrivacyPending">正在处理请求…</p>}
  <section className="lmPrivacyCard" aria-labelledby="lm-principles-title">
   <h2 className="lmPrivacySectionTitle" id="lm-principles-title"><StudentIcon name="shield"/>数据使用原则</h2>
   <div className="lmPrivacyRow"><span className="lmPrivacyIcon"><StudentIcon name="shield"/></span><div><h3>私人学习与作业提交分开管理</h3><p>私人对话与笔记不向教师开放，作业内容在你确认提交后交给教师。</p></div></div>
   <div className="lmPrivacyRow"><span className="lmPrivacyIcon"><StudentIcon name="person"/></span><div><h3>学习反馈可以核对和纠正</h3><p>学习反馈应结合具体证据理解，使用次数不代表学习能力。</p></div></div>
  </section>
  <section className="lmPrivacyCard" aria-labelledby="lm-policy-title">
   <h2 className="lmPrivacySectionTitle" id="lm-policy-title"><StudentIcon name="chart"/>个人记录策略</h2>
   {user.retention_days==null&&<p className="lmPrivacyMissing">服务暂未提供保留天数，请确认后填写。</p>}
   <form className="lmPrivacyForm" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(async()=>{onUser(await api('/me','PATCH',{retention_days:Number(form.get('days')),status:form.get('status')}));});}}>
    <label className="lmPrivacyRow"><span className="lmPrivacyIcon"><StudentIcon name="file"/></span><span className="lmPrivacyFieldText">个人详细记录保留天数<small>设置个人详细记录的保留期限</small></span><input aria-label="个人详细记录保留天数" type="number" min={1} max={1095} required name="days" defaultValue={user.retention_days} placeholder="填写保留天数"/></label>
    <label className="lmPrivacyRow"><span className="lmPrivacyIcon"><StudentIcon name="chart"/></span><span className="lmPrivacyFieldText">档案状态<small>冻结后暂停更新个人档案</small></span><select aria-label="档案状态" name="status" required defaultValue={user.status||''}><option value="" disabled>请选择档案状态</option><option value="active">在用，允许更新</option><option value="frozen">冻结，暂停更新</option></select></label>
    <button type="submit" className="primary" disabled={busy}>保存个人策略</button>
   </form>
  </section>
  <section className="lmPrivacyCard" aria-labelledby="lm-export-title"><h2 className="lmPrivacySectionTitle" id="lm-export-title"><StudentIcon name="download"/>数据管理</h2><div className="lmPrivacyManagement"><button type="button" disabled={busy} onClick={()=>void run(exportProfile)}><StudentIcon name="download"/>导出我的档案</button>
   <details><summary>删除账号和个人学习记录</summary><p>删除后无法恢复个人记录。</p>
    <form className="lmPrivacyForm" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);if(window.confirm('确认永久删除账号及个人学习记录？'))void run(async()=>{await api('/me/delete','POST',{password:form.get('password'),confirmed:true});onDeleted();});}}>
     <label>再次输入口令<input name="password" type="password" required minLength={6} autoComplete="current-password"/></label><button type="submit" disabled={busy}>删除我的账号</button>
    </form>
   </details>
  </div></section>
 </section>;
}
