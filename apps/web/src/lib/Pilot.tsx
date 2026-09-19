"use client";
import {useEffect,useRef,useState} from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "./pilot.css";
import VerificationTools from "./VerificationTools";
import ProblemEditor from "./ProblemEditor";
import PhotoInput from "./PhotoInput";
import LearningFeedback from "./LearningFeedback";
import AssignmentPages from "./AssignmentPages";
import CourseChat from "./CourseChat";
import ResourceCenter from "./ResourceCenter";
import {demoApi,PortalRole} from "./demoApi";
type Row=Record<string,any>;
type Tab="learn"|"memory"|"sandboxes"|"builder"|"account"|"resources";
const labels:Row={conditions:"定理条件",quantifiers:"量词与依赖",construction:"辅助对象",emerging:"证据积累中",worth_attention:"值得关注",improving:"出现改善证据",weakened:"原假设减弱",approved:"已人工审校",needs_ta_review:"待人工审校",passed:"通过",failed:"未通过",not_run:"未执行",uncertain:"需核对",first_hint:"第一提示",next_hint:"继续提示",full_solution:"完整思路",concept_explanation:"知识答疑",solution_review:"证明自查"};
export class ApiError extends Error{
 status:number;
 constructor(status:number,message:string){super(message);this.name="ApiError";this.status=status;}
}
function apiErrorMessage(value:any,status:number){
 if(typeof value?.detail==="string")return value.detail.replace(/Sandbox/gi,"作业");
 const issue=Array.isArray(value?.detail)?value.detail[0]:null;
 if(issue){
  const field=String(issue.loc?.at?.(-1)||"");
  const names:Row={username:"账号",password:"口令",nickname:"昵称",invite_code:"邀请码",role:"身份"};
  if(issue.type==="string_too_short")return `${names[field]||"内容"}至少需要 ${issue.ctx?.min_length||6} 个字符`;
  if(issue.type==="string_too_long")return `${names[field]||"内容"}不能超过 ${issue.ctx?.max_length||128} 个字符`;
  if(issue.type==="string_pattern_mismatch")return "账号只能包含字母、数字、下划线、点和短横线";
  if(issue.type==="missing")return `请填写${names[field]||"完整注册信息"}`;
 }
 return "请检查填写内容后重试（"+status+"）";
}
export async function liveApi(path:string,method="GET",body?:unknown){
  const r=await fetch((process.env.NEXT_PUBLIC_API_BASE??"")+"/api/v2"+path,{method,credentials:"include",headers:{"Content-Type":"application/json","X-Mirror-Request":"1"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const v=await r.json().catch(()=>({detail:"服务没有返回有效数据"}));
  if(!r.ok)throw new ApiError(r.status,apiErrorMessage(v,r.status));return v;
}
function MathText({text}:{text:string}){return <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex,{throwOnError:false}]]}>{text.replace(/\\\[([\s\S]*?)\\\]/g,(_,s)=>"$$"+s+"$$").replace(/\\\(([\s\S]*?)\\\)/g,(_,s)=>"$"+s+"$")}</ReactMarkdown>;}
function download(name:string,value:unknown){const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}
const themeOptions=["conditions","quantifiers","construction"].map(t=><option key={t} value={t}>{labels[t]}</option>);

