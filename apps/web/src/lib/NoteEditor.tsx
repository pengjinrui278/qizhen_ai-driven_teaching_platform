"use client";
import {useEffect,useRef,useState} from "react";
import ChatMarkdown from "./ChatMarkdown";
import {INLINE_KINDS,KIND_LABEL,SOURCE_LABEL,attachmentUrl,exportUrl,formatBytes,shortTime,uploadAttachment,type Note} from "./note-store";

const EXPORTS:[string,string][]=[["md","Markdown"],["docx","Word"],["pptx","PPT"],["html","可打印 HTML"]];

// 右侧阅读/编辑区：Markdown 正文 + 多格式附件。附件按类型决定内联预览还是下载。
export default function NoteEditor({note,courses,onPatch,onDelete,onNotice}:{
  note:Note;courses:Record<string,any>[];onPatch:(id:string,body:Record<string,unknown>)=>Promise<void>;
  onDelete:(note:Note)=>void;onNotice:(text:string)=>void;
}){
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState({title:note.title,content:note.content||""});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const fileInput=useRef<HTMLInputElement>(null);

  useEffect(()=>{setEditing(false);setDraft({title:note.title,content:note.content||""});setError("");},[note.id,note.title,note.content]);

  const courseName=courses.find(c=>c.course_id===note.course_id)?.display_name||note.course_id||"未归科目";
  const breadcrumb=[courseName,note.folder_path||"科目根",note.title].filter(Boolean);

  async function save(){
    if(!draft.title.trim())return;
    setBusy(true);setError("");
    try{
      await onPatch(note.id,{title:draft.title.trim(),content:draft.content});
      setEditing(false);onNotice("笔记已保存");
    }catch(e){setError(e instanceof Error?e.message:"保存失败");}
    finally{setBusy(false);}
  }

  async function attach(file:File|undefined){
    if(!file)return;
    setBusy(true);setError("");
    try{
      const saved=await uploadAttachment(note.id,file);
      await onPatch(note.id,{});
      onNotice(`已添加附件：${saved.filename}`);
    }catch(e){setError(e instanceof Error?e.message:"附件上传失败");}
    finally{setBusy(false);if(fileInput.current)fileInput.current.value="";}
  }

  return <article className="nmReader" aria-label="笔记内容">
    <header className="nmReaderHead">
      <nav className="nmBreadcrumb" aria-label="笔记位置">{breadcrumb.map((part,index)=>
        <span key={part+index}>{index>0&&<span className="nmCrumbSep">›</span>}{part}</span>)}</nav>
      <div className="nmReaderTitle">
        <h2>{note.starred&&<span className="nmStarMark" aria-label="已标记重要">★</span>}{note.title}</h2>
        <div className="nmReaderActions">
          {editing?<>
            <button type="button" className="nmPrimary" disabled={busy||!draft.title.trim()} onClick={()=>void save()}>保存</button>
            <button type="button" disabled={busy} onClick={()=>{setEditing(false);setDraft({title:note.title,content:note.content||""});}}>取消</button>
          </>:<button type="button" className="nmPrimary" onClick={()=>setEditing(true)}>编辑</button>}
          <button type="button" aria-pressed={note.starred} onClick={()=>void onPatch(note.id,{starred:!note.starred})}>
            {note.starred?"★ 已标重要":"☆ 标为重要"}</button>
          <details className="nmExport"><summary>导出</summary>
            <div className="nmExportMenu">
              {EXPORTS.map(([format,label])=><a key={format} href={exportUrl(note.id,format)} download>{label}</a>)}
            </div>
          </details>
          <button type="button" className="nmDanger" onClick={()=>onDelete(note)}>删除</button>
        </div>
      </div>
      <p className="nmReaderMeta">
        {KIND_LABEL[note.kind]||note.kind} · {SOURCE_LABEL[note.source]||note.source}
        <span className="nmRowTime"> · 建于 {shortTime(note.created_at)} · 改于 {shortTime(note.updated_at)}</span>
        {note.remark&&<span className="nmReaderRemark">备注：{note.remark}</span>}
      </p>
      {error&&<p className="nmError" role="alert">{error}</p>}
    </header>

    <section className="nmBody">
      {editing?<textarea className="nmEditor" aria-label="笔记正文（Markdown）" value={draft.content}
        onChange={e=>setDraft({...draft,content:e.target.value})}
        placeholder="用 Markdown 写；公式写 $…$，流程图用 ```mermaid 代码块。"/>
      :<ChatMarkdown text={note.content||""}/>}
    </section>

    <section className="nmAttachments" aria-label="附件">
      <div className="nmAttachHead">
        <h3>附件</h3>
        <label className="nmAttachAdd">添加附件
          <input ref={fileInput} type="file" aria-label="添加附件" disabled={busy} onChange={e=>void attach(e.target.files?.[0])}/></label>
      </div>
      {!note.attachments?.length?<p className="nmEmpty">还没有附件。课件、板书照片、代码、视频都可以放这里。</p>:
        <ul className="nmAttachList">{note.attachments.map(att=>
          <li key={att.id} className={"nmAttach is-"+att.kind}>
            <div className="nmAttachInfo">
              <strong>{att.filename}</strong>
              <span className="nmRowTime">{KIND_LABEL[att.kind]||att.kind} · {formatBytes(att.size)} · {shortTime(att.created_at)}</span>
            </div>
            <div className="nmAttachTools">
              <a href={attachmentUrl(att.id)} target="_blank" rel="noreferrer">新标签打开</a>
              <a href={attachmentUrl(att.id)} download={att.filename}>下载</a>
            </div>
            {/* 图片与 PDF 直接内联预览；Word/PPT/视频等只能下载或新标签打开 */}
            {att.kind==="image"&&<img className="nmAttachPreview" src={attachmentUrl(att.id)} alt={att.filename} loading="lazy"/>}
            {att.kind==="pdf"&&<object className="nmAttachFrame" data={attachmentUrl(att.id)} type="application/pdf" aria-label={att.filename}>
              <p>浏览器无法内嵌这个 PDF，请<a href={attachmentUrl(att.id)} target="_blank" rel="noreferrer">新标签打开</a>。</p></object>}
            {!INLINE_KINDS.has(att.kind)&&<p className="nmAttachNote">这类文件不内嵌预览，请下载或在新标签页打开。</p>}
          </li>)}</ul>}
    </section>
  </article>;
}
