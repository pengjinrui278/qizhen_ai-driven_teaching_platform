"use client";
import {liveApi} from "./Pilot";

// 我的笔记：知识库的取数与类型。所有请求只走本人数据（后端按账号隔离）。
export type NoteAttachment={id:string;note_id:string;filename:string;mime:string;size:number;kind:string;created_at:string};
export type Note={
  id:string;course_id:string;folder_path:string;title:string;kind:string;
  content?:string;starred:boolean;remark:string;source:"student"|"agent";
  source_meta:Record<string,unknown>;deleted_at:string|null;deleted_from:string;
  created_at:string;updated_at:string;has_content:boolean;attachments?:NoteAttachment[];
};

export const KIND_LABEL:Record<string,string>={md:"Markdown",text:"文本",code:"代码",image:"图片",pdf:"PDF",
  doc:"Word",ppt:"PPT",sheet:"表格",video:"视频",audio:"音频",archive:"压缩包",other:"文件"};
// 能直接在浏览器里看的类型；其余给下载或新标签打开。
export const INLINE_KINDS=new Set(["image","pdf","md","text"]);
export const SOURCE_LABEL:Record<string,string>={student:"自写",agent:"AI 整理"};

export const apiBase=process.env.NEXT_PUBLIC_API_BASE??"";

function query(params:Record<string,string|boolean|undefined>){
  const search=new URLSearchParams();
  for(const [key,value] of Object.entries(params)){
    if(value===undefined||value===false||value==="")continue;
    search.set(key,value===true?"1":String(value));
  }
  const text=search.toString();
  return text?"?"+text:"";
}

export function listNotes(params:{course_id?:string;q?:string;starred?:boolean;trash?:boolean}={}){
  return liveApi("/notes"+query(params)) as Promise<{items:Note[];total:number}>;
}

export function getNote(id:string){return liveApi("/notes/"+id) as Promise<Note>;}

export function createNote(body:{title:string;content:string;course_id:string;folder_path:string;
  kind?:string;starred?:boolean;remark?:string;source?:string;source_meta?:Record<string,unknown>}){
  return liveApi("/notes","POST",{kind:"md",starred:false,remark:"",source:"student",source_meta:{},...body}) as Promise<Note>;
}

export function patchNote(id:string,body:Record<string,unknown>){
  return liveApi("/notes/"+id,"PATCH",body) as Promise<Note>;
}

export function deleteNote(id:string,purge=false){
  return liveApi("/notes/"+id+(purge?"?purge=1":""),"DELETE") as Promise<{ok:boolean;purged:boolean}>;
}

export function restoreNote(id:string){return liveApi("/notes/"+id+"/restore","POST") as Promise<Note>;}

export function bulkNotes(body:{ids:string[];course_id?:string;folder_path?:string;starred?:boolean}){
  return liveApi("/notes/bulk","POST",body) as Promise<{ok:boolean;updated:string[];count:number;skipped:number}>;
}

// 附件上传是 multipart，不能用 liveApi（它会强制 JSON 头）。
export async function uploadAttachment(noteId:string,file:File){
  const form=new FormData();
  form.append("file",file);
  const response=await fetch(`${apiBase}/api/v2/notes/${noteId}/attachments`,
    {method:"POST",credentials:"include",headers:{"X-Mirror-Request":"1"},body:form});
  const payload=await response.json().catch(()=>({detail:"服务没有返回有效数据"}));
  if(!response.ok)throw new Error(payload?.detail||"附件上传失败");
  return payload as NoteAttachment;
}

export function attachmentUrl(id:string){return `${apiBase}/api/v2/notes/attachments/${id}`;}
export function exportUrl(id:string,format:string){return `${apiBase}/api/v2/notes/${id}/export?format=${format}`;}

export function formatBytes(size:number){
  if(size<1024)return size+" B";
  if(size<1024*1024)return (size/1024).toFixed(1)+" KB";
  return (size/1024/1024).toFixed(1)+" MB";
}

// 浅灰小字用的时间：今天只显示时分，其余显示日期。
export function shortTime(value?:string|null){
  if(!value)return "";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return "";
  const now=new Date();
  const sameDay=date.toDateString()===now.toDateString();
  const pad=(n:number)=>String(n).padStart(2,"0");
  return sameDay?`${pad(date.getHours())}:${pad(date.getMinutes())}`
    :`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

export function monthKey(value?:string|null){
  const date=value?new Date(value):null;
  if(!date||Number.isNaN(date.getTime()))return "更早";
  return `${date.getFullYear()} 年 ${date.getMonth()+1} 月`;
}

// 目录树：科目 ▸ 目录 ▸ 笔记，星标置顶，其余按更新时间倒序。
export type FolderNode={path:string;notes:Note[]};
export type CourseNode={courseId:string;folders:FolderNode[];notes:Note[];count:number};

export function buildTree(notes:Note[]){
  const byCourse=new Map<string,CourseNode>();
  for(const note of notes){
    let course=byCourse.get(note.course_id);
    if(!course){course={courseId:note.course_id,folders:[],notes:[],count:0};byCourse.set(note.course_id,course);}
    course.count+=1;
    if(note.folder_path){
      let folder=course.folders.find(f=>f.path===note.folder_path);
      if(!folder){folder={path:note.folder_path,notes:[]};course.folders.push(folder);}
      folder.notes.push(note);
    }else course.notes.push(note);
  }
  for(const course of byCourse.values()){
    course.folders.sort((a,b)=>a.path.localeCompare(b.path,"zh"));
    for(const folder of course.folders)folder.notes.sort(byStarThenTime);
    course.notes.sort(byStarThenTime);
  }
  return [...byCourse.values()].sort((a,b)=>a.courseId.localeCompare(b.courseId,"zh"));
}

// 按时间成组：同样的笔记换一种整理口径。
export function buildTimeline(notes:Note[]){
  const groups=new Map<string,Note[]>();
  for(const note of [...notes].sort(byStarThenTime)){
    const key=monthKey(note.updated_at);
    groups.set(key,[...(groups.get(key)||[]),note]);
  }
  return [...groups.entries()].map(([label,items])=>({label,items}));
}

function byStarThenTime(a:Note,b:Note){
  if(a.starred!==b.starred)return a.starred?-1:1;
  return (b.updated_at||"").localeCompare(a.updated_at||"");
}
