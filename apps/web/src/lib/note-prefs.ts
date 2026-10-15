"use client";
import type {Note} from "./note-store";

// 与后端 note_prefs.MARKER_RE 对应：标记由前端在发送时追加，不在输入框里显示。
const MARKER_RE=/\[\[MIRROR-NOTE1 ([A-Za-z0-9_\-]{16,2400})\]\]/g;

export type NoteMarker={v:number;mode:"generate"|"find"|"compose"|"agent";src?:{k?:string;sid?:string|null;ch?:string|null;ids?:string[]};
  p?:Record<string,string>;d?:{f?:string;t?:string;fm?:string;s?:boolean;mg?:string};free?:string;q?:string};

/** agent 直接管理笔记库后回传的回执：做了什么、哪几项没做成 */
export type NoteOpsReceipt={results:{op:string;ok:boolean;detail:string;id?:string;title?:string}[];done:number;failed:number};

export function stripNoteMarker(text:string){return (text||"").replace(MARKER_RE,"").trim();}

export function decodeNoteMarker(text:string):NoteMarker|null{
 const match=new RegExp(MARKER_RE.source).exec(text||"");
 if(!match)return null;
 try{
  const padded=match[1].replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(padded+"=".repeat((4-padded.length%4)%4));
  const json=new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));
  const data=JSON.parse(json);
  return data&&data.v===1?data as NoteMarker:null;
 }catch{return null;}
}

export function withNoteMarker(text:string,marker:string){
 return marker?`${text}\n\n${marker}`:text;
}

function base64url(text:string){
 const bytes=new TextEncoder().encode(text);
 let binary="";
 for(const byte of bytes)binary+=String.fromCharCode(byte);
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

/** 组装发给服务端的来源标记；服务端 note_prefs.parse_marker 解析。 */
export function encodeNoteMarker(payload:Record<string,unknown>){
 return `[[MIRROR-NOTE1 ${base64url(JSON.stringify({v:1,...payload}))}]]`;
}

/** 选中若干条回答 → 交给 agent 整理成一份笔记 */
export function composeRepliesMarker(ids:string[],mergeId?:string){
 return encodeNoteMarker({mode:"compose",src:{k:"replies",ids},d:dest(mergeId)});
}

/**
 * 笔记模式下学生直接说话（没走偏好面板、也没勾选回答）。
 * 走 agent 模式：让 agent 能**管理**笔记库——整理、移动、改名、标星、删除、还原、
 * 按关键词找、并入某篇；笔记库索引也一并交给它。
 *
 * 这条路**不会**自动新建笔记：哪些回答进笔记必须由学生自己勾选（「存为笔记」）。
 * 学生在这条路上明确说「帮我做一份笔记」时，由模型自己发 save 操作块落库。
 */
export function freeNoteMarker(mergeId?:string,folder?:string){
 return encodeNoteMarker({mode:"agent",src:{k:"chat"},d:{...dest(mergeId),f:folder||""}});
}

function dest(mergeId?:string){return mergeId?{mg:mergeId}:{};}

/** 从草稿里的笔记引用块取出被引用的笔记：既当依据，也可以当「并入」的目标 */
export function noteRefsInDraft(draft:string){
 const out:{id:string;name:string}[]=[];
 for(const m of (draft||"").matchAll(/\[\[MIRROR-REF1 ([A-Za-z0-9_-]+) ([A-Za-z0-9_=+/-]*)\]\]/g)){
  let name=m[1];
  try{name=new TextDecoder().decode(Uint8Array.from(atob(m[2].replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-m[2].length%4)%4)),c=>c.charCodeAt(0)));}catch{/* 名字只是回显，解不开就用 id */}
  out.push({id:m[1],name});
 }
 return out;
}

// 「记住以上默认」只存 科目/目录/格式/星标 —— 永不记「新建还是并入」，那一步每次都问。
export type NoteDefaults={v:1;course_id:string;folder_path:string;format:string;starred:boolean};
const DEFAULTS_KEY=(userId?:string)=>`learning-mirror.note-defaults.v1.${userId||"anon"}`;

export function loadNoteDefaults(userId?:string):NoteDefaults|null{
 try{
  const raw=window.localStorage.getItem(DEFAULTS_KEY(userId));
  if(!raw)return null;
  const data=JSON.parse(raw);
  return data&&data.v===1?data as NoteDefaults:null;
 }catch{return null;}
}

