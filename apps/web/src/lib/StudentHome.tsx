"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import ZjuSchedule from "./ZjuSchedule";
import StudentIcon from "./StudentIcon";
import {courseIntro} from "./course-intro";
type Row=Record<string,any>;
// Presentation only. The API, not this map, determines which courses exist.
const covers:Record<string,[string,string]>={mathematical_analysis:['math','Σ'],linear_algebra_analytic_geometry:['algebra','A'],university_physics:['physics','Φ'],point_set_topology:['topology','τ'],ordinary_differential_equations:['ode','∫'],python_programming:['python','</>'],electronic_circuits:['circuits','⊥'],psychology_applications:['psychology','Ψ'],college_english:['english','Aa']};
function due(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?'截止时间待确认':date.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}
export default function StudentHome({user,courses,ongoing,attempts,href}:{user:Row;courses:Row[];ongoing:Row[];attempts:Row[];href:(section?:string)=>string}){
 const [today,setToday]=useState<Date|null>(null);
 useEffect(()=>{setToday(new Date());const timer=setInterval(()=>setToday(new Date()),60000);return()=>clearInterval(timer);},[]);
 const hour=today?.getHours();const greeting=hour===undefined?'你好':hour<6?'夜深了':hour<12?'上午好':hour<18?'下午好':'晚上好';
 return <div className="lmStudentHome">
  <section className="lmWelcome" aria-labelledby="lm-welcome-title">
   <h1 id="lm-welcome-title">{greeting}，{user.nickname||'同学'}</h1>
   <p>{today&&<time dateTime={today.toISOString()}>{today.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})} · </time>}从今天的课程开始，继续你的学习。</p>
   <div className="lmWelcomeStats"><span><strong>{courses.length}</strong>可选课程</span><span><strong>{ongoing.length}</strong>进行中作业</span></div>
  </section>
  <div className="lmHomeSchedule" id="schedule"><ZjuSchedule/></div>
  <section aria-labelledby="lm-courses-title">
   <div className="lmHomeHeading"><h2 id="lm-courses-title">我的课程</h2></div>
   {courses.length?<div className="lmCourseGrid">{courses.map(course=>{const [color,symbol]=covers[course.course_id]||['math','∑'];return <Link className={'lmCourseCard lmCover-'+color} href={href('learn')+'&course='+encodeURIComponent(course.course_id)} key={course.course_id}>
    <span className="lmCourseIcon" aria-hidden="true">{symbol}</span><h3>{course.display_name}</h3><p className="lmCourseIntro">{courseIntro(course.course_id)}</p><span className="lmCourseAction">进入课程<StudentIcon name="arrow"/></span>
   </Link>;})}</div>:<p className="lmHomeEmpty">暂无可选课程</p>}
  </section>
  <div className="lmHomeColumns">
   <section className="lmHomeCard" aria-labelledby="lm-homework-title"><div className="lmHomeCardHeading"><h2 id="lm-homework-title"><StudentIcon name="file"/>进行中作业</h2><Link href={href('assignments')}>查看全部<span className="lmSrOnly">作业</span></Link></div>
    {ongoing.length?ongoing.slice(0,3).map(box=><Link className="lmHomeworkLink" href={href('assignments')} key={box.id}><span className="lmHomeworkDot" aria-hidden="true"/><span><strong>{box.title}</strong><small>截止：{due(box.expires_at)}</small></span><StudentIcon name="arrow"/></Link>):<p className="lmHomeEmpty">暂无进行中作业</p>}
   </section>
   <section className="lmHomeCard" aria-labelledby="lm-recent-title"><div className="lmHomeCardHeading"><h2 id="lm-recent-title"><StudentIcon name="chart"/>最近学习</h2><Link href={href('learn')}>查看全部<span className="lmSrOnly">学习记录</span></Link></div>
    {attempts.length?attempts.slice(0,3).map(attempt=><Link className="lmRecentLink" href={href('learn')+'&attempt='+encodeURIComponent(attempt.id)+'&course='+encodeURIComponent(attempt.course_id)} key={attempt.id}><span className="lmRecentIcon"><StudentIcon name="message"/></span><span>{courses.find(course=>course.course_id===attempt.course_id)?.display_name||'课程学习'}</span><StudentIcon name="arrow"/></Link>):<p className="lmHomeEmpty">暂无学习记录</p>}
   </section>
  </div>
 </div>;
}

export function StudentHomeStatus({error,onRetry}:{error?:string;onRetry:()=>void}){
 return <section className={'lmHomeStatus'+(error?' lmHomeStatusError':'')} aria-busy={!error}>
  {error?<><h1>暂时无法加载学习首页</h1><p role="alert">{error}</p><button type="button" onClick={onRetry}>重试</button><Link href="/login">返回登录</Link></>:<><p role="status">正在加载学习首页…</p><div className="lmHomeSkeleton" aria-hidden="true"/><div className="lmHomeSkeleton" aria-hidden="true"/></>}
 </section>;
}