export default function Pilot({initial="learn",portal,demonstration=false,section,onLogin}:{initial?:Tab;portal?:PortalRole;demonstration?:boolean;section?:string;onLogin?:()=>void}){
 const api=(path:string,method="GET",body?:any)=>demonstration?demoApi(portal||"student",path,method,body):liveApi(path,method,body);
 const [user,setUser]=useState<Row|null>(null),[loading,setLoading]=useState(true),[config,setConfig]=useState<Row>({});
 const [tab,setTab]=useState<Tab>(initial),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [register,setRegister]=useState(false),[role,setRole]=useState<string>(portal||"student");
 const [courses,setCourses]=useState<Row[]>([]),[course,setCourse]=useState("mathematical_analysis"),[problems,setProblems]=useState<Row[]>([]);
 const [attempts,setAttempts]=useState<Row[]>([]),[active,setActive]=useState<Row|null>(null),[events,setEvents]=useState<Row[]>([]);
 const [text,setText]=useState(""),[message,setMessage]=useState(""),[theme,setTheme]=useState("conditions");
 const [memory,setMemory]=useState<Row>({observations:[],hypotheses:[]}),[sandboxes,setSandboxes]=useState<Row[]>([]),[sandbox,setSandbox]=useState("");
 const [detailId,setDetailId]=useState(""),[report,setReport]=useState<Row|null>(null),[submissions,setSubmissions]=useState<Row[]>([]),[findings,setFindings]=useState<Row[]>([]);
 const [builder,setBuilder]=useState<Row|null>(null),[pack,setPack]=useState(""),[document,setDocument]=useState(""),[reviewNote,setReviewNote]=useState("");
 const epoch=useRef(0),pending=useRef<Row|null>(null),running=useRef(false),resumed=useRef("");
 const staff=user?.role==="teacher"||user?.role==="ta";
 const [small,setSmall]=useState(false);
 useEffect(()=>{const query=window.matchMedia("(max-width:680px)");const change=()=>setSmall(query.matches);change();query.addEventListener("change",change);return()=>query.removeEventListener("change",change);},[]);
 useEffect(()=>{if(user&&onLogin&&(portal!=="teacher"||staff))onLogin();},[user?.id]);
 useEffect(()=>{const c=new URLSearchParams(window.location.search).get("course");if(c)setCourse(c);Promise.all([api("/config"),api("/me").catch(e=>{if(e instanceof ApiError&&e.status===401)return null;throw e;})]).then(([c,u])=>{setConfig(c);setUser(u);}).catch(e=>setError(e instanceof Error?e.message:String(e))).finally(()=>setLoading(false));},[]);
 useEffect(()=>{if(!user)return;let live=true;Promise.all([api("/courses"),api("/attempts"),api("/memory"),api("/sandboxes")]).then(([c,a,m,s])=>{if(live){setCourses(c);setAttempts(a);setMemory(m);setSandboxes(s);}}).catch(e=>live&&setError(e.message));return()=>{live=false;};},[user]);
 useEffect(()=>{if(!user)return;let live=true;setProblems([]);setActive(null);setEvents([]);setMessage("");setSandbox("");pending.current=null;epoch.current++;
  api("/problems?course_id="+encodeURIComponent(course)).then(p=>live&&setProblems(p)).catch(e=>live&&setError(e.message));return()=>{live=false;};},[course,user]);
 useEffect(()=>{const aid=new URLSearchParams(window.location.search).get("attempt");const a=attempts.find(a=>a.id===aid&&a.course_id===course);if(a&&resumed.current!==aid){resumed.current=aid!;void resume(a);}},[attempts,course]);
 async function run(task:()=>Promise<void>){if(running.current)return;running.current=true;setBusy(true);setError("");setNotice("");try{await task();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{running.current=false;setBusy(false);}}
 async function refresh(){setAttempts(await api("/attempts"));setMemory(await api("/memory"));setSandboxes(await api("/sandboxes"));}
 async function start(p?:Row){await run(async()=>{const a=await api("/attempts","POST",{course_id:course,sandbox_id:sandbox||null,...(p?{problem_id:p.problem_id,coursepack_id:p.coursepack_id}:{text})});epoch.current++;setActive(a);setEvents([]);setMessage("");pending.current=null;await refresh();});}
 async function resume(a:Row){await run(async()=>{const token=++epoch.current,d=await api("/attempts/"+a.id);if(token===epoch.current){setActive(d);setEvents(d.events);setMessage("");pending.current=null;}});}
 async function send(mode:string,retry=false){if(!active)return;const aid=active.id,token=epoch.current,p=retry&&pending.current?pending.current:{request_id:crypto.randomUUID(),mode,message};pending.current=p;
  await run(async()=>{await api("/attempts/"+aid+"/messages","POST",p);if(token!==epoch.current)return;const d=await api("/attempts/"+aid);setEvents(d.events);setMessage("");pending.current=null;await refresh();});}
 async function feedback(outcome:string){if(!active)return;await run(async()=>{setMemory(await api("/attempts/"+active.id+"/feedback","POST",{request_id:crypto.randomUUID(),outcome,theme,note:""}));setNotice("已保存反馈");});}
 async function loadSandbox(sid:string){const token=++epoch.current;setDetailId(sid);setReport(null);setSubmissions([]);setFindings([]);await run(async()=>{const [r,s,f]=await Promise.all([api("/sandboxes/"+sid+"/report"),api("/sandboxes/"+sid+"/submissions"),api("/sandboxes/"+sid+"/findings")]);if(token===epoch.current){setReport(r);setSubmissions(s);setFindings(f);}});}
 async function refreshDetail(){const sid=detailId;if(!sid)return;const [r,s,f]=await Promise.all([api("/sandboxes/"+sid+"/report"),api("/sandboxes/"+sid+"/submissions"),api("/sandboxes/"+sid+"/findings")]);setReport(r);setSubmissions(s);setFindings(f);setSandboxes(await api("/sandboxes"));}
 useEffect(()=>{if(!user)return;if(initial==="builder")void run(async()=>{const b=await api("/builder");setBuilder(b);setPack(b.packs[0]?.id||"");});},[user?.id]);
 const currentSandbox=sandboxes.find(s=>s.id===detailId),lastHint=[...events].reverse().find(e=>e.response.hint_level!=null)?.response.hint_level??0;
 const problemText=(a:Row)=>a.problem.text||problems.find(p=>p.problem_id===a.problem.problem_id&&(!a.problem.coursepack_id||p.coursepack_id===a.problem.coursepack_id))?.statement||"课程题目";
 if(portal==="teacher"&&user&&!staff)return <section className="pilotCard"><h2>当前账号没有教师权限</h2><p>请使用教师或助教账号登录，学生账号不能访问批改与班级数据。</p><button onClick={()=>run(async()=>{await api("/auth/logout","POST");setUser(null);})}>退出并登录教师账号</button></section>;
 return <main className={"pilot "+(portal?"portalEmbedded ":"")+(section==="reports"?"reportOnly":"")} data-portal={portal}>


 {error&&<div className="pilotAlert" role="alert">{error}</div>}{notice&&<div className="pilotNotice" role="status">{notice}</div>}
 {loading?<p>正在恢复登录状态…</p>:!user?<section className="pilotCard loginCard"><div className="loginBrand"><span className="loginLogo">镜</span><div><h2>{register?"创建学镜账号":"欢迎回到学镜"}</h2><p>{register?"注册后即可在课程中获得最小提示式引导":"登录后继续你的课程学习与学习档案"}</p></div></div>
 <form className="pilotForm authForm" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const password=String(f.get("password")||"");if(register&&password!==String(f.get("password_confirm")||"")){setError("两次输入的口令不一致");return;}void run(async()=>setUser(await api(register?"/auth/register":"/auth/login","POST",{username:String(f.get("username")||"").trim(),password,...(register?{nickname:String(f.get("nickname")||"").trim(),role,invite_code:String(f.get("invite")||"")}:{})})));}}>
 <label>账号<input name="username" required minLength={3} maxLength={80} autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[a-zA-Z0-9_.-]+" placeholder="3–80 位字母、数字或 _ . -"/></label>{register&&<label>昵称<input name="nickname" required minLength={1} maxLength={80} autoComplete="nickname" placeholder="在平台中显示的称呼"/></label>}
 <label>口令<input name="password" type="password" required minLength={6} maxLength={128} autoComplete={register?"new-password":"current-password"} placeholder={register?"至少 6 个字符":"输入账号口令"}/></label>
 {register&&<label>确认口令<input name="password_confirm" type="password" required minLength={6} maxLength={128} autoComplete="new-password" placeholder="再次输入口令"/></label>}
 {register&&<><label>身份<select value={role} onChange={e=>setRole(e.target.value)}><option value="student">学生</option><option value="teacher">教师</option><option value="ta">助教</option></select></label>{role!=="student"&&<label>教师/TA 邀请码<input name="invite" type="password" required autoComplete="off" placeholder="由平台管理员提供"/></label>}<p className="authHint">学生账号可直接注册；教师和助教账号需要邀请码。注册即表示你同意平台保存账号及学习档案，可随时在“档案与隐私”中导出或删除。</p></>}
 <button className="primary" disabled={busy}>{busy?"处理中…":register?"创建账号":"登录"}</button></form><button disabled={busy} onClick={()=>setRegister(!register)}>{register?"已有账号，去登录":"注册账号"}</button></section>:<>
 {!portal&&<nav className="pilotTabs" aria-label="工作台">{([["learn","课程学习"],["resources","资源中心"],["memory","我的观察"],["sandboxes","我的作业"],...(staff?[["builder","课程建设"]]:[]),["account","档案与隐私"]] as [Tab,string][]).map(([key,label])=><button key={key} disabled={busy} aria-current={tab===key?"page":undefined} onClick={()=>{epoch.current++;setTab(key);setError("");if(key==="builder")void run(async()=>setBuilder(await api("/builder")));}}>{label}</button>)}</nav>}
 {user.status==="frozen"&&<div className="pilotNotice">档案已冻结。仍可查看、导出、删除，或在档案设置恢复更新。</div>}
 {tab==="learn"&&<><CourseChat api={api} courses={courses} user={user} sandboxes={sandboxes}/>
 <details><summary>分享题目</summary><form className="pilotForm" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{await api("/contributions","POST",{course_id:f.get("course"),title:f.get("title"),text:f.get("text"),consent:true});setNotice("已提交审核");});}}><select name="course">{courses.map(c=><option key={c.course_id} value={c.course_id}>{c.display_name}</option>)}</select><input name="title" required minLength={3} placeholder="题目名称"/><textarea name="text" required minLength={5} placeholder="仅提交愿意共享的题干，不附私人聊天"/><label className="check"><input type="checkbox" required/>我有权分享此题，同意用于课程题库</label><button disabled={busy}>提交审核</button></form></details>
 </>}
 
 {tab==="memory"&&<LearningFeedback memory={memory} courses={courses} onCorrect={async(oid,note)=>{setMemory(await api("/observations/"+encodeURIComponent(oid),"PATCH",{disputed:true,note}));}}/>}
 {tab==="sandboxes"&&<AssignmentPages api={api} user={user} courses={courses} view={section||"assignments"} demonstration={demonstration}/>}
 {tab==="builder"&&staff&&<section className="pilotCard"><h2>课程材料</h2>
 {!builder?<button disabled={busy} onClick={()=>run(async()=>setBuilder(await api("/builder")))}>加载课程建设台</button>:<><label>课程<select value={pack} disabled={busy} onChange={e=>{setPack(e.target.value);setDocument("");}}><option value="">请选择</option>{builder.packs.map((p:Row)=><option key={p.id} value={p.id}>{courses.find(c=>c.course_id===p.course_id)?.display_name||"课程"}</option>)}</select></label>
 {builder.packs.find((p:Row)=>p.id===pack)?.problems.map((p:Row)=><button className="historyButton" disabled={busy} key={p.id} onClick={()=>{setDocument(JSON.stringify(p,null,2));setReviewNote("");}}><MathText text={p.statement}/></button>)}
 {document&&<form className="pilotForm" onSubmit={e=>{e.preventDefault();void run(async()=>{await api("/builder/"+encodeURIComponent(pack)+"/publish","POST",{document:JSON.parse(document),note:reviewNote,math_reviewed:true,in_course_scope:true});setBuilder(await api("/builder"));setNotice("已发布");});}}><ProblemEditor value={document} onChange={setDocument} knowledge={builder.packs.find((p:Row)=>p.id===pack)?.knowledge||[]}/><label>审校说明<textarea required minLength={5} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/></label><label className="check"><input type="checkbox" required/>我已核对课程归属、解法、教学要点及使用许可</label><button className="primary" disabled={busy||user.role!=="teacher"}>教师确认发布新版本</button></form>}
 <h3>贡献候选与版本记录</h3>{builder.revisions.map((r:Row)=><article className="evidenceRow" key={r.id}><p>{({candidate:"待审核",eligible:"待编辑",published:"已发布",rejected:"未采纳"} as Row)[r.status]||"版本记录"}</p>{r.content.text&&<MathText text={r.content.text}/>}
 {["candidate","eligible"].includes(r.status)&&<div className="pilotActions">{["eligible","rejected"].map(d=><button key={d} disabled={busy} onClick={()=>{const note=window.prompt("请写明课程归属判断理由：");if(note)void run(async()=>{await api("/builder/candidates/"+r.id+"/review","POST",{decision:d,note});setBuilder(await api("/builder"));});}}>{d==="eligible"?"课程相关，进入人工编辑":"不适合本课程"}</button>)}</div>}
 {r.status==="eligible"&&<><button disabled={busy} onClick={()=>{setPack(r.coursepack_id);setReviewNote("");setDocument(JSON.stringify({id:"contribution_"+r.id,type:"problem",provenance:"explicit_contribution",statement:r.content.text,answer_type:"proof",knowledge_ids:[],solution_paths:[],hint_ladder:[],common_mistakes:[],rights:{allowed_for_runtime:false,allowed_for_rag:true,allowed_for_eval:true,allowed_for_training:false},review:{status:"needs_ta_review",source_candidate:r.id}},null,2));}}>打开编辑草稿</button></>}
 {r.status==="published"&&r.content.before&&<button disabled={busy||user.role!=="teacher"} onClick={()=>{const note=window.prompt("回滚理由（至少5字）：");if(note)void run(async()=>{await api("/builder/revisions/"+r.id+"/rollback","POST",{note,confirmed:true});setBuilder(await api("/builder"));});}}>创建回滚版本</button>}</article>)}</>}</section>}
 {tab==="account"&&<section className="pilotCard"><h2>隐私与学习档案</h2><div className="pilotActions"><button disabled={busy} onClick={()=>run(async()=>download("my-mathmirror.json",await api("/me/export")))}>导出我的档案</button></div>
 <form className="pilotForm" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{setUser(await api("/me","PATCH",{retention_days:Number(f.get("days")),status:f.get("status")}));setNotice("已保存");});}}><label>个人详细记录保留天数<input type="number" min={1} max={1095} name="days" defaultValue={user.retention_days}/></label><label>档案状态<select name="status" defaultValue={user.status}><option value="active">在用，允许更新</option><option value="frozen">冻结，暂停更新</option></select></label><button disabled={busy}>保存个人策略</button></form>
 <details><summary>删除账号和个人学习记录</summary><p>删除后无法恢复个人记录。</p><form className="pilotForm" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(window.confirm("确认永久删除账号及个人学习记录？"))void run(async()=>{await api("/me/delete","POST",{password:f.get("password"),confirmed:true});setUser(null);setMemory({observations:[],hypotheses:[]});setActive(null);});}}><input name="password" type="password" required minLength={6} placeholder="再次输入口令"/><button disabled={busy}>删除我的账号</button></form></details></section>}
 {tab==="resources"&&<ResourceCenter api={api} courses={courses}/>}
 </>}</main>;
}
