"use client";
import {useState} from "react";
type Row=Record<string,any>;
function group(value?:string){
 const date=new Date(value||"");if(Number.isNaN(date.getTime()))return "时间未记录";
 const today=new Date();today.setHours(0,0,0,0);const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
 return date>=today?"今天":date>=yesterday?"昨天":"更早";
}
function stampOf(row:Row){const d=new Date(row.created_at||"");return Number.isNaN(d.getTime())?"创建时间未记录":"创建于 "+d.toLocaleString("zh-CN");}
// 追问会话的标题由服务端从首条消息（以【引用追问】开头）生成，这里剥掉标记只留主题
function displayTitle(row:Row){const value=String(row.title||"课程讨论").replace(/^\s*【引用追问】\s*/,"").trim();return value||"引用追问";}
export default function ChatHistoryList({sessions,activeId,onOpen,followUpOf}:{sessions:Row[];activeId?:string;onOpen:(row:Row)=>void;followUpOf?:(id:string)=>string|null}){
 const [open,setOpen]=useState<Record<string,boolean>>({});
 const ids=new Set(sessions.map(s=>s.id));
 const isChild=(row:Row)=>{const parent=followUpOf?.(row.id);return Boolean(parent&&ids.has(parent));};
 const roots=sessions.filter(row=>!isChild(row));
 return <>{["今天","昨天","更早","时间未记录"].map(label=>{
 const rows=roots.filter(row=>group(row.created_at)===label);if(!rows.length)return null;
 return <section className="chatHistoryGroup" key={label} aria-label={label+"的会话"}><h3>{label}</h3>{rows.map(row=>{
 const stamp=stampOf(row);
 const kids=followUpOf?sessions.filter(s=>followUpOf(s.id)===row.id):[];
 const expanded=Boolean(open[row.id]);
 return <div className="chatHistoryThread" key={row.id}>
  <div className="chatHistoryRow">
   <button title={stamp} aria-description={stamp} aria-current={activeId===row.id?"true":undefined} onClick={()=>onOpen(row)}><span className="chatHistoryTitle">{displayTitle(row)}</span></button>
   {kids.length>0&&<button type="button" className="chatHistoryKids" aria-expanded={expanded} aria-label={"展开或收起追问，共 "+kids.length+" 条"} onClick={()=>setOpen(cur=>({...cur,[row.id]:!cur[row.id]}))}>{expanded?"▾":"▸"}追问 {kids.length}</button>}
  </div>
  {expanded&&kids.map(kid=><button key={kid.id} className="chatHistoryChild" title={stampOf(kid)} aria-description={stampOf(kid)} aria-current={activeId===kid.id?"true":undefined} onClick={()=>onOpen(kid)}><span className="chatHistoryBadge">追问</span><span className="chatHistoryTitle">{displayTitle(kid)}</span></button>)}
 </div>;
 })}</section>;
 })}</>;
}
