"use client";
import {useEffect,useState} from "react";
import {liveApi} from "./Pilot";

// 笔记偏好面板：所有选项都可选可不选，也可跳过自己写。
// 选项与提示词片段都由后端 /notes/preferences 与 /notes/prompt 提供，前端不硬编码文案。
type Group={id:string;label:string;hint:string;options:{id:string;label:string;hint?:string;prompt?:string}[]};
type Schema={groups:Group[];source_kinds:{id:string;label:string;hint?:string}[];
  formats:{id:string;label:string}[];limits:{free_text:number;prompt:number};defaults:{folders:string[]}};

export type NotePanelSource={kind:string;source_id?:string;chapter?:string;book_title?:string;volume?:string};

export default function NotePreferencePanel({courseId,courses,preset,onClose,onComposed,allowedSources}:{
 courseId:string;courses:Record<string,any>[];preset?:{purpose?:string;source?:string};
 onClose:()=>void;onComposed:(prompt:string,marker:string,source:NotePanelSource)=>void;
 allowedSources?:string[];   // 例如 AI 素养路径没有教材章可读，只允许「刚才的回答」
}){
 const [schema,setSchema]=useState<Schema|null>(null);
 const [picks,setPicks]=useState<Record<string,string>>(preset?.purpose?{purpose:preset.purpose}:{});
 const [freeText,setFreeText]=useState("");
 const [course,setCourse]=useState(courseId);
 const [folder,setFolder]=useState("");
 const [title,setTitle]=useState("");
 const [starred,setStarred]=useState(false);
 const [sourceKind,setSourceKind]=useState(preset?.source||"chat");
 const [books,setBooks]=useState<Record<string,any>[]>([]);
 const [chapters,setChapters]=useState<string[]>([]);
 const [sourceId,setSourceId]=useState("");
 const [chapter,setChapter]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [preview,setPreview]=useState<{label:string;text:string}[]>([]);

 useEffect(()=>{
  liveApi("/notes/preferences").then((data:Schema)=>{setSchema(data);setFolder(data.defaults?.folders?.[0]||"");})
   .catch(e=>setError(e instanceof Error?e.message:"偏好选项加载失败"));
 },[]);

 // 教材章节来源：取本课程的教材与章节供选择（都走已门控的只读端点）
 useEffect(()=>{
  if(sourceKind!=="chapter")return;
  liveApi("/textbooks").then((all:Record<string,any>[])=>{
   const mine=(all||[]).filter(b=>!b.course_id||b.course_id===course);
   setBooks(mine);setSourceId(mine[0]?.source_id||"");
  }).catch(()=>setBooks([]));
 },[sourceKind,course]);

 useEffect(()=>{
  if(sourceKind!=="chapter"||!sourceId){setChapters([]);return;}
  liveApi(`/textbooks/${encodeURIComponent(sourceId)}/chapters`)
   .then((list:Record<string,any>[])=>setChapters((list||[]).map(c=>c.chapter||c.title).filter(Boolean)))
   .catch(()=>setChapters([]));
 },[sourceKind,sourceId]);

 function toggle(groupId:string,optionId:string){
  setPicks(cur=>cur[groupId]===optionId?{...cur,[groupId]:""}:{...cur,[groupId]:optionId});
 }

 const book=books.find(b=>b.source_id===sourceId);
 const source:NotePanelSource=sourceKind==="chapter"
  ?{kind:"chapter",source_id:sourceId,chapter,book_title:book?.title||book?.book_title,volume:book?.volume}
  :{kind:sourceKind};

 async function compose(){
  setBusy(true);setError("");
  try{
   const data=await liveApi("/notes/prompt","POST",{
    mode:"generate",selections:picks,free_text:freeText,source,
    dest:{course_id:course,folder_path:folder,title,starred,format:picks.format||"markdown"}});
   setPreview(data.preview_sections||[]);
   onComposed(data.prompt,data.marker,source);
  }catch(e){setError(e instanceof Error?e.message:"生成提示词失败");}
  finally{setBusy(false);}
 }

 return <div className="npBackdrop" role="presentation" onClick={onClose}>
  <section className="npPanel" role="dialog" aria-label="笔记偏好" onClick={e=>e.stopPropagation()}>
   <header className="npHead">
    <div><h2>想要一份什么样的笔记？</h2></div>
    <button type="button" onClick={onClose} aria-label="跳过，我自己写">跳过</button>
   </header>

   {error&&<p className="npError" role="alert">{error}</p>}
   {!schema?.groups?.length?<p className="npLoading" role="status">{schema?"暂时取不到偏好选项，可以直接在输入框里写要求。":"正在加载选项…"}</p>:<>
    <div className="npGroups">{schema.groups.map(group=>
     <fieldset className="npGroup" key={group.id}>
      <legend>{group.label}</legend>
      <div className="npChips">{group.options.map(option=>
       <button type="button" key={option.id} title={option.hint} aria-pressed={picks[group.id]===option.id}
        onClick={()=>toggle(group.id,option.id)}>{option.label}</button>)}
      </div>
     </fieldset>)}
    </div>

    <fieldset className="npGroup">
     <legend>笔记的来源</legend>
     <div className="npChips">{schema.source_kinds.filter(k=>k.id!=="upload"&&(!allowedSources||allowedSources.includes(k.id))).map(kind=>
      <button type="button" key={kind.id} title={kind.hint} aria-pressed={sourceKind===kind.id}
       onClick={()=>setSourceKind(kind.id)}>{kind.label}</button>)}
     </div>
     {sourceKind==="chapter"&&<div className="npSource">
      <label>教材<select value={sourceId} onChange={e=>setSourceId(e.target.value)} aria-label="选择教材">
       {!books.length&&<option value="">暂无可用教材</option>}
       {books.map(b=><option key={b.source_id} value={b.source_id}>{b.title||b.book_title||b.source_id}</option>)}
      </select></label>
      <label>章节<select value={chapter} onChange={e=>setChapter(e.target.value)} aria-label="选择章节">
       <option value="">请选择章节</option>
       {chapters.map(name=><option key={name} value={name}>{name}</option>)}
      </select></label>
     </div>}
    </fieldset>

    <fieldset className="npGroup">
     <legend>存在哪里</legend>
     <div className="npSource">
      <label>科目<select value={course} onChange={e=>setCourse(e.target.value)} aria-label="存放科目">
       {courses.map(c=><option key={c.course_id} value={c.course_id}>{c.display_name}</option>)}
      </select></label>
      <label>目录<input value={folder} onChange={e=>setFolder(e.target.value)} maxLength={200}
       list="npFolders" placeholder="留空放科目根"/></label>
      <datalist id="npFolders">{(schema.defaults?.folders||[]).map(f=><option key={f} value={f}/>)}</datalist>
      <label>文件名<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={200}
       placeholder="留空自动按章节起名"/></label>
     </div>
     <label className="npCheck"><input type="checkbox" checked={starred} onChange={e=>setStarred(e.target.checked)}/>标为重要</label>
    </fieldset>

    <label className="npFree">还想补充什么要求？
     <textarea rows={3} value={freeText} maxLength={schema.limits.free_text}
      onChange={e=>setFreeText(e.target.value)} placeholder="例如：重点讲清一致收敛与逐点收敛的区别，配 2 道例题"/>
    </label>

    {preview.length>0&&<details className="npPreview" open>
     <summary>这条提示词会用上下面这些话</summary>
     <ul>{preview.map(section=><li key={section.label}><strong>{section.label}</strong>：{section.text}</li>)}</ul>
    </details>}

    <div className="npActions">
     <button type="button" className="npPrimary" disabled={busy} onClick={()=>void compose()}>生成提示词并填入输入框</button>
     <button type="button" disabled={busy} onClick={onClose}>取消</button>
    </div>
   </>}
  </section>
 </div>;
}

