"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import NoteTree from "./NoteTree";
import NoteEditor from "./NoteEditor";
import {createNote,deleteNote,getNote,listNotes,patchNote,restoreNote,bulkNotes,type Note} from "./note-store";

type Dialog={kind:"new"}|{kind:"rename";note:Note}|{kind:"remark";note:Note}|{kind:"move";note:Note}|null;

// 我的笔记：左目录树 + 右阅读/编辑区。默认按科目整理，可切按时间；含回收站。
export default function NoteLibrary({courses}:{courses:Record<string,any>[];user?:Record<string,any>}){
 const [notes,setNotes]=useState<Note[]>([]);
 const [current,setCurrent]=useState<Note|null>(null);
 const [selectedId,setSelectedId]=useState("");
 const [course,setCourse]=useState("");
 const [q,setQ]=useState("");
 const [term,setTerm]=useState("");
 const [starred,setStarred]=useState(false);
 const [trash,setTrash]=useState(false);
 const [mode,setMode]=useState<"tree"|"time">("tree");
 const [loadState,setLoadState]=useState<"loading"|"ready"|"error">("loading");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const [dialog,setDialog]=useState<Dialog>(null);

 const courseLabel=useMemo(()=>{
  const map:Record<string,string>={};
  for(const item of courses)map[item.course_id]=item.display_name;
  return map;
 },[courses]);

 const load=useCallback(async()=>{
  setLoadState("loading");setError("");
  try{
   const data=await listNotes({course_id:course,q:term,starred,trash});
   setNotes(data.items);
   setLoadState("ready");
   return data.items;
  }catch(e){setError(e instanceof Error?e.message:"笔记加载失败");setLoadState("error");return [];}
 },[course,term,starred,trash]);

 useEffect(()=>{void load();},[load]);

 // 深链：/student/notes?note=<id>（对话里的「找笔记」结果卡直达这里）
 useEffect(()=>{
  const target=new URLSearchParams(window.location.search).get("note");
  if(target)setSelectedId(target);
 },[]);

 useEffect(()=>{
  if(!selectedId)return;
  let live=true;
  getNote(selectedId).then(note=>{if(live)setCurrent(note);})
   .catch(()=>{if(live){setCurrent(null);setSelectedId("");}});
  return()=>{live=false;};
 },[selectedId]);

 function select(id:string){
  setSelectedId(id);setNotice("");
  try{const url=new URL(window.location.href);url.searchParams.set("note",id);window.history.replaceState(null,"",url);}catch{/* 静态导出下也不影响选中 */}
 }

 async function patch(id:string,body:Record<string,unknown>){
  await patchNote(id,body);
  const items=await load();
  if(selectedId===id){const fresh=items.find(n=>n.id===id);if(fresh)setCurrent(await getNote(id).catch(()=>null));}
 }

 async function remove(note:Note){
  setBusy(true);setError("");
  try{
   await deleteNote(note.id);
   if(selectedId===note.id){setSelectedId("");setCurrent(null);}
   await load();setNotice(`《${note.title}》已移入回收站，30 天内可还原`);
  }catch(e){setError(e instanceof Error?e.message:"删除失败");}
  finally{setBusy(false);}
 }

 async function run(action:()=>Promise<void>,done:string){
  setBusy(true);setError("");
  try{await action();await load();setNotice(done);}
  catch(e){setError(e instanceof Error?e.message:"操作失败");}
  finally{setBusy(false);}
 }

 const editing=!trash;

 return <div className="noteLibrary">
  <div className="pageHeading nmHeading">
   <div><h1>我的笔记</h1></div>
   <div className="nmHeadingActions">
    <button type="button" className="nmPrimary" disabled={busy} onClick={()=>setDialog({kind:"new"})}>新建笔记</button>
   </div>
  </div>

  <div className="nmToolbar">
   <label className="nmField nmSearch">搜索笔记
    <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")setTerm(q);}}
      placeholder="标题、备注、正文都能搜" maxLength={120}/>
    {q!==term&&<button type="button" onClick={()=>setTerm(q)}>搜索</button>}
   </label>
   <label className="nmField">科目
    <select value={course} onChange={e=>setCourse(e.target.value)}>
     <option value="">全部科目</option>
     {courses.map(item=><option key={item.course_id} value={item.course_id}>{item.display_name}</option>)}
    </select>
   </label>
   <div className="nmToggles">
    <button type="button" aria-pressed={mode==="time"} onClick={()=>setMode(mode==="tree"?"time":"tree")}>
     {mode==="tree"?"按科目整理":"按时间整理"}</button>
    <button type="button" aria-pressed={starred} disabled={trash} onClick={()=>setStarred(!starred)}>★ 只看重要</button>
    <button type="button" aria-pressed={trash} onClick={()=>{setTrash(!trash);setStarred(false);setSelectedId("");setCurrent(null);}}>
     回收站</button>
   </div>
  </div>

  {error&&<p className="nmError" role="alert">{error}</p>}
  {notice&&<p className="nmNotice" role="status">{notice}</p>}

  <div className="nmLayout">
   <aside className="nmTreePane" aria-label="笔记目录">
    {loadState==="loading"?<p className="nmEmpty">正在加载…</p>
     :loadState==="error"?<p className="nmEmpty">加载失败，<button type="button" onClick={()=>void load()}>重试</button></p>
     :<NoteTree notes={notes} courses={courses} mode={mode} selected={selectedId} trash={trash}
        onSelect={select}
        onToggleStar={note=>void run(async()=>{await patch(note.id,{starred:!note.starred});},note.starred?"已取消重要标记":"已标记为重要")}
        onRename={note=>setDialog({kind:"rename",note})}
        onRemark={note=>setDialog({kind:"remark",note})}
        onMove={note=>setDialog({kind:"move",note})}
        onDelete={note=>void remove(note)}
        onRestore={note=>void run(async()=>{await restoreNote(note.id);},`《${note.title}》已还原`)}
        onPurge={note=>void run(async()=>{await deleteNote(note.id,true);},`《${note.title}》已彻底删除`)}/>}
   </aside>
   <section className="nmReaderPane">
    {current?<NoteEditor note={current} courses={courses} onPatch={patch} onDelete={note=>void remove(note)} onNotice={setNotice}/>
     :<div className="nmBlank">
       <h2>{trash?"回收站":"选一份笔记开始"}</h2>
       <p>{trash?"回收站里的笔记 30 天内可以还原；彻底删除会连附件一起清掉。"
             :"左侧按科目列着你的笔记。也可以回到对话页，让 AI 按章节生成一份。"}</p>
      </div>}
   </section>
  </div>

  {dialog&&<NoteDialog dialog={dialog} courses={courses} busy={busy} onClose={()=>setDialog(null)}
    onSubmit={async values=>{
     setDialog(null);
     if(dialog.kind==="new")
      await run(async()=>{const created=await createNote({title:values.title,content:values.content||"",course_id:values.courseId,folder_path:values.folder});select(created.id);},"笔记已新建");
     else if(dialog.kind==="rename")
      await run(async()=>{await patch(dialog.note.id,{title:values.title});},"已重命名");
     else if(dialog.kind==="remark")
      await run(async()=>{await patch(dialog.note.id,{remark:values.content});},"备注已保存");
     else if(dialog.kind==="move")
      await run(async()=>{await bulkNotes({ids:[dialog.note.id],course_id:values.courseId,folder_path:values.folder});},`已移动到 ${courseLabel[values.courseId]||values.courseId}${values.folder?" › "+values.folder:""}`);
    }}/>}
 </div>;
}

