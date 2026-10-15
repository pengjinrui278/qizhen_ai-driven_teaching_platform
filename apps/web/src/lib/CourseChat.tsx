"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import PhotoInput from "./PhotoInput";
import StudentIcon from "./StudentIcon";
import ChatHistoryList from "./ChatHistoryList";
import "./student-chat.css";
import coursePrompts from "./course-prompts.json";
import {streamCourseMessage} from "./course-stream";
import "./course-chat.css";
import "./chat-refinement.css";
import "./chat-quote.css";
import {courseIntro} from "./course-intro";
import FormulaComposer,{type FormulaComposerHandle} from "./FormulaComposer";
import ChatMarkdown,{messageSource} from "./ChatMarkdown";
import QuoteSurface from "./QuoteSurface";
import QuotePanes from "./QuotePanes";
import type {QuoteUi,PaneTransport} from "./QuotePanes";
import QuoteTray,{FollowUpMessage,QuoteHud,QuoteToolbar} from "./QuoteTray";
import {buildTurnLabel,collectUnitsWithin,isFollowUpText,quoteKeyOf} from "./chat-quote.mjs";
import {canAddPane,clearWorkspace,collapseWithSubtree,descendantIds,holdPiece,loadLinks,loadWorkspace,newPaneId,paneLimit,pieceLimit,reorderPane,saveLinks,saveWorkspace,subtreeEnd} from "./quote-store";
import MaterialBoard,{MaterialToolbar} from "./MaterialBoard";
import NotePreferencePanel,{NoteEdgePanel,NoteModeToggle} from "./NotePreferencePanel";
import NoteOrganizeDialog from "./NoteOrganizeDialog";
import ChatToolMenu from "./ChatToolMenu";
import NoteSaveCard,{type SaveTarget} from "./NoteSaveCard";
import {composeRepliesMarker,decodeNoteMarker,notesHref,stripNoteMarker,withNoteMarker} from "./note-prefs";
import {DOC_ACCEPT,isDocFile,uploadDocument} from "./note-upload";
import "./note-prefs.css";
import {fileToDataUrl,inputFromFile,isImageFile,isTextFile,materialLimit,newMaterialPane,releaseMaterial,urlOf} from "./material-store";
import type {MaterialPane} from "./material-store";
import type {PaneState,QuotePiece} from "./quote-store";
type Row=Record<string,any>;
type Api=(path:string,method?:string,body?:any)=>Promise<any>;
type SourceMeta={source:string;label:string;paneId:string;attemptId?:string|null;requestId:string};
function sessionTime(value?:string){if(!value)return "创建时间未记录";const d=new Date(value);return Number.isNaN(d.getTime())?"创建时间未记录":"创建于 "+d.toLocaleString("zh-CN");}
function MessageText({text}:{text:string}){return <ChatMarkdown text={text}/>;}
export default function CourseChat({api,courses,user,sandboxes=[],streaming=false}:{api:Api;courses:Row[];user:Row;sandboxes?:Row[];streaming?:boolean}){
 const [stage,setStage]=useState("");
 const [assignment,setAssignment]=useState(""),[theme,setTheme]=useState("conditions");
 const [course,setCourse]=useState("mathematical_analysis"),[sessions,setSessions]=useState<Row[]>([]),[active,setActive]=useState<Row|null>(null),[events,setEvents]=useState<Row[]>([]);
 const [draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[pending,setPending]=useState<Row|null>(null),[copied,setCopied]=useState(""),[historyOpen,setHistoryOpen]=useState(false),[feedback,setFeedback]=useState("");
 const [relatedChunks,setRelatedChunks]=useState<Row[]>([]),[relatedLoading,setRelatedLoading]=useState(false),[showRelated,setShowRelated]=useState(false);
 const lock=useRef(false),epoch=useRef(0),bottom=useRef<HTMLDivElement>(null),input=useRef<FormulaComposerHandle>(null);
 const [historyLoading,setHistoryLoading]=useState(true),[historyError,setHistoryError]=useState("");
 const [failedSession,setFailedSession]=useState<Row|null>(null);
 const historyPanel=useRef<HTMLElement>(null),historyToggle=useRef<HTMLButtonElement>(null);
 const [actionId,setActionId]=useState<string|null>(null);
 // 笔记：面板打开状态、本次待发送的标记、以及「存为笔记」确认卡指向哪一条回答
 const [notePanel,setNotePanel]=useState<{purpose?:string;source?:string}|null>(null);
 const noteComposed=useRef<{prompt:string;marker:string}|null>(null);
 const [noteTarget,setNoteTarget]=useState<{requestId:string;target:SaveTarget}|null>(null);
 const [organizing,setOrganizing]=useState(false);
 // 笔记模式：关着的时候笔记相关交互一概不出现（人为调用，不做常驻引导）
 const [noteMode,setNoteMode]=useState(false);
 const [pickedReplies,setPickedReplies]=useState<string[]>([]);
 const [undoneNotes,setUndoneNotes]=useState<string[]>([]);   // 已撤回的自动存笔记
 // 输入 @ 时的笔记目录：拉本人的笔记，按关键词过滤后供选择
 const [edgeOpen,setEdgeOpen]=useState(false);
 const [mentionQuery,setMentionQuery]=useState<string|null>(null);
 const [mentionNotes,setMentionNotes]=useState<Row[]>([]);
 useEffect(()=>{
  if(mentionQuery===null||mentionNotes.length)return;
  let live=true;
  api("/notes").then((data:Row)=>{if(live)setMentionNotes(data.items||[]);}).catch(()=>{if(live)setMentionNotes([]);});
  return()=>{live=false;};
 },[mentionQuery,mentionNotes.length]);
 const messagesRef=useRef<HTMLDivElement>(null);
 const actionTimer=useRef<ReturnType<typeof setTimeout>|null>(null),historyEpoch=useRef(0);
 const workspace=useRef<HTMLElement>(null),followBottom=useRef(true);
 const pendingRef=useRef<Row|null>(null);
 const streamAbort=useRef<AbortController|null>(null);
 function leaveRequest(){epoch.current++;streamAbort.current?.abort();streamAbort.current=null;lock.current=false;setBusy(false);setStage("" );}
 const [historyEnd,setHistoryEnd]=useState(false);
 const [historyCollapsed,setHistoryCollapsed]=useState(false);
 // 摘录：引用片段 → 拼接 → 并行子页面。状态与持久化都集中在这里，不改既有会话逻辑。
 const [quotingPaneId,setQuotingPaneId]=useState<string|null>(null);
 // 剪贴托盘按面板隔离：trays["main"] 是主页面的，trays[paneId] 是各子页面的
 const [trays,setTrays]=useState<Record<string,QuotePiece[]>>({});
 const piecesOf=(paneId:string):QuotePiece[]=>trays[paneId]??[];
 const setPiecesOf=(paneId:string,next:QuotePiece[])=>setTrays(cur=>{
  if(next.length)return {...cur,[paneId]:next};
  const copy={...cur};delete copy[paneId];return copy;
 });
 const [panes,setPanes]=useState<PaneState[]>([]);
 const [links,setLinks]=useState<Record<string,string>>({});
 const [mainWeight,setMainWeight]=useState(1);
 const [quoteError,setQuoteError]=useState("");
 const sourcesRef=useRef<Record<string,SourceMeta>>({});
 const mainSourcesRef=useRef<Record<string,SourceMeta>>({});
 const subSourcesRef=useRef<Record<string,SourceMeta>>({});
 const mainSources=useMemo(()=>{
  const map:Record<string,SourceMeta>={};
  events.forEach((e:Row,i:number)=>{
   const label=buildTurnLabel("主页面",i+1);
   if(e.message)map["e:"+e.request_id+":user"]={source:messageSource(e.message),label:label+"（提问）",paneId:"main",attemptId:active?.id??null,requestId:e.request_id};
   if(e.response?.answer)map["e:"+e.request_id+":ai"]={source:messageSource(e.response.answer),label,paneId:"main",attemptId:active?.id??null,requestId:e.request_id};
  });
  return map;
 },[events,active?.id]);
 useEffect(()=>{mainSourcesRef.current=mainSources;sourcesRef.current={...mainSources,...subSourcesRef.current};},[mainSources]);
 const registerSources=useCallback((paneId:string,map:Record<string,SourceMeta>|null)=>{
  if(map)Object.assign(subSourcesRef.current,map);
  else for(const k of Object.keys(subSourcesRef.current))if(k.startsWith("q:"+paneId+":"))delete subSourcesRef.current[k];
  sourcesRef.current={...mainSourcesRef.current,...subSourcesRef.current};
 },[]);
 useEffect(()=>{ // 子页面绑定在主会话上：换会话即整套作废（不清 localStorage，回看旧会话仍可恢复）
  setQuotingPaneId(null);setTrays({});setQuoteError("");
  if(!active?.id){setPanes([]);return;}
  // 追问链路是全用户级、跨会话的：先取本地账本，再并入本次工作区里记录的链路
  const stored=loadWorkspace(user.id,active.id);
  setLinks({...loadLinks(user.id),...(stored?.links||{})});
  if(stored){setPanes(stored.panes);setMainWeight(stored.mainWeight??1);}
  else{setPanes([]);setMainWeight(1);}
 },[active?.id,user.id]);
 useEffect(()=>{ // 持久化 pane 树、追问链路与剪贴片段；会话未建立时不写
  if(!user?.id||!active?.id)return;
  saveWorkspace({v:1,userId:user.id,mainAttemptId:active.id,course,panes,links,mainWeight,updatedAt:Date.now()});
 },[panes,links,mainWeight,user?.id,active?.id,course]);
 // M2 布局：权重拖动、换位、抽页收纳、抽出定格（都落在 pane 树上，随上面的 effect 持久化）
 function resizePanes(patch:Record<string,number>){setPanes(prev=>prev.map(p=>patch[p.id]!==undefined?{...p,weight:patch[p.id]}:p));if(patch.main!==undefined)setMainWeight(patch.main);}
 function movePane(id:string,insertIndex:number){setPanes(prev=>reorderPane(prev,id,insertIndex));}
 function collapsePanes(ids:string[]){if(!ids.length)return;setPanes(prev=>collapseWithSubtree(prev,ids));}
 function collapseOnePane(id:string){setPanes(prev=>prev.map(p=>p.id===id?{...p,state:"tab",pinned:false}:p));}
 function pinPane(id:string){
  setPanes(prev=>prev.map(p=>p.id===id?{...p,state:"open",pinned:true}:p));
  // 抽出后把它滚到可见位置，动效才有落点
  setTimeout(()=>document.querySelector<HTMLElement>(`[data-pane-id="${id}"]`)?.scrollIntoView({block:"nearest",inline:"nearest",behavior:"smooth"}),60);
 }
 function toggleScissors(paneId:string){setQuoteError("");setQuotingPaneId(cur=>cur===paneId?null:paneId);}
 function exitScissors(){setQuotingPaneId(null);setQuoteError("");}
 function addPieces(paneId:string,incoming:QuotePiece[]){
  setTrays(cur=>{
   const now=cur[paneId]??[];
   const byKey=new Map(now.map(p=>[p.key,p]));
   incoming.forEach(p=>{if(!byKey.has(p.key))byKey.set(p.key,p);});
   const next=[...byKey.values()];
   if(next.length>pieceLimit)setQuoteError(`一次最多引用 ${pieceLimit} 处，请先拼接或清理。`);
   return {...cur,[paneId]:next.slice(0,pieceLimit)};
  });
 }
 function assemble(parentPaneId:string){
  const pieces=piecesOf(parentPaneId);
  if(!pieces.length)return;
  if(!canAddPane(panes)){setQuoteError(`同时最多保留 ${paneLimit} 个子页面，请先关闭一些。`);return;}
  if(pieces.reduce((n,p)=>n+p.source.length,0)>9000){setQuoteError("摘下的片段过长，请减少或缩短后再拼接。");return;}
  const parent=panes.some(p=>p.id===parentPaneId)?parentPaneId:"main";
  const pane:PaneState={id:newPaneId(),parentId:parent,attemptId:null,quotes:pieces.slice(),question:"",weight:1,state:"open",pinned:false,createdAt:Date.now()};
  setPanes(prev=>{const next=[...prev];next.splice(subtreeEnd(prev,parent),0,pane);return next;});
  setPiecesOf(parentPaneId,[]);exitScissors();
 }
 function closePane(id:string){
  const kids=descendantIds(panes,id);
  if(kids.length&&!window.confirm(`关闭将同时关闭其下 ${kids.length} 个子页面，继续？`))return;
  setPanes(prev=>prev.filter(p=>p.id!==id&&!kids.includes(p.id)));
  setTrays(cur=>{const copy={...cur};[id,...kids].forEach(x=>delete copy[x]);return copy;});
 }
 function bindAttempt(paneId:string,attemptId:string,question:string){
  const pane=panes.find(p=>p.id===paneId);
  const parentAttempt=pane?(pane.parentId==="main"?active?.id??null:panes.find(p=>p.id===pane.parentId)?.attemptId??null):null;
  if(parentAttempt){
   setLinks(cur=>{const next={...cur,[attemptId]:parentAttempt};saveLinks(user.id,next);return next;});
  }
  setPanes(prev=>prev.map(p=>p.id===paneId?{...p,attemptId,question}:p));
 }
 function removePaneQuote(paneId:string,pieceId:string){setPanes(prev=>prev.map(p=>p.id===paneId?{...p,quotes:p.quotes.filter(q=>q.id!==pieceId)}:p));}
 async function copyPieces(paneId:string){const pieces=piecesOf(paneId);try{await navigator.clipboard.writeText(pieces.map(p=>p.source).join("\n\n---\n\n"));setQuoteError(`已复制 ${pieces.length} 处`);setTimeout(()=>setQuoteError(""),1600);}catch{setQuoteError("复制失败，请手动选择文字。");}}
 function locatePiece(piece:QuotePiece){
  const container=piece.paneId==="main"?workspace.current:document.querySelector<HTMLElement>(`[data-pane-id="${piece.paneId}"] .chatPaneScroll`);
  if(!container)return;
  const target=[...container.querySelectorAll<HTMLElement>("[data-quote-unit]")].find(el=>quoteKeyOf(el)===piece.key);
  if(!target)return;
  target.scrollIntoView({block:"center",behavior:"smooth"});
  target.classList.add("quoteFlash");setTimeout(()=>target.classList.remove("quoteFlash"),1600);
 }
 function quoteAnswer(requestId:string){
  const host=workspace.current?.querySelector<HTMLElement>(`[data-quote-src="e:${requestId}:ai"]`);
  if(!host)return;
  const found=collectUnitsWithin(host,mainSourcesRef.current).map(p=>({...holdPiece(p),id:crypto.randomUUID()}));
  if(found.length)addPieces("main",found as QuotePiece[]);
 }
 // 参阅区：拖入本地文件或网址 → 停靠在对话卡片右侧，只作阅读用，不含 agent 对话
 const [materials,setMaterials]=useState<MaterialPane[]>([]);
 const [dropping,setDropping]=useState(false);
 const [dropZone,setDropZone]=useState<"ask"|"board"|null>(null);
 const [boardWidth,setBoardWidth]=useState(360);
 const materialsRef=useRef<MaterialPane[]>([]);materialsRef.current=materials;
 useEffect(()=>()=>{materialsRef.current.forEach(releaseMaterial);},[]);
 async function addFiles(files:FileList|File[]){
  const room=materialLimit()-materials.length;
  if(room<=0){setError(`参阅区最多停靠 ${materialLimit()} 个页面，请先关闭一些。`);return;}
  const list=Array.from(files).slice(0,room);
  const paneList:MaterialPane[]=[];
  for(const file of list){
   const input=inputFromFile(file);
   if(input.kind==="text"){try{input.source=await file.text();}catch{input.source="（读取失败）";}}
   paneList.push(newMaterialPane(input,materials.length+paneList.length));
  }
  setMaterials(cur=>[...cur,...paneList]);
  if(Array.from(files).length>room)setError(`参阅区最多停靠 ${materialLimit()} 个页面，多余的未加入。`);
 }
 function addUrl(value:string){
  const url=urlOf(value);
  if(!url){setError("请粘贴以 http:// 或 https:// 开头的网址。");return;}
  if(materials.length>=materialLimit()){setError(`参阅区最多停靠 ${materialLimit()} 个页面，请先关闭一些。`);return;}
  setMaterials(cur=>[...cur,newMaterialPane({kind:"url",title:url.replace(/^https?:\/\//,"").replace(/\/$/,""),source:url},cur.length)]);
 }
 function closeMaterial(id:string){setMaterials(cur=>{const pane=cur.find(p=>p.id===id);if(pane)releaseMaterial(pane);return cur.filter(p=>p.id!==id);});}
 function moveMaterial(id:string,delta:number){setMaterials(cur=>{const i=cur.findIndex(p=>p.id===id),j=i+delta;if(i<0||j<0||j>=cur.length)return cur;const next=[...cur];[next[i],next[j]]=[next[j],next[i]];return next;});}
 function clearMaterials(){setMaterials(cur=>{cur.forEach(releaseMaterial);return [];});}
 // 拖入分区：右侧 1/3 = 并排查看（参阅页），其余 = 上传文件向 AI 提问
 function zoneOf(clientX:number){return clientX>=window.innerWidth*2/3?"board":"ask";}
 function onDragOver(e:React.DragEvent){
  const types=e.dataTransfer?.types||[];
  const hasFile=Array.from(types).includes("Files");
  const hasText=Array.from(types).some(t=>t==="text/uri-list"||t==="text/plain");
  if(!hasFile&&!hasText)return;
  e.preventDefault();e.dataTransfer.dropEffect="copy";
  const zone=zoneOf(e.clientX);
  if(!dropping)setDropping(true);
  if(dropZone!==zone)setDropZone(zone);
 }
 function onDragLeave(e:React.DragEvent){if(e.currentTarget.contains(e.relatedTarget as Node))return;setDropping(false);setDropZone(null);}
 function onDrop(e:React.DragEvent){
  e.preventDefault();
  const zone=zoneOf(e.clientX);
  setDropping(false);setDropZone(null);
  const files=e.dataTransfer?.files;
  // 网址只能并排查看（浏览器无法抓取外部网页正文），不论落在哪边都进参阅区
  if(!files?.length){
   const url=e.dataTransfer.getData("text/uri-list")||e.dataTransfer.getData("text/plain");
   if(url)addUrl(url);
   return;
  }
  if(zone==="board")void addFiles(files);
  else void attachToQuestion(files);
 }
 // 左侧分区：把文件作为提问附件——文本类直接读入输入框，图片走既有识别链路
 async function attachToQuestion(files:FileList|File[]){
  const list=Array.from(files);
  let appended="";
  for(const file of list){
   if(isTextFile(file)){
    let text="";
    try{text=await file.text();}catch{text="";}
    appended+=`\n\n【文件：${file.name}】\n${text.slice(0,4000)}`;
   }else if(isImageFile(file)){
    try{
     const dataUrl=await fileToDataUrl(file);
     const result=await api("/recognize","POST",{data_url:dataUrl});
     appended+=`\n\n【图片识别：${file.name}】\n${(result?.text||"").slice(0,4000)}`;
    }catch{
     setError(`${file.name} 识别失败，可以先存成图片再拖进来，或改用相机入口。`);
     return;
    }
   }else{
    setError(`暂不支持把 ${file.name} 作为提问附件（浏览器无法读取该格式正文）。拖到右侧可并排查看。`);
    return;
   }
  }
  if(!appended)return;
  setDraft(cur=>cur+appended);
  setError("");
  window.setTimeout(()=>input.current?.focus(),0);
 }
 function startBoardResize(e:React.PointerEvent){
  e.preventDefault();
  const startX=e.clientX,width=boardWidth;
  const move=(ev:PointerEvent)=>setBoardWidth(Math.min(760,Math.max(280,width-(ev.clientX-startX))));
  const up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);};
  window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);
 }
 // 课程对话的传输层：创建 attempt + SSE 流式 + 读取 events
 const paneTransport:PaneTransport=useMemo(()=>({
  create:async(text:string)=>{const a=await api("/attempts","POST",{course_id:course,text,sandbox_id:null});return {id:String(a.id)};},
  send:async(id,request,onStage,signal)=>{if(streaming)await streamCourseMessage(id,request,onStage,signal);else await api("/attempts/"+id+"/messages","POST",request);},
  load:async(id:string)=>{const d=await api("/attempts/"+id);return d.events||[];},
 }),[api,course,streaming]);
 function quoteUi():QuoteUi{
  return {piecesOf,setPieces:setPiecesOf,quotingPaneId,error:quoteError,busy:busy||loading,onToggle:toggleScissors,onAssemble:assemble,onCopy:paneId=>void copyPieces(paneId),onClear:paneId=>setPiecesOf(paneId,[]),onExit:exitScissors,onAddPieces:addPieces,onSent:()=>void loadHistory(),onRemoveQuote:removePaneQuote,onLocate:locatePiece};
 }
 async function loadOlder(){const serial=++historyEpoch.current;setHistoryLoading(true);setHistoryError("");try{const rows=await api("/attempts?offset="+sessions.length+"&limit=100");if(serial===historyEpoch.current){setSessions(old=>[...old,...rows.filter((r:Row)=>!old.some(o=>o.id===r.id))]);setHistoryEnd(rows.length<100);}}catch(e){if(serial===historyEpoch.current)setHistoryError((e as Error).message);}finally{if(serial===historyEpoch.current)setHistoryLoading(false);}}

 useEffect(()=>{if(historyOpen)historyPanel.current?.querySelector<HTMLButtonElement>("button")?.focus();},[historyOpen]);
 function cancelActions(){if(actionTimer.current)clearTimeout(actionTimer.current);actionTimer.current=null;setActionId(null);}
 async function retryHistory(){const token=epoch.current;const rows=await loadHistory();if(token!==epoch.current||!rows||active)return;const id=new URLSearchParams(location.search).get("attempt");if(id)await resume(rows.find((row:Row)=>row.id===id)||{id});}
 function updateUrl(c:string,id?:string){const url=new URL(location.href);url.searchParams.set("course",c);if(id)url.searchParams.set("attempt",id);else url.searchParams.delete("attempt");history.replaceState(history.state,"",url);}
 async function loadHistory(){const serial=++historyEpoch.current;setHistoryLoading(true);setHistoryEnd(false);setHistoryError("");try{const rows=await api("/attempts");if(serial===historyEpoch.current)setSessions(rows);return serial===historyEpoch.current?rows:null;}catch(e){if(serial===historyEpoch.current)setHistoryError((e as Error).message);return null;}finally{if(serial===historyEpoch.current)setHistoryLoading(false);}}
 useEffect(()=>{let mounted=true;const token=++epoch.current;setSessions([]);setActive(null);setEvents([]);cancelActions();
  const q=new URLSearchParams(location.search);const c=q.get("course");if(c)setCourse(c);
  void loadHistory().then(async rows=>{if(!mounted||token!==epoch.current||!rows)return;const id=q.get("attempt");if(id)await resume(rows.find((a:Row)=>a.id===id)||{id});});
  return()=>{mounted=false;streamAbort.current?.abort();epoch.current++;historyEpoch.current++;if(actionTimer.current)clearTimeout(actionTimer.current);};},[user.id]);
 useEffect(()=>{const el=workspace.current;if(el&&followBottom.current)el.scrollTop=el.scrollHeight;},[events,pending,busy,actionId]);
 useEffect(()=>{if(loading||!active)return;let hash;try{hash=decodeURIComponent(location.hash.slice(1));}catch{return;}if(!hash.startsWith("turn-"))return;const frame=requestAnimationFrame(()=>{const target=document.getElementById(hash);if(target){followBottom.current=false;target.scrollIntoView({block:"start"});}});return()=>cancelAnimationFrame(frame);},[active?.id,loading]);
 function resetRelated(){setRelatedChunks([]);setRelatedLoading(false);setShowRelated(false);setCopied("");setFeedback("");}
 function clear(c=course){if(panes.length&&!window.confirm("开始新对话将关闭全部子页面，继续？"))return;leaveRequest();cancelActions();followBottom.current=true;updateUrl(c);setLoading(false);setFailedSession(null);resetRelated();setCourse(c);setAssignment("");setActive(null);setEvents([]);setPending(null);pendingRef.current=null;setDraft("");setError("");setHistoryOpen(false);input.current?.focus();}
 async function resume(a:Row){if(panes.length&&!window.confirm("打开其它对话将关闭全部子页面，继续？"))return;leaveRequest();setFailedSession(null);const token=++epoch.current;cancelActions();followBottom.current=false;if(workspace.current)workspace.current.scrollTop=0;resetRelated();setActive(null);setEvents([]);setPending(null);pendingRef.current=null;setDraft("");setLoading(true);setError("");try{const d=await api("/attempts/"+a.id);if(token===epoch.current){updateUrl(d.course_id,a.id);setCourse(d.course_id);setActive(d);setAssignment(d.sandbox_id||"");setEvents(d.events);setPending(null);pendingRef.current=null;setDraft(d.events.length===0?(d.problem?.text||""):"");setHistoryOpen(false);}}catch(e){if(token===epoch.current){setError("无法打开对话："+(e as Error).message);setFailedSession(a);}}finally{if(token===epoch.current)setLoading(false);}}
 // 拖入/选择的文档：上传抽文本，成功后作为高亮块钉在输入框最前面（不管光标在哪）
 const [uploading,setUploading]=useState(false);
 const [dragging,setDragging]=useState(false);
 async function addDocuments(files:File[]){
  const docs=files.filter(isDocFile);
  if(!docs.length){setError("只支持 PDF、Word、PPT、txt/md 与常见代码文件；图片请用左边的「图片」。");return;}
  setUploading(true);setError("");
  try{
   for(const file of docs){
    const saved=await uploadDocument(file);
    input.current?.addFile({id:saved.id,name:saved.filename,kind:saved.kind_label});
    if(saved.note)setError(saved.note);   // 抽不出正文时如实说明，不假装读到了
   }
  }catch(e){setError(e instanceof Error?e.message:"文档上传失败");}
  finally{setUploading(false);}
 }
 // 选中的回答 → 交给 agent 整理成「一份」笔记（不是按顺序照抄），发送后由服务端自动存库
 function composeFromPicked(){
  if(!pickedReplies.length)return;
  const seeds=pickedReplies.map((id,index)=>{
   const row=events.find(x=>x.request_id===id);
   return `【第 ${index+1} 处】${(row?.response?.answer||"").slice(0,300)}`;
  }).join("\n");
  const prompt=`请把下面这 ${pickedReplies.length} 处回答整理成一份笔记：去掉重复、按主题重新组织、补上必要的结构，不要按原顺序照抄。\n\n${seeds}`;
  noteComposed.current={prompt,marker:composeRepliesMarker(pickedReplies)};
  setDraft(prompt);
  setPickedReplies([]);
  input.current?.focus();
 }
 async function send(retry=false,mode="chat"){
  if(lock.current||loading||user.status!=="active")return;
  const msg=mode==="chat"?draft.trim():(mode==="first_hint"?"我卡住了，请给我一个方向提示":mode==="next_hint"?"还是不太懂，请再深入一点":mode==="full_solution"?"请梳理大致解题流程、主要步骤、条件检查和验证方法，保留核心计算或论证让我完成":draft.trim());
  // 笔记偏好面板拼好的提示词：发送时把来源标记追加到末尾（输入框里不显示），
  // 用户改过内容就不再加标记，退化成一次普通提问。
  const composed=!retry&&noteComposed.current&&noteComposed.current.prompt.trim()===msg?noteComposed.current:null;
  const wire=composed?withNoteMarker(msg,composed.marker):msg;
  if(composed)noteComposed.current=null;
  const request=retry?pendingRef.current:{request_id:crypto.randomUUID(),mode,message:wire};
  if(!request?.message)return;
  cancelActions();lock.current=true;setDraft("");setBusy(true);setError("");setFeedback("");setPending(request);pendingRef.current=request;
  const token=epoch.current;
  try{
   let a=active;
   if(!a){a=await api("/attempts","POST",{course_id:course,text:request.message,sandbox_id:assignment||null});if(token!==epoch.current)return;setActive(a);updateUrl(course,a!.id);setSessions(rows=>[a!,...rows.filter(row=>row.id!==a!.id)]); }
   const aid=a!.id;
   setStage("queued");
   if(streaming){streamAbort.current=new AbortController();await streamCourseMessage(aid,request,value=>{if(token===epoch.current)setStage(value);},streamAbort.current.signal);}
   else await api("/attempts/"+aid+"/messages","POST",request);
   const completedAt=Date.now();
   const detail=await api("/attempts/"+aid);
   if(token!==epoch.current)return;
   setEvents(detail.events);setPending(null);pendingRef.current=null;setDraft("");
   const latest=detail.events.at(-1);if(latest?.request_id===request.request_id&&latest.response?.answer){actionTimer.current=setTimeout(()=>{if(token===epoch.current)setActionId(request.request_id);},Math.max(0,3000-(Date.now()-completedAt)));}
   void loadHistory();
  }catch(e){if(token===epoch.current)setError((e as Error).message);}
  finally{if(token===epoch.current){lock.current=false;setBusy(false);}}
 }
 const name=courses.find(c=>c.course_id===course)?.display_name||"课程";
 async function report(outcome:string){if(!active||busy)return;try{await api("/attempts/"+active.id+"/feedback","POST",{request_id:crypto.randomUUID(),outcome,theme,note:""});setFeedback("已记录");}catch(e){setError((e as Error).message);}}
 async function searchRelated(text:string){
  if(!text.trim())return;
  const token=epoch.current;
  setRelatedLoading(true);setShowRelated(true);
  try{
   const chunks=await api("/textbooks/related","POST",{course_id:course,text:text.slice(0,12000)});
   if(token===epoch.current)setRelatedChunks(chunks);
  }catch(e){if(token===epoch.current){setRelatedChunks([]);setError("教材搜索暂不可用，识别文字已保留，可继续提问。");}}
  finally{if(token===epoch.current)setRelatedLoading(false);}
 }
 // Capture the conversation generation so old callbacks cannot fill a new draft.
 const photoEpoch=epoch.current;
 function handleRecognizedText(text:string){
  if(photoEpoch!==epoch.current)return;
  setDraft(current=>current?current+"\n"+text:text);
  void searchRelated(text);
 }
 const isInitial=(e:Row,i:number)=>i===0&&e.message===active?.problem?.text;
 const courseSymbol:Record<string,string>={mathematical_analysis:"ε",linear_algebra_analytic_geometry:"⟨⟩",university_physics:"ω",point_set_topology:"τ",ordinary_differential_equations:"y′"};
 const suggestionList=(coursePrompts as Record<string,{title:string;question:string}[]>)[course]||[{title:"从一个问题开始",question:"请帮我拆解这个问题，并引导我检查自己的思路。"}];
 return <section className={"courseChat lmCourseChat"+(showRelated?" hasRelated":"")+(historyCollapsed?" historyCollapsed":"")} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
 {dropping&&<div className={"dropOverlay"+(dropZone?" is"+dropZone:"")} aria-hidden="true">
  <div className="dropZone dropZoneAsk">
   <StudentIcon name="file"/>
   <strong>上传文件 · 向 AI 提问</strong>
   <span>文本/Markdown 直接读入输入框；图片先识别成文字再提问</span>
  </div>
  <div className="dropZoneLine" aria-hidden="true"/>
  <div className="dropZone dropZoneBoard">
   <StudentIcon name="library"/>
   <strong>并排查看 · 不参与提问</strong>
   <span>作为参阅页停在右侧，只看不聊（文件不出本机）</span>
  </div>
 </div>}
 {historyOpen&&<button className="chatDrawerOverlay" aria-label="关闭历史对话遮罩" onClick={()=>setHistoryOpen(false)}/> }
 <aside ref={historyPanel} aria-label="历史对话" onKeyDown={e=>{if(e.key==="Escape"){setHistoryOpen(false);historyToggle.current?.focus();}}} className={"chatHistory "+(historyOpen?"isOpen":"")}><div className="chatSidebarHead"><strong>课程学习</strong><button aria-label={historyCollapsed?"展开左栏":"收起左栏"} onClick={()=>{if(window.matchMedia("(min-width:1024px)").matches)setHistoryCollapsed(!historyCollapsed);else setHistoryOpen(false);}}><StudentIcon name="menu"/></button></div><label>课程<select aria-label="聊天课程" disabled={loading} value={course} onChange={e=>clear(e.target.value)}>{courses.map(c=><option key={c.course_id} value={c.course_id}>{c.display_name}</option>)}</select></label>{!active&&<details><summary>关联作业</summary><select aria-label="关联作业" disabled={busy||loading} value={assignment} onChange={e=>setAssignment(e.target.value)}><option value="">私人学习</option>{sandboxes.filter(s=>s.course_id===course&&s.status==="open").map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></details>}<h2>最近对话</h2>{historyLoading&&<p role="status">正在加载历史…</p>}{historyError&&<p role="alert">历史加载失败：{historyError}<button onClick={()=>void retryHistory()}>重新加载历史</button></p>}<div className="chatSessionList"><ChatHistoryList sessions={sessions.filter(s=>s.course_id===course)} activeId={active?.id} onOpen={a=>void resume(a)} followUpOf={id=>links[id]??null}/>{!historyLoading&&!historyError&&!sessions.some(s=>s.course_id===course)&&<p>暂无对话</p>}</div>{sessions.length>=100&&!historyEnd&&<button disabled={historyLoading} onClick={()=>void loadOlder()}>加载更早的对话</button>}</aside>
 <QuotePanes panes={panes} quote={quoteUi()} board={materials.length>0?<>
   <div className="paneResizer" role="separator" aria-orientation="vertical" aria-label="调整参阅区宽度" onPointerDown={startBoardResize}/>
   <div className="materialSlot" style={{flexBasis:boardWidth}}>
    <MaterialBoard panes={materials} onClose={closeMaterial} onHeight={(id,h)=>setMaterials(cur=>cur.map(p=>p.id===id?{...p,height:h}:p))} onMove={moveMaterial} onClear={clearMaterials}/>
   </div>
 </>:null} dropping={dropping} transport={paneTransport} user={user} sourcesRef={sourcesRef} mainWeight={mainWeight} layout={{onWeights:resizePanes,onReorder:movePane,onCollapse:collapsePanes,onCollapseOne:collapseOnePane,onPin:pinPane}} onClose={closePane} onBindAttempt={bindAttempt} onSources={registerSources}>
 <section className="chatWorkspace" ref={workspace}
  onDragOver={e=>{if(Array.from(e.dataTransfer?.items||[]).some(i=>i.kind==="file")){e.preventDefault();setDragging(true);}}}
  onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}}
  onDrop={e=>{e.preventDefault();setDragging(false);void addDocuments(Array.from(e.dataTransfer?.files||[]));}}
  data-quoting={quotingPaneId==="main"?"":undefined}
  data-dragging={dragging?"true":undefined}
  onScroll={()=>{const el=workspace.current;if(el)followBottom.current=el.scrollHeight-el.clientHeight-el.scrollTop<60;}}><header className="chatHeader"><button ref={historyToggle} className="chatSidebarLauncher" aria-label="打开对话列表" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(true)}><StudentIcon name="menu"/></button><span className="chatCourseName">{name}</span><NoteModeToggle on={noteMode} disabled={busy||loading||user.status!=="active"} toggle={()=>{setNoteMode(v=>!v);setPickedReplies([]);}}/><button onClick={()=>clear()}>新对话</button></header>
 <div className="chatMessages" role="log" aria-label="课程对话" aria-live="polite">
 {!active&&!pending&&<div className="chatWelcome"><div className="welcomeIcon">{courseSymbol[course]||"∑"}</div><h2>你好，我是{name} Course Mirror</h2><p>{courseIntro(course)}</p><div className="suggestionRow">{suggestionList.map(s=><button key={s.title} title={s.question} type="button" disabled={busy||loading} onClick={()=>{setDraft(s.question);input.current?.focus();}}>{s.title}</button>)}</div></div>}
 {loading&&<p role="status">正在打开对话…</p>}
 {active&&(!pending||pending.message!==active.problem.text)&&(events.length===0||!isInitial(events[0],0))&&<div className="lmMessageRow lmMessageMe"><span className="lmMessageAvatar"><StudentIcon name="person"/></span><div className="lmMessageBody"><div className="lmMessageName">我</div><article className="chatUser">{isFollowUpText(active.problem.text||"")?<FollowUpMessage text={active.problem.text}/>:<MessageText text={active.problem.text||"课程问题"}/>}</article></div></div>}
 {active&&!loading&&events.length===0&&!busy&&<p role="status">这段对话尚无已完成的回答。原问题已保留在下方，可直接发送继续。</p>}
 {events.map((e,i)=><div className="chatExchange" id={"turn-"+e.request_id} key={e.request_id}><div className="lmMessageRow lmMessageMe"><span className="lmMessageAvatar"><StudentIcon name="person"/></span><div className="lmMessageBody"><div className="lmMessageName">我</div><article className="chatUser" data-quote-src={"e:"+e.request_id+":user"}>{isFollowUpText(stripNoteMarker(e.message||""))?<FollowUpMessage text={stripNoteMarker(e.message||"")}/>:<MessageText text={stripNoteMarker(e.message||"")||active?.problem?.text||"继续"}/>}</article></div></div><div className="lmMessageRow"><span className="lmMessageAvatar lmMessageAI"><StudentIcon name="spark"/></span><div className="lmMessageBody"><div className="lmMessageName">Course Mirror · {name}</div><article className={"chatAssistant"+(noteMode?" isPickable":"")+(pickedReplies.includes(e.request_id)?" isPicked":"")} data-quote-src={"e:"+e.request_id+":ai"} data-pick-id={e.request_id}
   onClick={noteMode?(ev=>{const el=ev.target as HTMLElement;if(el.closest("button,a,details,summary"))return;setPickedReplies(cur=>cur.includes(e.request_id)?cur.filter(x=>x!==e.request_id):[...cur,e.request_id]);}):undefined}>
   {noteMode&&<span className="pickMark" aria-hidden="true">{pickedReplies.includes(e.request_id)?"✓ 已选中":"选中这处"}</span>}
   {e.response?.decision?.note_saved&&<div className="noteSavedNotice" role="status">
    {undoneNotes.includes(e.response.decision.note_saved.id)
     ? <span>已撤回，这份笔记已移入回收站。</span>
     : <>
       <span>已存到 我的笔记 › {courses.find(c=>c.course_id===e.response.decision.note_saved.course_id)?.display_name||e.response.decision.note_saved.course_id}
        {e.response.decision.note_saved.folder_path?` › ${e.response.decision.note_saved.folder_path}`:""} › 《{e.response.decision.note_saved.title}》</span>
       <a href={"/student/notes?note="+encodeURIComponent(e.response.decision.note_saved.id)}>查看</a>
       <button type="button" onClick={()=>{const id=e.response.decision.note_saved.id;
         void api("/notes/"+id,"DELETE").then(()=>setUndoneNotes(cur=>[...cur,id])).catch(()=>setError("撤回失败，请到「我的笔记」里手动删除。"));}}>撤回</button>
      </>}
   </div>}
   {e.response?.hint_level&&<div className="hintTag">{e.response?.decision?.hint_scale_version==="course-hints-v1-three" ? `提示 ${e.response.hint_level}/3` : `历史提示级别 ${e.response.hint_level}（量表未转换）`}</div>}<MessageText text={e.response.answer}/><div className="chatMessageTools"><button onClick={async()=>{try{await navigator.clipboard.writeText(e.response.answer);setCopied(e.request_id);}catch{setError("复制失败，请手动选择文字。");}}}>{copied===e.request_id?"✓ 已复制":"复制"}</button><button onClick={()=>quoteAnswer(e.request_id)}>引用此回答</button>{e.response.citations?.length>0&&<details><summary>资料来源</summary>{e.response.citations.map((c:Row,j:number)=><p key={j}>{c.locator||c.source_id}</p>)}</details>}</div>{actionId===e.request_id&&!busy&&!loading&&<div className="hintButtons" aria-label="继续学习"><button className="hintBtn" disabled={user.status!=="active"} onClick={()=>send(false,"first_hint")}>我卡住了</button><button className="hintBtn" disabled={user.status!=="active"} onClick={()=>send(false,"next_hint")}>再深入一点</button><button className="hintBtn" disabled={user.status!=="active"} onClick={()=>send(false,"full_solution")}>梳理解题框架</button></div>}</article></div></div></div>)}
 {pending&&<div className="lmMessageRow lmMessageMe"><span className="lmMessageAvatar"><StudentIcon name="person"/></span><div className="lmMessageBody"><div className="lmMessageName">我</div><article className="chatUser"><MessageText text={pending.message}/></article></div></div>}
 {busy&&<p className="chatThinking" role="status">{({queued:"正在准备…",retrieving:"寻知 · 正在查找教材…",generating:"答疑 · 正在思考…",checking:"正在核对回答…"} as Row)[stage]||"正在思考…"}</p>}{quotingPaneId==="main"&&<QuoteHud count={piecesOf("main").length} limit={pieceLimit} error={quoteError} canAssemble={piecesOf("main").length>0} onAssemble={()=>assemble("main")} onCopy={()=>void copyPieces("main")} onClear={()=>setPiecesOf("main",[])} onExit={exitScissors}/>}<div ref={bottom}/></div>
 {error&&<div className="chatError" role="alert">{error}{failedSession&&!loading&&<button onClick={()=>void resume(failedSession)}>重新打开对话</button>}{pending&&!busy&&<button onClick={()=>send(true)}>重试</button>}</div>}
 <QuoteTray pieces={piecesOf("main")} onRemove={id=>setPiecesOf("main",piecesOf("main").filter(p=>p.id!==id))} onLocate={locatePiece} onAssemble={()=>assemble("main")} busy={busy}/>
 {/* 拖进文件或引用了教材/笔记之后，输入框上方冒出页边；点它上下抽出偏好面板 */}
 {/\[\[MIRROR-(UPLOAD1|REF1) /.test(draft)&&<NoteEdgePanel open={edgeOpen} onToggle={()=>setEdgeOpen(v=>!v)}
  onPick={fragment=>{input.current?.addPrompt(fragment);input.current?.focus();}}/>}
 {mentionQuery!==null&&<div className="noteMention" role="listbox" aria-label="引用我的笔记">
  {(()=>{
   const keyword=mentionQuery.trim().toLowerCase();
   const hits=(keyword?mentionNotes.filter(n=>((n.title||"")+(n.folder_path||"")+(n.remark||"")).toLowerCase().includes(keyword)):mentionNotes).slice(0,8);
   if(!mentionNotes.length)return <p className="noteMentionEmpty">还没有笔记可以引用。</p>;
   if(!hits.length)return <p className="noteMentionEmpty">没有匹配的笔记。</p>;
   return hits.map(row=><button type="button" role="option" aria-selected="false" key={row.id}
     onClick={()=>{input.current?.insertNoteRef({id:row.id,name:row.title});setMentionQuery(null);}}>
    <span className="noteMentionTitle">{row.starred?"★ ":""}{row.title}</span>
    <span className="noteMentionMeta">{courses.find(c=>c.course_id===row.course_id)?.display_name||row.course_id} › {row.folder_path||"科目根"}</span>
   </button>);
  })()}
 </div>}
 {noteMode&&pickedReplies.length>0&&<div className="notePickBar" role="group" aria-label="已选中的回答">
  <span>已选 {pickedReplies.length} 处回答</span>
  <button type="button" className="notePickGo" onClick={composeFromPicked}>存为笔记</button>
  <button type="button" onClick={()=>setPickedReplies([])}>清除</button>
 </div>}
 <form className="chatComposer" key="composer" onSubmit={e=>{e.preventDefault();void send();}}>
 <FormulaComposer key={photoEpoch} ref={input} value={draft} onChange={setDraft} onSend={()=>void send()} disabled={busy||loading||user.status!=="active"||quotingPaneId==="main"}
  placeholder={noteMode?"笔记模式：可拖入文件、输入 @ 引用笔记，或选中上面的回答后点「存为笔记」":undefined}
  onMention={query=>setMentionQuery(query)}/>
 <div className="chatComposerActions">
  <ChatToolMenu label="工具库" disabled={busy||loading||user.status!=="active"}>
    <PhotoInput key={photoEpoch} disabled={busy||loading||user.status!=="active"} recognize={data=>api("/recognize","POST",{data_url:data})} onText={handleRecognizedText}/>
    <label className="chatDocUpload"><StudentIcon name="file"/>{uploading?"上传中…":"选择文件"}<input type="file" multiple accept={DOC_ACCEPT} aria-label="上传文档" disabled={busy||loading||uploading||user.status!=="active"} onChange={e=>{void addDocuments(Array.from(e.target.files||[]));e.target.value="";}}/></label>
    <QuoteToolbar quoting={quotingPaneId==="main"} count={piecesOf("main").length} disabled={busy||loading} onToggle={()=>toggleScissors("main")}/>
    <MaterialToolbar count={materials.length} onPick={files=>void addFiles(files)} onUrl={addUrl} disabled={busy||loading}/>
  </ChatToolMenu>
  <button className="primary" type="submit" disabled={busy||loading||!draft.trim()||user.status!=="active"}><StudentIcon name="send"/>{busy?"思考中":"发送"}</button></div>
 </form>
 {events.length>0&&<details><summary>补充学习反馈</summary><label>反馈环节<select value={theme} onChange={e=>setTheme(e.target.value)}><option value="conditions">定理条件</option><option value="quantifiers">量词与依赖</option><option value="construction">辅助对象</option></select></label><button disabled={busy} onClick={()=>report("still_stuck")}>仍有困难</button><button disabled={busy} onClick={()=>report("independent_success")}>这次独立完成</button>{feedback&&<p role="status">{feedback}</p>}</details>}
 </section>
 <QuoteSurface paneId="main" active={quotingPaneId==="main"} containerRef={workspace} sourcesRef={sourcesRef} pieces={piecesOf("main")} onChange={next=>setPiecesOf("main",next)} onExit={exitScissors}/>
 </QuotePanes>
 {notePanel&&<NotePreferencePanel courseId={course} courses={courses} preset={notePanel} onClose={()=>setNotePanel(null)}
  onComposed={(prompt,marker)=>{noteComposed.current={prompt,marker};setDraft(prompt);setNotePanel(null);input.current?.focus();}}/>}
 {organizing&&<NoteOrganizeDialog courses={courses} onClose={()=>setOrganizing(false)}
  onDone={count=>{setOrganizing(false);setError("");setFeedback(`已移动 ${count} 份笔记`);}}/>}
 {showRelated&&<div className="relatedPanel">
  <div className="relatedHeader">
   <span className="relatedTitle"><StudentIcon name="library"/>相关教材内容</span>
   <button className="relatedClose" aria-label="关闭相关教材" onClick={()=>setShowRelated(false)}><StudentIcon name="close"/></button>
  </div>
  {relatedLoading?<p className="relatedLoading">正在搜索教材…</p>:
   relatedChunks.length?<div className="relatedList">
    {relatedChunks.map((c:Row)=><div key={c.chunk_id} className="relatedItem">
     <div className="relatedMeta">{c.chapter||"教材"} · {c.locator?.split("·")[1]?.trim()||""}</div>
     <div className="relatedContent">{c.content?.slice(0,120)}{c.content?.length>120?"…":""}</div>
     <button className="relatedInsert" onClick={()=>setDraft(cur=>(cur?cur+"\n\n":"")+"参考教材："+(c.chapter||"")+" "+(c.content?.slice(0,80)||""))}>引用到对话</button>
    </div>)}
   </div>:<p className="relatedEmpty">未找到相关教材内容</p>}
 </div>}
</section>;
}
