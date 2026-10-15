"use client";
import {useEffect,useState} from "react";
import StudentIcon from "./StudentIcon";

export const studentNav=[["","学习首页","home"],["learn","课程学习","message"],["ai","AI 学习","spark"],["notes","我的笔记","note"],["resources","资源中心","library"],["assignments","我的作业","file"],["observations","学习反馈","chart"],["privacy","档案与隐私","shield"]];

const COLLAPSE_KEY="learning-mirror.sidebar.collapsed.v1";

// 左侧导航可折叠：折叠后只留图标，把空间让给内容区；状态存在本机。
export default function StudentSidebar({section,href,role,demo,onLogout,loggingOut=false}:{section:string;href:(section?:string)=>string;role?:string;demo:boolean;onLogout?:()=>void;loggingOut?:boolean}){
 const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{
  try{if(window.localStorage.getItem(COLLAPSE_KEY)==="1")setCollapsed(true);}catch{/* 隐私模式：用默认展开 */}
 },[]);
 function toggle(){
  setCollapsed(cur=>{
   const next=!cur;
   try{window.localStorage.setItem(COLLAPSE_KEY,next?"1":"0");}catch{/* 存不了也不影响本次折叠 */}
   return next;
  });
 }
 return <aside className={"lmStudentSidebar"+(collapsed?" isCollapsed":"")}>
  <div className="lmSidebarHead">
   <a href={href()} className="lmStudentLogo" aria-label="学镜学习空间首页"><span className="lmLogoMark" aria-hidden="true">镜</span><span className="lmSidebarLabel">学镜学习空间<span className="lmLogoEnglish">Learning Mirror</span></span></a>
   <button type="button" className="lmSidebarToggle" aria-label={collapsed?"展开左侧导航":"收起左侧导航"} aria-expanded={!collapsed} title={collapsed?"展开左侧导航":"收起左侧导航"} onClick={toggle}><StudentIcon name="menu"/></button>
  </div>
  <nav aria-label="学生端导航">{studentNav.map(([key,label,icon])=><a key={key} href={href(key)} aria-label={label} title={label} aria-current={(section===key||(key==='ai'&&section.startsWith('ai/')))?'page':undefined}><StudentIcon name={icon}/><span className="lmSidebarLabel">{label}</span></a>)}</nav>
  <div className="lmSidebarFooter">
   {(role==='teacher'||role==='ta')&&<a href={'/teacher?mode='+(demo?'demo':'live')} aria-label="切换到教师端" title="切换到教师端"><StudentIcon name="switch"/><span className="lmSidebarLabel">切换到教师端</span></a>}
   {demo?<a href={'/student'+(section?'/'+section:'')+'?mode=live'} aria-label="登录" title="登录"><StudentIcon name="logout"/><span className="lmSidebarLabel">登录</span></a>:onLogout&&<button type="button" onClick={onLogout} disabled={loggingOut} aria-label="退出登录" title="退出登录"><StudentIcon name="logout"/><span className="lmSidebarLabel">{loggingOut?'正在退出…':'退出登录'}</span></button>}
  </div>
 </aside>;
}
