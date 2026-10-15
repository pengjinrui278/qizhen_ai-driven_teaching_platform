"use client";
import {KIND_LABEL,SOURCE_LABEL,buildTimeline,buildTree,shortTime,type Note} from "./note-store";

// 知识库目录树：科目 ▸ 目录 ▸ 笔记（或按时间成组）。行内可改，不改用卡片分区。
export default function NoteTree({notes,courses,mode,selected,trash,onSelect,onToggleStar,onRename,onRemark,onMove,onDelete,onRestore,onPurge}:{
  notes:Note[];courses:Record<string,any>[];mode:"tree"|"time";selected:string;trash:boolean;
  onSelect:(id:string)=>void;onToggleStar:(note:Note)=>void;onRename:(note:Note)=>void;
  onRemark:(note:Note)=>void;onMove:(note:Note)=>void;onDelete:(note:Note)=>void;
  onRestore:(note:Note)=>void;onPurge:(note:Note)=>void;
}){
  const label=(courseId:string)=>courses.find(c=>c.course_id===courseId)?.display_name||courseId||"未归科目";

  function row(note:Note){
    const active=note.id===selected;
    return <li key={note.id} className={"nmRow"+(active?" isActive":"")+(note.starred?" isStarred":"")}>
      <button type="button" className="nmRowMain" aria-current={active?"true":undefined} onClick={()=>onSelect(note.id)}>
        <span className="nmRowTitle">{note.starred&&<span className="nmStarMark" aria-label="已标记重要">★</span>}{note.title}</span>
        <span className="nmRowMeta">
          {KIND_LABEL[note.kind]||note.kind}
          {note.source==="agent"&&<span className="nmRowTag">· {SOURCE_LABEL.agent}</span>}
          {/* 浅灰小字：创建与修改时间 */}
          <span className="nmRowTime">· 建于 {shortTime(note.created_at)} · 改于 {shortTime(note.updated_at)}</span>
        </span>
        {note.remark&&<span className="nmRowRemark">{note.remark}</span>}
      </button>
      <div className="nmRowTools">
        {trash?<>
          <button type="button" title="还原" onClick={()=>onRestore(note)}>还原</button>
          <button type="button" className="nmDanger" title="彻底删除" onClick={()=>onPurge(note)}>彻底删</button>
        </>:<>
          <button type="button" title={note.starred?"取消重要标记":"标记为重要"} aria-pressed={note.starred}
            onClick={()=>onToggleStar(note)}>{note.starred?"★":"☆"}</button>
          <button type="button" title="重命名" onClick={()=>onRename(note)}>改名</button>
          <button type="button" title="写备注" onClick={()=>onRemark(note)}>备注</button>
          <button type="button" title="移动目录" onClick={()=>onMove(note)}>移动</button>
          <button type="button" className="nmDanger" title="移入回收站" onClick={()=>onDelete(note)}>删除</button>
        </>}
      </div>
    </li>;
  }

  if(!notes.length)return <p className="nmEmpty">{trash?"回收站是空的。":"还没有笔记。可以让 AI 按章节生成，也可以自己新建。"}</p>;

  if(mode==="time")
    return <ul className="nmTree nmTreeTime">{buildTimeline(notes).map(group=>
      <li key={group.label} className="nmGroup">
        <div className="nmGroupHead"><span>{group.label}</span><span className="nmCount">{group.items.length}</span></div>
        <ul className="nmNotes">{group.items.map(row)}</ul>
      </li>)}</ul>;

  return <ul className="nmTree">{buildTree(notes).map(course=>
    <li key={course.courseId} className="nmGroup">
      <details open>
        <summary className="nmGroupHead"><span>{label(course.courseId)}</span><span className="nmCount">{course.count}</span></summary>
        <ul className="nmNotes">
          {course.notes.map(row)}
          {course.folders.map(folder=>
            <li key={folder.path} className="nmFolder">
              <details open>
                <summary className="nmFolderHead"><span>{folder.path}</span><span className="nmCount">{folder.notes.length}</span></summary>
                <ul className="nmNotes">{folder.notes.map(row)}</ul>
              </details>
            </li>)}
        </ul>
      </details>
    </li>)}</ul>;
}
