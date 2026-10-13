"use client";
import {useState} from "react";
import {isFollowUpTitle} from "./chat-quote.mjs";
type Row=Record<string,any>;
function group(value?:string){
 const date=new Date(value||"");if(Number.isNaN(date.getTime()))return "时间未记录";
 const today=new Date();today.setHours(0,0,0,0);const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
 return date>=today?"今天":date>=yesterday?"昨天":"更早";
}
function stampOf(row:Row){const d=new Date(row.created_at||"");return Number.isNaN(d.getTime())?"创建时间未记录":"创建于 "+d.toLocaleString("zh-CN");}
// 追问会话的标题由服务端从首条消息（以【引用追问】开头）生成，这里剥掉标记只留主题
function displayTitle(row:Row){const value=String(row.title||"课程讨论").replace(/^\s*【引用追问】\s*/,"").trim();return value||"引用追问";}

// 会话列表规则（用户要求）：「最近对话」里只允许出现主页面的提问会话；
// 追问一律折叠到父词条右侧的「追问 N」里，点开像目录一样一环套一环。
// 追问识别双通道：本地链路（followUpOf）优先，其次看服务端标题里的【引用追问】标记。
// 极少数既无链路、列表里也找不到父会话的追问（换设备/父会话已删）单独收进末尾的
// 「未关联的追问」折叠组，避免它们混进主对话列表、也避免彻底找不到。
export default function ChatHistoryList({sessions,activeId,onOpen,followUpOf}:{sessions:Row[];activeId?:string;onOpen:(row:Row)=>void;followUpOf?:(id:string)=>string|null}){
 const [open,setOpen]=useState<Record<string,boolean>>({});
 const [orphanOpen,setOrphanOpen]=useState(false);
 const byId=new Map(sessions.map(s=>[s.id,s]));
 const parentOf=(row:Row)=>{const parent=followUpOf?.(row.id);return parent&&byId.has(parent)?parent:null;};
 const isFollowUp=(row:Row)=>Boolean(followUpOf?.(row.id))||isFollowUpTitle(row.title);
 const kidsOf=(id:string)=>sessions.filter(s=>parentOf(s)===id).sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||"")));
 const countAll=(id:string):number=>kidsOf(id).reduce((n,k)=>n+1+countAll(k.id),0);
 const roots=sessions.filter(row=>!isFollowUp(row));
 const orphans=sessions.filter(row=>isFollowUp(row)&&!parentOf(row));

 function renderRow(item:Row,depth:number){
  const kids=kidsOf(item.id);
  const expanded=Boolean(open[item.id]);
  const stamp=stampOf(item);
  return <div className="chatHistoryThread" key={item.id}>
   <div className="chatHistoryRow" data-depth={depth}>
    <button title={stamp} aria-description={stamp} aria-current={activeId===item.id?"true":undefined} onClick={()=>onOpen(item)}>
     {isFollowUp(item)&&<span className="chatHistoryBadge">追问</span>}
     <span className="chatHistoryTitle">{displayTitle(item)}</span>
    </button>
    {kids.length>0&&<button type="button" className="chatHistoryKids" aria-expanded={expanded} aria-label={(expanded?"收起":"展开")+"追问，共 "+countAll(item.id)+" 条"} onClick={()=>setOpen(cur=>({...cur,[item.id]:!cur[item.id]}))}>追问 {countAll(item.id)}</button>}
   </div>
   {expanded&&kids.map(kid=>renderRow(kid,depth+1))}
  </div>;
 }

 return <>
  {["今天","昨天","更早","时间未记录"].map(label=>{
   const rows=roots.filter(item=>group(item.created_at)===label);if(!rows.length)return null;
   return <section className="chatHistoryGroup" key={label} aria-label={label+"的会话"}><h3>{label}</h3>{rows.map(item=>renderRow(item,0))}</section>;
  })}
  {orphans.length>0&&<section className="chatHistoryGroup chatHistoryOrphans" aria-label="未关联的追问">
   <button type="button" className="chatHistoryOrphanToggle" aria-expanded={orphanOpen} onClick={()=>setOrphanOpen(v=>!v)}>未关联的追问 {orphans.length} <span aria-hidden="true">{orphanOpen?"▾":"▸"}</span></button>
   <p className="chatHistoryOrphanNote">这些追问的父对话已不在当前列表（或来自其他设备），无法归入目录。</p>
   {orphanOpen&&orphans.map(item=>renderRow(item,0))}
  </section>}
 </>;
}
