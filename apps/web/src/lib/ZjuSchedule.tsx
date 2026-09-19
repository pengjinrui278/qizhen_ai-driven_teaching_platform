"use client";

import {ChangeEvent,useEffect,useMemo,useRef,useState} from "react";

type ScheduleCourse={
 id:string;
 source:"zju-undergraduate";
 course_id:string|null;
 course_name:string;
 teacher:string;
 location:string|null;
 day_of_week:number;
 periods:number[];
 first_half:boolean;
 second_half:boolean;
 week_pattern:"all"|"odd"|"even";
 confirmed:boolean;
};

type ScheduleSnapshot={
 schema_version:1;
 source:"zju-local-connector";
 academic_year_start:number;
 season:string;
 courses:ScheduleCourse[];
 assignments:unknown[];
 fetched_at?:string;
};

const STORAGE_KEY="learning-mirror.zju-schedule.v1";
const CONNECTOR_ORIGINS=new Set(["http://127.0.0.1:8765","http://localhost:8765"]);
const DAYS=["周一","周二","周三","周四","周五","周六","周日"];
const SEASONS:Record<string,string>={"1|秋":"秋学季","1|冬":"冬学季","2|春":"春学季","2|夏":"夏学季"};
const WEEK_LABELS:Record<string,string>={all:"每周",odd:"单周",even:"双周"};

function asCourse(value:unknown):value is ScheduleCourse{
 if(!value||typeof value!=="object")return false;
 const row=value as Partial<ScheduleCourse>;
 return typeof row.id==="string"&&row.source==="zju-undergraduate"&&typeof row.course_name==="string"&&
  typeof row.teacher==="string"&&Number.isInteger(row.day_of_week)&&Number(row.day_of_week)>=1&&Number(row.day_of_week)<=7&&
  Array.isArray(row.periods)&&row.periods.length>0&&row.periods.every(period=>Number.isInteger(period)&&period>=1&&period<=20)&&
  ["all","odd","even"].includes(String(row.week_pattern));
}

function asSnapshot(value:unknown):ScheduleSnapshot{
 if(!value||typeof value!=="object")throw new Error("课表文件不是有效对象");
 const row=value as Partial<ScheduleSnapshot>;
 if(row.schema_version!==1||row.source!=="zju-local-connector"||!Number.isInteger(row.academic_year_start)||!Array.isArray(row.courses)||!row.courses.every(asCourse)){
  throw new Error("课表文件不是学镜本地连接器导出的格式");
 }
 return {...row,season:String(row.season||""),assignments:Array.isArray(row.assignments)?row.assignments:[]} as ScheduleSnapshot;
}

function readStored():ScheduleSnapshot|null{
 try{return asSnapshot(JSON.parse(window.localStorage.getItem(STORAGE_KEY)||"null"));}
 catch{return null;}
}

function saveStored(snapshot:ScheduleSnapshot){window.localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot));}

