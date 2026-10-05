"use client";
type Row=Record<string,any>;
function group(value?:string){
 const date=new Date(value||"");if(Number.isNaN(date.getTime()))return "时间未记录";
 const today=new Date();today.setHours(0,0,0,0);const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
 return date>=today?"今天":date>=yesterday?"昨天":"更早";
}
export default function ChatHistoryList({sessions,activeId,onOpen}:{sessions:Row[];activeId?:string;onOpen:(row:Row)=>void}){
 return <>{["今天","昨天","更早","时间未记录"].map(label=>{
 const rows=sessions.filter(row=>group(row.created_at)===label);if(!rows.length)return null;
 return <section className="chatHistoryGroup" key={label} aria-label={label+"的会话"}><h3>{label}</h3>{rows.map(row=>{
 const d=new Date(row.created_at||"");const stamp=Number.isNaN(d.getTime())?"创建时间未记录":"创建于 "+d.toLocaleString("zh-CN");
 return <button key={row.id} title={stamp} aria-current={activeId===row.id?"true":undefined} onClick={()=>onOpen(row)}><span className="chatHistoryTitle">{row.title||"课程讨论"}</span><span className="chatHistoryTime">{stamp}</span></button>;
 })}</section>;
 })}</>;
}