// 页边式的笔记偏好：拖进文件、引用教材或笔记之后，输入框上方冒出一条窄边；
// 点它像抽页一样**上下**抽出面板（子页面是左右，这里是上下）。
// 每个选项按钮点一下就往输入框插一段高亮要求，再点输入框里那块就撤销。
export function NoteEdgePanel({open,onToggle,onPick,targets,mergeId,onMerge,onOpenPanel,onOrganize}:{
 open:boolean;onToggle:()=>void;onPick:(fragment:string,label:string)=>void;
 // 草稿里引用到的笔记：不只是依据，也可以当「并入」的目标
 targets?:{id:string;name:string}[];
 mergeId?:string;onMerge?:(id:string)=>void;
 // 窄边下面这排提示词管的是「写法」；来源（教材章节）与存放位置在完整面板里。
 // 这两件事没有别的入口，所以这里给两个明确入口——不是推荐问法，是这两件事的开关。
 onOpenPanel?:()=>void;   // 打开完整偏好：选教材章节、指定科目/目录/文件名
 onOrganize?:()=>void;    // 整理我的笔记：把散在科目根的笔记归位
}){
 const [schema,setSchema]=useState<Schema|null>(null);
 const [busy,setBusy]=useState("");

 useEffect(()=>{
  if(!open||schema)return;
  liveApi("/notes/preferences").then((data:Schema)=>setSchema(data)).catch(()=>setSchema(null));
 },[open,schema]);

 return <div className={"noteEdge"+(open?" isOpen":"")}>
  <div className="noteEdgeBar">
   <button type="button" className="noteEdgeTab" aria-expanded={open} onClick={onToggle}>
    <span className="noteEdgeGrip" aria-hidden="true"/>
    {open?"收起笔记偏好":"笔记偏好"}
   </button>
   {onOpenPanel&&<button type="button" className="noteEdgeMore" onClick={onOpenPanel}
    title="选教材章节作为来源，并指定存到哪个科目、哪个目录、叫什么名字">按教材章生成…</button>}
   {onOrganize&&<button type="button" className="noteEdgeMore" onClick={onOrganize}
    title="把散在科目根的笔记整批归到指定目录">整理我的笔记…</button>}
  </div>
  <div className="noteEdgeBody" role="region" aria-label="笔记偏好" aria-hidden={!open}>
   {/* 必须容忍接口没按预期返回：schema 可能是 []、缺 groups，直接 .map 会把整块界面搞崩 */}
   {!schema?.groups?.length?<p className="npLoading">{schema?"暂时取不到偏好选项。":"正在加载选项…"}</p>:
    <div className="noteEdgeGroups">{schema.groups.map(group=>
     <div className="noteEdgeGroup" key={group.id}>
      <span className="noteEdgeLabel">{group.label}</span>
      <div className="npChips">{group.options.map(option=>
       <button type="button" key={option.id} title={option.hint||option.prompt}
        disabled={!option.prompt||busy===group.id+option.id}
        onClick={()=>{if(!option.prompt)return;onPick(option.prompt,`${group.label}·${option.label}`);}}>
        {option.label}</button>)}
      </div>
     </div>)}
    </div>}
   {/* 存到哪里。默认永远新建；「并入」必须在这里显式选，而且只有引用了笔记才出现。
       选了之后写入由服务端做，agent 不需要自己去动学生的笔记。 */}
   {(targets||[]).length>0&&<div className="noteEdgeGroup">
    <span className="noteEdgeLabel">存到</span>
    <div className="npChips">
     <button type="button" aria-pressed={!mergeId} onClick={()=>onMerge?.("")}>新建一份</button>
     {(targets||[]).map(note=><button type="button" key={note.id} aria-pressed={mergeId===note.id}
      title={`把这次整理出来的内容追加到《${note.name}》`}
      onClick={()=>onMerge?.(note.id)}>并入《{note.name}》</button>)}
    </div>
   </div>}
   <p className="noteEdgeHint">点一下就把这条要求插进输入框（会显示成高亮块）；想取消就点输入框里那一块。</p>
  </div>
 </div>;
}

// 笔记模式开关：放在对话头部「参阅」旁边。平时笔记相关的交互一概不出现，
// 点开才进入笔记模式——笔记是人为调用的工具，不是推荐问题。
export function NoteModeToggle({on,disabled,toggle}:{on:boolean;disabled:boolean;toggle:()=>void}){
 return <button type="button" className={"noteModeToggle"+(on?" isOn":"")} aria-pressed={on} disabled={disabled}
  title={on?"退出笔记模式":"进入笔记模式"} onClick={toggle}>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
   <path d="M4 4a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM14 2v6h6M8 13h8M8 17h5"/>
  </svg>
  <span>笔记</span>
 </button>;
}