export default function ZjuSchedule(){
 const [snapshot,setSnapshot]=useState<ScheduleSnapshot|null>(null);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const fileRef=useRef<HTMLInputElement|null>(null);
 const connectorWindow=useRef<Window|null>(null);
 useEffect(()=>{setSnapshot(readStored());},[]);
 useEffect(()=>{
  const receive=(event:MessageEvent)=>{
   if(event.source!==connectorWindow.current||!CONNECTOR_ORIGINS.has(event.origin)||event.data?.type!=="learning-mirror-zju-snapshot")return;
   try{const next=asSnapshot(event.data.payload);saveStored(next);setSnapshot(next);setError("");setNotice("课表已从本地连接器更新");}
   catch(reason){setError(reason instanceof Error?reason.message:"无法读取本地课表");}
  };
  window.addEventListener("message",receive);return()=>window.removeEventListener("message",receive);
 },[]);
 const byDay=useMemo(()=>DAYS.map((_,index)=>(snapshot?.courses||[]).filter(course=>course.day_of_week===index+1).sort((a,b)=>a.periods[0]-b.periods[0])),[snapshot]);
 const openConnector=()=>{
  setError("");setNotice("请在新窗口完成本人统一认证；账号密码不会发送到学镜服务器。");
  const target="http://127.0.0.1:8765/?return_origin="+encodeURIComponent(window.location.origin);
  const popup=window.open(target,"learning-mirror-zju-connector","popup=yes,width=940,height=820");
  connectorWindow.current=popup;
  if(!popup)setError("浏览器阻止了本地连接器窗口，请允许弹窗后重试。");
 };
 const importFile=async(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.target.files?.[0];if(!file)return;
  try{const next=asSnapshot(JSON.parse(await file.text()));saveStored(next);setSnapshot(next);setError("");setNotice("已导入本地课表文件");}
  catch(reason){setError(reason instanceof Error?reason.message:"课表文件无法读取");}
  finally{event.target.value="";}
 };
 const clear=()=>{window.localStorage.removeItem(STORAGE_KEY);setSnapshot(null);setNotice("已从当前浏览器清除课表");setError("");};
 const term=snapshot?`${snapshot.academic_year_start}—${snapshot.academic_year_start+1} · ${SEASONS[snapshot.season]||snapshot.season}`:"";
 return <section className="zjuSchedule" aria-labelledby="zju-schedule-title">
  <div className="zjuScheduleHero">
   <div><p className="zjuScheduleEyebrow">ZJU · PERSONAL TIMETABLE</p><h2 id="zju-schedule-title">我的浙大课表</h2><p>统一认证在你的电脑上完成。工作台只接收整理后的课程时间，不接触学号、密码或校园 Cookie。</p></div>
   <div className="zjuScheduleActions"><button className="zjuConnectButton" onClick={openConnector}>在本机连接浙大</button><button onClick={()=>fileRef.current?.click()}>导入连接器 JSON</button><input ref={fileRef} className="zjuHiddenInput" type="file" accept="application/json,.json" onChange={importFile}/></div>
  </div>
  <div className="zjuPrivacyRail"><span>密码不离开电脑</span><span>Cookie 仅在本地内存</span><span>课表仅存当前浏览器</span></div>
  {notice&&<p className="zjuScheduleNotice" role="status">{notice}</p>}
  {error&&<div className="rcError" role="alert">{error}<p>若连接器尚未启动，请先运行仓库中的 <code>apps/zju-connector/start-local.bat</code>。</p></div>}
  {!snapshot?<div className="zjuScheduleEmpty"><div className="zjuEmptyWeek" aria-hidden="true">一<span>二</span><span>三</span><span>四</span><span>五</span></div><h3>把分散的课程接进今天</h3><p>点击“在本机连接浙大”，在新窗口输入本人统一认证学号和密码。同步完成后，课表会自动回到这里。</p><p className="zjuScheduleFallback">连接器窗口没有自动返回？在本地窗口下载 JSON，再从这里导入。</p></div>:<>
   <div className="zjuScheduleMeta"><div><span>当前学期</span><strong>{term}</strong></div><div><span>课表项</span><strong>{snapshot.courses.length}</strong></div><div><span>更新时间</span><strong>{snapshot.fetched_at?new Date(snapshot.fetched_at).toLocaleString("zh-CN",{hour12:false}):"本地导入"}</strong></div><button onClick={clear}>清除本机课表</button></div>
   <div className="zjuWeekGrid" role="table" aria-label={term+"课表"}>{DAYS.map((day,index)=><section className="zjuDayColumn" role="rowgroup" key={day}><h3>{day}</h3>{byDay[index].length?byDay[index].map(course=><article className="zjuCourseSlip" key={course.id}><div className="zjuCoursePeriods">{course.periods.length===1?`第 ${course.periods[0]} 节`:`${course.periods[0]}—${course.periods.at(-1)} 节`}</div><h4>{course.course_name}</h4><p>{course.teacher}</p><p>{course.location||"地点待定"}</p><span>{WEEK_LABELS[course.week_pattern]||"每周"}{course.first_half&&!course.second_half?" · 前半学季":course.second_half&&!course.first_half?" · 后半学季":""}</span></article>):<p className="zjuNoCourse">无课</p>}</section>)}</div>
  </>}
 </section>;
}
