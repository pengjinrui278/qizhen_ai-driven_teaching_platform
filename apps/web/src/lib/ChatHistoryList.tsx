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
// 既无本地链路、列表里也找不到父会话的追问（换设备/父会话已删）不再出现在列表里：
// 它们不是主对话、也无法归入目录。数据仍保留在服务器上，只是不在这里展示。
export default function ChatHistoryList({sessions,activeId,onOpen,followUpOf,onRename,onDelete,busy}:{
 sessions:Row[];activeId?:string;onOpen:(row:Row)=>void;followUpOf?:(id:string)=>string|null;
 // 自己管理历史：改名走 patch，删除要二次确认（删了就没了，连消息一起）
 onRename?:(row:Row,title:string)=>Promise<void>|void;onDelete?:(row:Row)=>Promise<void>|void;busy?:boolean;
}){
 const [open,setOpen]=useState<Record<string,boolean>>({});
 const [menu,setMenu]=useState<string>("");          // 展开了哪一行的操作菜单
 const [editing,setEditing]=useState<{id:string;title:string}|null>(null);
 const [pendingDelete,setPendingDelete]=useState<Row|null>(null);
 const byId=new Map(sessions.map(s=>[s.id,s]));
 const parentOf=(row:Row)=>{const parent=followUpOf?.(row.id);return parent&&byId.has(parent)?parent:null;};
 const isFollowUp=(row:Row)=>Boolean(followUpOf?.(row.id))||isFollowUpTitle(row.title);
 const kidsOf=(id:string)=>sessions.filter(s=>parentOf(s)===id).sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||"")));
 const countAll=(id:string):number=>kidsOf(id).reduce((n,k)=>n+1+countAll(k.id),0);
 const roots=sessions.filter(row=>!isFollowUp(row));

 const manage=Boolean(onRename||onDelete);

 function renderRow(item:Row,depth:number){
  const kids=kidsOf(item.id);
  const expanded=Boolean(open[item.id]);
  const stamp=stampOf(item);
  const isEditing=editing?.id===item.id;
  return <div className="chatHistoryThread" key={item.id}>
   <div className="chatHistoryRow" data-depth={depth}>
    {isEditing?<form className="chatHistoryRename" onSubmit={e=>{e.preventDefault();
      const next=(editing?.title||"").trim();
      if(!next){setEditing(null);return;}
      void Promise.resolve(onRename?.(item,next)).then(()=>setEditing(null));}}>
     <input autoFocus value={editing?.title||""} maxLength={120} aria-label="对话名称"
      onChange={e=>setEditing(cur=>cur&&{...cur,title:e.target.value})}
      onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();setEditing(null);}}}/>
     <button type="submit" disabled={busy}>保存</button>
     <button type="button" disabled={busy} onClick={()=>setEditing(null)}>取消</button>
    </form>:<>
     <button title={stamp} aria-description={stamp} aria-current={activeId===item.id?"true":undefined} onClick={()=>onOpen(item)}>
      {isFollowUp(item)&&<span className="chatHistoryBadge">追问</span>}
      <span className="chatHistoryTitle" style={{display:"block",width:"100%",color:"#0f172a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",boxSizing:"border-box"}}>{displayTitle(item)}</span>
     </button>
     {manage&&<button type="button" className="chatHistoryMore" aria-haspopup="menu"
      aria-expanded={menu===item.id} aria-label={"管理对话："+displayTitle(item)}
      onClick={()=>setMenu(cur=>cur===item.id?"":item.id)}>⋯</button>}
    </>}
    {kids.length>0&&<button type="button" className="chatHistoryKids" aria-expanded={expanded} aria-label={(expanded?"收起":"展开")+"追问，共 "+countAll(item.id)+" 条"} onClick={()=>setOpen(cur=>({...cur,[item.id]:!cur[item.id]}))}>追问 {countAll(item.id)}</button>}
   </div>
   {menu===item.id&&<div className="chatHistoryMenu" role="menu">
    {onRename&&<button type="button" role="menuitem" onClick={()=>{setMenu("");setEditing({id:item.id,title:displayTitle(item)});}}>重命名</button>}
    {onDelete&&<button type="button" role="menuitem" className="isDanger" onClick={()=>{setMenu("");setPendingDelete(item);}}>删除</button>}
   </div>}
   {expanded&&kids.map(kid=>renderRow(kid,depth+1))}
  </div>;
 }

 return <>
  {["今天","昨天","更早","时间未记录"].map(label=>{
   const rows=roots.filter(item=>group(item.created_at)===label);if(!rows.length)return null;
   return <section className="chatHistoryGroup" key={label} aria-label={label+"的会话"}><h3>{label}</h3>{rows.map(item=>renderRow(item,0))}</section>;
  })}
  {/* 删除不可撤销，必须二次确认，并且说清会连带删掉什么 */}
  {pendingDelete&&<div className="chatHistoryConfirmBackdrop" role="presentation" onClick={()=>setPendingDelete(null)}>
   <section className="chatHistoryConfirm" role="dialog" aria-label="删除对话" onClick={e=>e.stopPropagation()}>
    <h3>删除这段对话？</h3>
    <p>《{displayTitle(pendingDelete)}》连同它下面的全部问答会一起删掉，删了无法恢复。</p>
    <div className="chatHistoryConfirmActions">
     <button type="button" className="isDanger" disabled={busy}
      onClick={()=>{const row=pendingDelete;setPendingDelete(null);void onDelete?.(row);}}>确认删除</button>
     <button type="button" disabled={busy} onClick={()=>setPendingDelete(null)}>取消</button>
    </div>
   </section>
  </div>}
 </>;
}
