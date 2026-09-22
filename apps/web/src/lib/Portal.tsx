"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import ZjuSchedule from "./ZjuSchedule";
import Pilot,{ApiError,liveApi} from "./Pilot";
import AILearning from "./AILearning";
import {demoApi,demoCourses,PortalRole} from "./demoApi";
import "./portal.css";
import "./login.css";
type Row=Record<string,any>;
const studentNav=[["","学习首页","home"],["learn","课程学习","book"],["ai","AI 学习","spark"],["resources","资源中心","library"],["assignments","我的作业","file"],["observations","学习反馈","chart"],["privacy","档案与隐私","shield"]];
const teacherNav=[["","教学总览","home"],["assignments","作业管理","file"],["review","作品批改","pen"],["reports","教学报告","chart"],["course","课程建设","book"],["settings","账号与设置","shield"]];
function Icon({name}:{name:string}){
 const paths:Record<string,string>={
  home:"M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  book:"M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  file:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 12h8M8 16h6",
  pen:"M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  chart:"M3 3v18h18M7 16l4-4 3 3 5-6",
  shield:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  arrow:"M5 12h14m-6-6 6 6-6 6",
  switch:"M17 3l4 4-4 4M21 7H7M7 21l-4-4 4-4M3 17h14",
  plus:"M12 5v14M5 12h14",
  search:"M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z",
  bell:"M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
  clock:"M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM12 6v6l4 2",
  check:"M22 11.08V12a10 10 0 1 1-5.93-9.14M9 11l3 3L22 4",
  users:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  spark:"m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z",
  download:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  message:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  target:"M12 3v18M3 12h18M12 3a9 9 0 0 1 0 18 9 9 0 0 1 0-18z",
  library:"M3 21V8a1 1 0 0 1 1-1h5a2 2 0 0 1 2 2v12M9 4v16M9 19h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H9M3 21h6",
 };
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.file}/></svg>;
}
export default function Portal({role,section=""}:{role:PortalRole;section?:string}){
 const router=useRouter();
 const [demo,setDemo]=useState<boolean|null>(null),[data,setData]=useState<Row|null>(null),[error,setError]=useState(""),[reload,setReload]=useState(0);
 const teacher=role==="teacher",nav=teacher?teacherNav:studentNav,base="/"+role;
 useEffect(()=>{const signOut=()=>{setData({signedOut:true});router.replace("/login");};window.addEventListener("mirror:signed-out",signOut);return()=>window.removeEventListener("mirror:signed-out",signOut);},[router]);
 useEffect(()=>{setDemo(["localhost","127.0.0.1"].includes(window.location.hostname)&&new URLSearchParams(window.location.search).get("mode")==="demo");},[]);
 useEffect(()=>{if(demo===null)return;let live=true;setError("");setData(null);
 const api=(p:string)=>demo?demoApi(role,p):liveApi(p);
 async function load(){
  const user=await liveApi("/me");
  if(teacher&&!["teacher","ta"].includes(user.role)){if(live)router.replace("/student");return;}
  const [courses,boxes]=await Promise.all([api("/courses"),api("/sandboxes")]);
  const personal=!teacher&&!section?{attempts:await api("/attempts")}:{};
  const details=teacher&&!section?await Promise.all(boxes.map(async(b:Row)=>({box:b,submissions:await api("/sandboxes/"+b.id+"/submissions")}))):[];
  if(live)setData({user,courses,boxes,...personal,details});
 }
 load().catch(e=>{if(!live)return;if(e instanceof ApiError&&e.status===401){setData({signedOut:true});router.replace("/login");}else setError(e instanceof Error?e.message:String(e));});return()=>{live=false;};},[demo,role,reload,section]);
 const href=(s="")=>base+(s?"/"+s:"")+(demo?"?mode=demo":"?mode=live");
 const title=section.startsWith("ai")?"AI 学习":nav.find(n=>n[0]===section)?.[1]||"首页";
 const initial=teacher?section==="course"?"builder":section==="settings"?"account":"sandboxes":section==="observations"?"memory":section==="privacy"?"account":section==="assignments"?"sandboxes":section==="resources"?"resources":"learn";
 const works=data?.details?.flatMap((d:Row)=>d.submissions.map((s:Row)=>({...s,title:d.box.title})))||[];
 const ongoing=data?.boxes?.filter((b:Row)=>b.status==="open")||[];
 const pending=works.filter((w:Row)=>!w.review.decision);
 if(!data&&!error||data?.signedOut)return <main className="loginPage"><p role="status">正在确认登录状态…</p></main>;
 if(error&&!data)return <main className="loginPage"><section className="loginSurface"><p role="alert">{error}</p><button onClick={()=>setReload(n=>n+1)}>重试</button><p><Link href="/login">返回登录</Link></p></section></main>;
 return <div className={"portal "+(teacher?"teacherPortal":"studentPortal")}>
 <aside className="portalSidebar">
 <Link href={href()} className="portalLogo"><span className="logoMark">镜</span><span>学镜<span className="brandEnglish">Learning Mirror</span></span></Link>
 <div className="portalRole"><strong>{teacher?"教师工作台":"学生工作台"}</strong></div>
 <nav aria-label={teacher?"教师端导航":"学生端导航"}>{nav.map(([key,label,icon])=><Link key={key} href={href(key)} aria-current={section===key?"page":undefined}><Icon name={icon}/>{label}</Link>)}</nav>
 <div className="sidebarBottom"><Link href={"/"+(teacher?"student":"teacher")+(demo?"?mode=demo":"?mode=live")}><Icon name="switch"/>{teacher?"切换到学生端":"切换到教师端"}</Link></div>
 </aside>
 <div className="portalWorkspace">
 <header className="portalTopbar"><strong>{title}</strong><div className="topbarRight">
 {demo&&<span className="sampleBadge">示例数据</span>}
 <Link className="mobileSwitch" href={"/"+(teacher?"student":"teacher")+(demo?"?mode=demo":"?mode=live")}>{teacher?"学生端":"教师端"}</Link>
 {demo?<a href={base+(section?"/"+section:"")+"?mode=live"}>登录</a>:data?.user&&<button onClick={async()=>{await liveApi("/auth/logout","POST");router.replace("/login");setData({signedOut:true});}}>退出登录</button>}
 </div></header>
 <main className="portalContent">
 {demo===null?<p role="status">加载中…</p>
 :error||data?.wrongRole?<><div className="portalError" role="alert">{data?.wrongRole?"请使用教师账号登录":error}</div><Pilot key={role+"-"+reload} initial={initial as any} portal={role} section={section} onLogin={()=>setReload(n=>n+1)}/></>
 :!data?<p role="status">加载中…</p>
 :!teacher&&section.startsWith("ai")?<AILearning key={section} section={section}/>
 :section?<Pilot key={role+"-"+section+"-"+demo+"-"+reload} initial={initial as any} portal={role} demonstration={demo} section={section}/>
 :<><div className="pageHeading"><h1>{teacher?"教学总览":"学习首页"}</h1><Link className="solidLink" href={href(teacher?"assignments":"learn")}>{teacher?"布置作业":"开始学习"}</Link></div>
 {teacher?<><div className="overviewStats">{[[ongoing.length,"进行中作业"],[works.length,"已提交"],[pending.length,"待批改"]].map(([n,label])=><div key={String(label)}><span>{label}</span><strong>{n}</strong></div>)}</div>
 <div className="dashboardColumns">
 <section className="portalPanel"><div className="panelHeading"><h2>待批改</h2><Link href={href("review")}>全部</Link></div>
 {pending.slice(0,5).map((s:Row)=><Link className="workRow" href={href("review")} key={s.id}><div><strong>{s.participant}</strong><p>{s.title}</p></div><span className="statusTag pending">待批改</span></Link>)}
 {!pending.length&&<p>暂无待批改作品</p>}</section>
 <section className="portalPanel"><div className="panelHeading"><h2>进行中作业</h2><Link href={href("assignments")}>全部</Link></div>{ongoing.slice(0,4).map((b:Row)=><Link className="assignmentPreview" href={href("assignments")} key={b.id}><h3>{b.title}</h3><p>截止：{new Date(b.expires_at).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</p></Link>)}{!ongoing.length&&<p>暂无进行中作业</p>}</section>
 </div></>
 :<><div className="homeSchedule" id="schedule"><ZjuSchedule/></div><h2>我的课程</h2><div className="courseTiles">{data.courses.map((c:Row)=>{const v=demoCourses.find(d=>d.course_id===c.course_id);return <Link key={c.course_id} href={href("learn")+"&"+"course="+encodeURIComponent(c.course_id)} className={"courseTile "+(v?.color||"blue")}><span className="courseSymbol">{v?.symbol||"∑"}</span><h2>{c.display_name}</h2>{v?.topic&&<p className="courseTopic">{v.topic}</p>}<span className="courseAction">进入课程 <Icon name="arrow"/></span></Link>;})}</div>
 <div className="dashboardColumns studentBottom"><section className="portalPanel"><div className="panelHeading"><h2>待完成作业</h2><Link href={href("assignments")}>全部</Link></div>{ongoing.slice(0,3).map((b:Row)=><Link className="assignmentPreview" href={href("assignments")} key={b.id}><h3>{b.title}</h3><p>截止：{new Date(b.expires_at).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</p></Link>)}{!ongoing.length&&<p>暂无作业</p>}</section>
 <section className="portalPanel"><div className="panelHeading"><h2>最近学习</h2><Link href={href("learn")}>全部</Link></div>{data.attempts?.slice(0,3).map((a:Row)=><Link className="recentLearning" href={href("learn")+"&"+"attempt="+a.id+"&course="+a.course_id} key={a.id}>{data.courses.find((c:Row)=>c.course_id===a.course_id)?.display_name||"课程学习"}<Icon name="arrow"/></Link>)}{!data.attempts?.length&&<p>暂无学习记录</p>}</section></div></>}
 </>}
 </main></div></div>;
}
