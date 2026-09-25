"use client";
import {FormEvent,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {ApiError,liveApi} from "./Pilot";
import "./login.css";

export default function LoginPage(){
 const router=useRouter(),lock=useRef(false);
 const [checking,setChecking]=useState(true),[register,setRegister]=useState(false),[role,setRole]=useState("student"),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const enter=(user:{role:string})=>router.replace(["teacher","ta"].includes(user.role)?"/teacher":"/student");
 useEffect(()=>{let live=true;liveApi("/me").then(user=>{if(live)enter(user);}).catch(e=>{if(live){if(!(e instanceof ApiError&&e.status===401))setError("暂时无法连接服务，请稍后重试。");setChecking(false);}});return()=>{live=false;};},[]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(lock.current)return;
  const data=new FormData(event.currentTarget),password=String(data.get("password")||"");
  if(register&&password!==data.get("confirm")){setError("两次输入的密码不一致");return;}
  lock.current=true;setBusy(true);setError("");
  try{const user=await liveApi(register?"/auth/register":"/auth/login","POST",{username:String(data.get("username")||"").trim(),password,...(register?{nickname:String(data.get("nickname")||"").trim(),role,invite_code:String(data.get("invite")||"")}:{})});enter(user);}
  catch(e){setError(e instanceof Error?e.message:"暂时无法登录，请重试");}
  finally{lock.current=false;setBusy(false);}
 }
 return <main className="loginPage"><section className="loginSurface" aria-labelledby="login-title">
  <div className="loginIdentity"><span aria-hidden="true">镜</span><div><strong>学镜学习空间</strong><p>Learning Mirror</p></div></div>
  <h1 id="login-title">{register?"创建账号":"登录学镜学习空间"}</h1>
  {checking?<p role="status">正在确认登录状态…</p>:<>
   {error&&<p className="loginError" role="alert">{error}</p>}
   <form onSubmit={submit} key={register?"register":"login"}>
    <label>账号<input name="username" required minLength={3} maxLength={80} pattern="[a-zA-Z0-9_.-]+" autoCapitalize="none" spellCheck={false} autoComplete="username" placeholder="字母、数字或 _ . -" disabled={busy}/></label>
    {register&&<label>昵称<input name="nickname" required maxLength={80} autoComplete="nickname" disabled={busy}/></label>}
    <label>密码<input name="password" type="password" required minLength={6} maxLength={128} autoComplete={register?"new-password":"current-password"} disabled={busy}/></label>
    {register&&<><label>确认密码<input name="confirm" type="password" required minLength={6} maxLength={128} autoComplete="new-password" disabled={busy}/></label>
     <label>身份<select value={role} onChange={e=>setRole(e.target.value)} disabled={busy}><option value="student">学生</option><option value="teacher">教师</option><option value="ta">助教</option></select></label>
     {role!=="student"&&<label>教师 / 助教邀请码<input name="invite" type="password" required maxLength={128} autoComplete="off" disabled={busy}/></label>}
     <p className="loginPrivacy">个人学习记录可在“档案与隐私”中管理、导出或删除。</p>
    </>}
    <button className="loginSubmit" disabled={busy}>{busy?"处理中…":register?"注册并进入":"登录"}</button>
   </form>
   <button className="loginToggle" disabled={busy} onClick={()=>{setRegister(!register);setError("");}}>{register?"已有账号？去登录":"没有账号？注册"}</button>
  </>}
 </section></main>;
}
