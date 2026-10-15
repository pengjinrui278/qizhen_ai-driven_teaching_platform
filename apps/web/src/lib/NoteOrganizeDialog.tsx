"use client";
import {useEffect,useMemo,useState} from "react";
import {bulkNotes,listNotes,type Note} from "./note-store";

// 整理我的笔记：先摆出一个「把 N 份笔记移到 科目 › 目录」的方案，用户确认后才动。
// 方案由已存在的数据算出（哪些笔记还堆在科目根），不让模型去猜文件该放哪，
// 免得一次幻觉式移动把学生的笔记搬得到处都是。
export default function NoteOrganizeDialog({courses,onClose,onDone}:{
 courses:Record<string,any>[];onClose:()=>void;onDone:(count:number)=>void;
}){
 const [notes,setNotes]=useState<Note[]|null>(null);
 const [targets,setTargets]=useState<Record<string,string>>({});
 const [picked,setPicked]=useState<Record<string,boolean>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");

 useEffect(()=>{
  listNotes({}).then(data=>{
   setNotes(data.items);
   const defaults:Record<string,boolean>={};
   for(const note of data.items)if(!note.folder_path)defaults[note.course_id]=true;
   setPicked(defaults);
  }).catch(e=>setError(e instanceof Error?e.message:"笔记加载失败"));
 },[]);

 const label=(courseId:string)=>courses.find(c=>c.course_id===courseId)?.display_name||courseId;
 const unfiled=useMemo(()=>{
  const groups=new Map<string,Note[]>();
  for(const note of notes||[])if(!note.folder_path)groups.set(note.course_id,[...(groups.get(note.course_id)||[]),note]);
  return [...groups.entries()];
 },[notes]);

 const moves=unfiled.filter(([courseId])=>picked[courseId]&&(targets[courseId]||"").trim());
 const total=moves.reduce((sum,[,items])=>sum+items.length,0);

 async function apply(){
  setBusy(true);setError("");
  try{
   // 一次端点调用只定一个目录，所以按科目逐个移动
   for(const [courseId,items] of moves)
    await bulkNotes({ids:items.map(n=>n.id),folder_path:targets[courseId].trim()});
   onDone(total);
  }catch(e){setError(e instanceof Error?e.message:"整理失败");}
  finally{setBusy(false);}
 }

 return <div className="npBackdrop" role="presentation" onClick={onClose}>
  <section className="npPanel" role="dialog" aria-label="整理我的笔记" onClick={e=>e.stopPropagation()}>
   <header className="npHead">
    <div><h2>整理我的笔记</h2>
     <p>下面这些笔记还堆在科目根目录。选好目标目录、点确认，agent 才会动手；不点就不会移动。</p></div>
    <button type="button" onClick={onClose}>关闭</button>
   </header>

   {error&&<p className="npError" role="alert">{error}</p>}
   {!notes?<p className="npLoading" role="status">正在读取你的笔记…</p>
    :!unfiled.length?<p className="npLoading">没有需要整理的笔记——每一份都已经在目录里了。</p>
    :<ul className="noPlan">{unfiled.map(([courseId,items])=>
      <li key={courseId}>
       <label className="noPick">
        <input type="checkbox" checked={!!picked[courseId]} onChange={e=>setPicked({...picked,[courseId]:e.target.checked})}/>
        <span>把 <strong>{items.length}</strong> 份笔记从「{label(courseId)} › 科目根」移到</span>
       </label>
       <input className="noFolder" aria-label={`${label(courseId)} 的目标目录`} value={targets[courseId]||""}
        maxLength={200} placeholder="目标目录，例如：第8章 反常积分"
        onChange={e=>setTargets({...targets,[courseId]:e.target.value})}/>
       <p className="noList">{items.slice(0,4).map(n=>n.title).join("、")}{items.length>4?` 等 ${items.length} 份`:""}</p>
      </li>)}
     </ul>}

   <div className="npActions">
    <button type="button" className="npPrimary" disabled={busy||!moves.length} onClick={()=>void apply()}>
     {busy?"整理中…":total?`确认移动 ${total} 份笔记`:"确认移动"}</button>
    <button type="button" disabled={busy} onClick={onClose}>取消</button>
    {!moves.length&&!!unfiled.length&&<span className="npNote">勾选并填好目标目录后才能确认。</span>}
   </div>
  </section>
 </div>;
}
