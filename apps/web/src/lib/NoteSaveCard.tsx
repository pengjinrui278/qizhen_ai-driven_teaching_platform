"use client";
import {useEffect,useMemo,useState} from "react";
import {createNote,getNote,listNotes,patchNote,type Note} from "./note-store";
import {NOTE_CONTENT_LIMIT,cleanNoteBody,loadNoteDefaults,mergeRisk,rememberSaved,saveNoteDefaults,
  suggestNoteDraft,type NoteMarker} from "./note-prefs";

export type SaveTarget={answer:string;courseId:string;marker?:NoteMarker|null;
  chat?:{page:"chat"|"ai";attempt_id?:string|null;request_id?:string|null;
        session_id?:string|null;message_id?:string|null}};

const FORMATS:[string,string][]=[["markdown","Markdown"],["word","Word"],["ppt","PPT"],["printable_html","可打印 HTML"]];

// 「存为笔记」确认卡：agent 不直接写库，先把预填好的位置摆出来让用户确认。
// 保存方式默认「新建一份」——并入必须当次显式选择，避免所有笔记堆进同一个文件。
export default function NoteSaveCard({target,courses,userId,onClose,onSaved}:{
 target:SaveTarget;courses:Record<string,any>[];userId?:string;
 onClose:()=>void;onSaved:(note:Note)=>void;
}){
 const courseLabel=courses.find(c=>c.course_id===target.courseId)?.display_name||target.courseId||"课程";
 const [draft,setDraft]=useState(()=>suggestNoteDraft({
  answer:target.answer,courseId:target.courseId,courseLabel,
  marker:target.marker,defaults:loadNoteDefaults(userId)}));
 const [mode,setMode]=useState<"new"|"merge">("new");
 const [remember,setRemember]=useState(false);
 const [mergeInto,setMergeInto]=useState("");
 const [targets,setTargets]=useState<Note[]>([]);
 const [mergeBody,setMergeBody]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [saved,setSaved]=useState<Note|null>(null);

 // 并入候选：本人笔记，按目录分组展示
 useEffect(()=>{
  if(mode!=="merge")return;
  listNotes({}).then(data=>setTargets(data.items)).catch(()=>setTargets([]));
 },[mode]);

 useEffect(()=>{
  if(mode!=="merge"||!mergeInto){setMergeBody("");return;}
  getNote(mergeInto).then(note=>setMergeBody(note.content||"")).catch(()=>setMergeBody(""));
 },[mode,mergeInto]);

 const body=useMemo(()=>cleanNoteBody(target.answer,draft.title),[target.answer,draft.title]);
 const grouped=useMemo(()=>{
  const groups=new Map<string,Note[]>();
  for(const note of targets)groups.set(note.folder_path||"科目根",[...(groups.get(note.folder_path||"科目根")||[]),note]);
  return [...groups.entries()];
 },[targets]);

 const risk=mergeInto&&mergeBody!==undefined
  ?mergeRisk({content:mergeBody,title:""},body.length):null;
 const overLimit=mode==="new"&&body.length>NOTE_CONTENT_LIMIT;

 async function save(){
  setBusy(true);setError("");
  try{
   const sourceMeta={v:1,origin:target.chat?.page==="ai"?"ai_chat":"chat",course_id:draft.courseId,
    attempt_id:target.chat?.attempt_id??null,request_id:target.chat?.request_id??null,
    ai_session_id:target.chat?.session_id??null,ai_message_id:target.chat?.message_id??null,
    textbook:target.marker?.src?.k==="chapter"
      ?{source_id:target.marker.src.sid,chapter:target.marker.src.ch}:null,
    prefs:target.marker?.p??null,free_text:target.marker?.free??"",
    generated_at:new Date().toISOString()};
   let note:Note;
   if(mode==="merge"&&mergeInto){
    const appended=`\n\n---\n\n${body}`;
    note=await patchNote(mergeInto,{content:(mergeBody||"")+appended,append_source_meta:sourceMeta});
   }else{
    const content=overLimit?body.slice(0,NOTE_CONTENT_LIMIT-1000)+"\n\n> （超出 6 万字上限，已截断）":body;
    note=await createNote({title:draft.title,content,course_id:draft.courseId,
      folder_path:draft.folderPath,kind:"md",starred:draft.starred,remark:draft.remark,
      source:"agent",source_meta:sourceMeta});
   }
   if(remember)saveNoteDefaults(userId,{course_id:draft.courseId,folder_path:draft.folderPath,
     format:draft.format,starred:draft.starred});
   rememberSaved(userId,(target.chat?.request_id||target.chat?.message_id||draft.title),
     {id:note.id,title:note.title,at:Date.now()});
   setSaved(note);onSaved(note);
  }catch(e){setError(e instanceof Error?e.message:"保存失败");}
  finally{setBusy(false);}
 }

 const breadcrumb=[courseLabel,draft.folderPath||"科目根",saved?.title||draft.title].filter(Boolean);

 if(saved)return <section className="nsCard" aria-label="已存为笔记">
  <p className="nsSaved" role="status">已存到 {breadcrumb.join(" › ")}</p>
  <div className="nsActions">
   <a href={`/student/notes?note=${encodeURIComponent(saved.id)}`}>去我的笔记查看</a>
   <button type="button" onClick={onClose}>知道了</button>
  </div>
 </section>;

 return <section className="nsCard" aria-label="存为笔记">
  <h3>存为笔记</h3>
  <p>确认一下放在哪里。你不点确认，agent 不会写进笔记库。</p>

  <div className="nsMode" role="group" aria-label="保存方式">
   <button type="button" aria-pressed={mode==="new"} onClick={()=>setMode("new")}>新建一份笔记</button>
   <button type="button" aria-pressed={mode==="merge"} onClick={()=>setMode("merge")}>并入已有笔记</button>
  </div>

  {mode==="merge"&&<label className="nsFields" style={{display:"block"}}>
   <span style={{fontSize:12,color:"var(--lm-muted)"}}>并入到</span>
   <select aria-label="并入到哪份笔记" value={mergeInto} onChange={e=>setMergeInto(e.target.value)}>
    <option value="">请选择一份笔记</option>
    {grouped.map(([folder,items])=><optgroup key={folder} label={folder}>
     {items.map(note=><option key={note.id} value={note.id}>{note.starred?"★ ":""}{note.title}</option>)}
    </optgroup>)}
   </select>
  </label>}

  <div className="nsFields">
   <label>科目<select aria-label="笔记科目" value={draft.courseId}
     onChange={e=>setDraft({...draft,courseId:e.target.value})}>
    {courses.map(c=><option key={c.course_id} value={c.course_id}>{c.display_name}</option>)}
   </select></label>
   <label>目录<input aria-label="笔记目录" value={draft.folderPath} maxLength={200}
     onChange={e=>setDraft({...draft,folderPath:e.target.value})} placeholder="留空放科目根"/></label>
   <label>文件名<input aria-label="笔记文件名" value={draft.title} maxLength={200}
     onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
   <label>格式<select aria-label="笔记格式" value={draft.format}
     onChange={e=>setDraft({...draft,format:e.target.value})}>
    {FORMATS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select></label>
  </div>

  <label className="nsRemember"><input type="checkbox" checked={remember}
    onChange={e=>setRemember(e.target.checked)}/>记住以上默认（科目、目录、格式、重要标记；保存方式每次都问）</label>

  {risk?.big&&!risk.tooLong&&<p className="nsWarn">这份笔记已经有 {risk.sections} 个小节 / {risk.existing} 字，
    再并进去会很长。要不要改成「新建一份笔记」？</p>}
  {risk?.tooLong&&<p className="nsBlock">并入后会超过单篇 6 万字上限。请改选「新建一份笔记」，或先把这份笔记拆开。</p>}
  {overLimit&&<p className="nsWarn">这篇回答较长，超过单篇 6 万字上限，保存时会截断（建议拆开保存）。</p>}
  {error&&<p className="nsBlock" role="alert">{error}</p>}

  <div className="nsActions">
   <button type="button" className="nsPrimary" disabled={busy||!draft.title.trim()||(mode==="merge"&&(!mergeInto||risk?.tooLong))}
     onClick={()=>void save()}>{busy?"保存中…":mode==="merge"?"确认并入":"确认存入"}</button>
   <button type="button" disabled={busy} onClick={onClose}>取消</button>
  </div>
 </section>;
}