function NoteDialog({dialog,courses,busy,onClose,onSubmit}:{
 dialog:Exclude<Dialog,null>;courses:Record<string,any>[];busy:boolean;onClose:()=>void;
 onSubmit:(values:{title:string;content:string;courseId:string;folder:string})=>void;
}){
 const existing=dialog.kind==="new"?null:dialog.note;
 const [title,setTitle]=useState(existing?.title||"");
 const [content,setContent]=useState(dialog.kind==="remark"&&existing?existing.remark:"");
 const [courseId,setCourseId]=useState(existing?.course_id||courses[0]?.course_id||"");
 const [folder,setFolder]=useState(existing?.folder_path||"");
 const heading={new:"新建笔记",rename:"重命名",remark:"写备注",move:"移动目录"}[dialog.kind];
 const showFolder=dialog.kind!=="rename"&&dialog.kind!=="remark";
 return <div className="nmDialogBackdrop" role="presentation" onClick={onClose}>
  <section className="nmDialog" role="dialog" aria-label={heading} onClick={e=>e.stopPropagation()}>
   <h2>{heading}</h2>
   {dialog.kind==="rename"&&<label className="nmField">标题
    <input autoFocus value={title} maxLength={200} onChange={e=>setTitle(e.target.value)}/></label>}
   {dialog.kind==="remark"&&<label className="nmField">备注
    <textarea autoFocus rows={3} value={content} maxLength={500} onChange={e=>setContent(e.target.value)}
      placeholder="例如：这里容易混，考前再看一遍"/></label>}
   {dialog.kind==="new"&&<>
    <label className="nmField">标题
     <input autoFocus value={title} maxLength={200} onChange={e=>setTitle(e.target.value)} placeholder="例如：第8章 反常积分·预习笔记"/></label>
    <label className="nmField">正文（Markdown，可留空）
     <textarea rows={5} value={content} onChange={e=>setContent(e.target.value)} placeholder="公式写 $…$；流程图用 ```mermaid 代码块。"/></label>
   </>}
   {showFolder&&<>
    <label className="nmField">科目
     <select value={courseId} onChange={e=>setCourseId(e.target.value)}>
      {courses.map(item=><option key={item.course_id} value={item.course_id}>{item.display_name}</option>)}
     </select></label>
    <label className="nmField">目录
     <input value={folder} maxLength={200} onChange={e=>setFolder(e.target.value)} placeholder="留空放在科目根，例如：第8章 反常积分"/></label>
   </>}
   <div className="nmDialogActions">
    <button type="button" className="nmPrimary" disabled={busy||(dialog.kind!=="remark"&&!title.trim())}
      onClick={()=>onSubmit({title:title.trim(),content,courseId,folder:folder.trim()})}>确定</button>
    <button type="button" disabled={busy} onClick={onClose}>取消</button>
   </div>
  </section>
 </div>;
}