export function saveNoteDefaults(userId:string|undefined,patch:Partial<NoteDefaults>&{course_id:string}){
 try{
  const next={v:1,course_id:patch.course_id,folder_path:patch.folder_path||"",
    format:patch.format||"markdown",starred:!!patch.starred} as NoteDefaults;
  window.localStorage.setItem(DEFAULTS_KEY(userId),JSON.stringify(next));
 }catch{/* 隐私模式：存不了不影响本次保存 */}
}

// 已保存过的回答折叠成一行，刷新后仍是折叠态（仅本机记录）
const SAVED_KEY=(userId?:string)=>`learning-mirror.note-saved.v1.${userId||"anon"}`;
export type SavedNote={id:string;title:string;at:number};

export function savedNotes(userId?:string):Record<string,SavedNote>{
 try{return JSON.parse(window.localStorage.getItem(SAVED_KEY(userId))||"{}") as Record<string,SavedNote>;}
 catch{return {};}
}

export function rememberSaved(userId:string|undefined,key:string,note:SavedNote){
 try{const all=savedNotes(userId);all[key]=note;window.localStorage.setItem(SAVED_KEY(userId),JSON.stringify(all));}
 catch{/* 同上 */}
}

// 深链：对话里的「找笔记」结果卡点进来要能直接选中
export function readNotesLocation(){
 const params=new URLSearchParams(window.location.search);
 return {note:params.get("note")||"",course:params.get("course")||"",folder:params.get("folder")||""};
}

export function notesHref(id:string,course="",folder=""){
 const params=new URLSearchParams({note:id});
 if(course)params.set("course",course);
 if(folder)params.set("folder",folder);
 return `/student/notes?${params.toString()}`;
}

export const PURPOSE_LABEL:Record<string,string>={preview:"预习",review:"复习",exam:"考前冲刺"};

function firstLine(text:string){
 const line=(text||"").split("\n").map(s=>s.trim()).find(Boolean)||"";
 return line.replace(/^#+\s*/,"").replace(/[*`_>]/g,"").replace(/[。；，,.;]$/,"").slice(0,32);
}

function firstHeading(text:string){
 const match=(text||"").match(/^#{1,3}\s+(.+)$/m);
 return match?match[1].replace(/[*`_>]/g,"").trim().slice(0,32):"";
}

/** 确认卡的预填：面板里选过的优先，其次是本机记住的默认，最后按回答内容推断。 */
export function suggestNoteDraft(input:{answer:string;courseId:string;courseLabel:string;
  marker?:NoteMarker|null;defaults?:NoteDefaults|null}){
 const {marker,defaults}=input;
 const prefs=marker?.p||{};
 const dest=marker?.d||{};
 const purpose=PURPOSE_LABEL[prefs.purpose||""]||"";
 const chapter=marker?.src?.ch||"";
 // 标记里不带科目，科目用本机记住的默认，其次当前课程
 const courseId=defaults?.course_id||input.courseId;
 const folder=dest.f||defaults?.folder_path||chapter||"";
 // 文件名永远不记默认（用户明确要求），没有面板预填就按章节/标题现推
 const stem=chapter||firstHeading(input.answer)||firstLine(input.answer)||input.courseLabel;
 return {
  courseId,
  folderPath:folder,
  title:(dest.t||`${stem} · ${purpose?purpose+"笔记":"笔记"}`).slice(0,200),
  format:dest.fm||defaults?.format||"markdown",
  starred:dest.s!==undefined?!!dest.s:!!defaults?.starred,
  remark:"",
  content:input.answer||"",
 };
}

// 保存前把回答里的客套开场去掉，并补一个标题，笔记打开就是完整的一篇
export function cleanNoteBody(answer:string,title:string){
 const body=(answer||"").replace(/^(好的|以下是|这是|下面|我为你)[^\n]{0,40}[：:。\n]/,"").trim();
 return body.startsWith("#")?body:`# ${title}\n\n${body}`;
}

export const MERGE_WARN_BYTES=8000;
export const MERGE_WARN_SECTIONS=12;
export const NOTE_CONTENT_LIMIT=60000;

export function mergeRisk(target:Pick<Note,"content"|"title">,incoming:number){
 const existing=(target.content||"").length;
 const sections=(target.content||"").match(/^#{1,3}\s/gm)?.length||0;
 return {existing,incoming,total:existing+incoming,sections,
  tooLong:existing+incoming>NOTE_CONTENT_LIMIT,
  big:existing>MERGE_WARN_BYTES||sections>MERGE_WARN_SECTIONS};
}
