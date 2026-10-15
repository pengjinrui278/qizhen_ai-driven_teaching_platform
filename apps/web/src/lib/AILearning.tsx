"use client";
import {courseIntro} from "./course-intro";
import {useEffect,useRef,useState} from "react";
import QuotePanes from "./QuotePanes";
import type {QuoteUi,PaneTransport} from "./QuotePanes";
import QuoteSurface from "./QuoteSurface";
import QuoteTray,{FollowUpMessage,QuoteHud,QuoteToolbar} from "./QuoteTray";
import MaterialBoard,{MaterialToolbar} from "./MaterialBoard";
import {buildTurnLabel,collectUnitsWithin,quoteKeyOf} from "./chat-quote.mjs";
import {canAddPane,collapseWithSubtree,descendantIds,holdPiece,newPaneId,paneLimit,pieceLimit,reorderPane,subtreeEnd} from "./quote-store";
import type {PaneState,QuotePiece} from "./quote-store";
import {fileToDataUrl,inputFromFile,isImageFile,isTextFile,materialLimit,newMaterialPane,releaseMaterial,urlOf} from "./material-store";
import type {MaterialPane} from "./material-store";
import {useCallback,useMemo} from "react";
import Link from "next/link";
import WindowsInstaller from "./WindowsInstaller";
import AIToolDirectory from "./AIToolDirectory"; import coursePrompts from "./course-prompts.json";
import {liveApi} from "./Pilot";
import StudentIcon from "./StudentIcon";
import ChatMarkdown from "./ChatMarkdown";
import FormulaComposer,{type FormulaComposerHandle} from "./FormulaComposer";
import "./student-ai-chat.css";
import "katex/dist/katex.min.css";
import "./ai-learning.css";
import "./ai-prompts.css";
import NotePreferencePanel,{NoteModeToggle} from "./NotePreferencePanel";
import NoteOrganizeDialog from "./NoteOrganizeDialog";
import ChatToolMenu from "./ChatToolMenu";
import {DOC_ACCEPT,isDocFile,uploadDocument} from "./note-upload";
import NoteSaveCard,{type SaveTarget} from "./NoteSaveCard";
import {decodeNoteMarker,stripNoteMarker,withNoteMarker} from "./note-prefs";
import "./note-prefs.css";
type Row=Record<string,any>;
type SourceMeta={source:string;label:string;paneId:string;attemptId?:string|null;requestId:string};
const entranceMeta:Record<string,[string,string]>={ // [图标, 一句说明]
 "":["spark","与 AI 连续对话、问知识、识别图片"],
 resources:["library","按教材检索已核对的知识点与例题"],
 notes:["file","自己写的、AI 整理成稿的笔记都在这里"],
 tools:["switch","国内外常用 AI 工具黄页与安装指引"],
 setup:["download","在本机安装 AI 工具（WinGet 固定版本）"],
};
const tabs=[["","知识问答"],["resources","学习资料"],["notes","我的笔记"],["tools","工具中心"],["setup","本地安装"]];
// 与课程对话页统一：同一套渲染管线（ChatMarkdown），公式、引用标记行为一致
function Markdown({text}:{text:string}){
 return <ChatMarkdown text={text}/>;
}
function saveFile(name:string,content:string){const u=URL.createObjectURL(new Blob([content],{type:"text/markdown;charset=utf-8"}));const a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}
export default function AILearning({section=""}:{section?:string}){
 const tab=section.replace(/^ai\/?/,"");
 const [sessions,setSessions]=useState<Row[]>([]),[active,setActive]=useState<Row|null>(null),[messages,setMessages]=useState<Row[]>([]);
 const [text,setText]=useState(""),[picture,setPicture]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [resources,setResources]=useState<Row[]>([]),[notes,setNotes]=useState<Row[]>([]),[results,setResults]=useState<Row[]>([]),[query,setQuery]=useState("");
 const [draft,setDraft]=useState<Row|null>(null);
 const [historyOpen,setHistoryOpen]=useState(false);
 // 笔记：AI 素养路径没有教材章可读，来源只能是「刚才的回答」
 const [notePanel,setNotePanel]=useState<{purpose?:string;source?:string}|null>(null);
 const [noteTarget,setNoteTarget]=useState<SaveTarget|null>(null);
 const noteComposed=useRef<{prompt:string;marker:string}|null>(null);
 const [organizing,setOrganizing]=useState(false);
 // 笔记模式：关着时笔记相关交互一概不出现
 const [noteMode,setNoteMode]=useState(false);
 // 文档上传：抽正文交给后端，前端只留一个高亮块
 const [uploading,setUploading]=useState(false);
 async function addDocuments(files:File[]){
  const docs=files.filter(isDocFile);
  if(!docs.length){setError("只支持 PDF、Word、PPT、txt/md 与常见代码文件；图片请用「图片」那一格。");return;}
  setUploading(true);setError("");
  try{
   for(const file of docs){
    const saved=await uploadDocument(file);
    aiInput.current?.addFile({id:saved.id,name:saved.filename,kind:saved.kind_label});
    if(saved.note)setError(saved.note);   // 抽不出正文时如实说明
   }
  }catch(e){setError(e instanceof Error?e.message:"文档上传失败");}
  finally{setUploading(false);}
 }
 const lock=useRef(false),bottom=useRef<HTMLDivElement>(null),aiMessagesRef=useRef<HTMLDivElement>(null),pending=useRef<{id:string;text:string;image:string}|null>(null),aiInput=useRef<FormulaComposerHandle>(null);
 async function run(task:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");try{await task();}catch(e){setError(e instanceof Error?e.message:"暂时无法完成");}finally{lock.current=false;setBusy(false);}}
 // 笔记列表改从新的笔记库取（科目=AI 教学）；旧的 /ai/notes 由后端 migrate_ai_notes 并过去
 useEffect(()=>{if(tab==="tools"||tab==="setup")return;let live=true;Promise.all([liveApi("/ai/sessions"),liveApi("/ai/resources"),liveApi("/notes?course_id=ai_literacy")]).then(([s,r,n])=>{if(live){setSessions(s);setResources(r);setNotes(n.items||[]);}}).catch(e=>live&&setError(e.message));return()=>{live=false;};},[]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:"nearest",behavior:"smooth"});},[messages,busy]);
 async function send(){if(!text.trim())return;await run(async()=>{
  let current=active;
  if(!current){current=await liveApi("/ai/sessions","POST");setActive(current);}
  // 面板拼好的提示词：发送时追加来源标记（输入框与气泡里都不显示）
  const composed=noteComposed.current&&noteComposed.current.prompt.trim()===text?noteComposed.current:null;
  const wire=composed?withNoteMarker(text,composed.marker):text;
  if(composed)noteComposed.current=null;
  if(!pending.current||pending.current.text!==text||pending.current.image!==picture)pending.current={id:crypto.randomUUID(),text,image:picture};
  await liveApi("/ai/sessions/"+current!.id+"/messages","POST",{request_id:pending.current.id,text:wire,image:picture||null});
  const detail=await liveApi("/ai/sessions/"+current!.id);setActive(detail);setMessages(detail.messages);
  setSessions(await liveApi("/ai/sessions"));setText("");setPicture("");pending.current=null;
 });}
 // 走同一张「存为笔记」确认卡（默认新建、并入须显式选）
 function noteFrom(m:Row){setNoteTarget({answer:m.answer,courseId:"ai_literacy",marker:decodeNoteMarker(m.question),
   chat:{page:"ai",session_id:active?.id,message_id:m.id}});}
 async function chooseImage(file?:File){if(!file)return;setError("");if(file.size>4*1024*1024){setError("图片请小于 4MB");return;}if(!["image/png","image/jpeg","image/webp"].includes(file.type)){setError("请选择 PNG、JPEG 或 WebP 图片");return;}const reader=new FileReader();reader.onload=()=>setPicture(String(reader.result));reader.onerror=()=>setError("无法读取图片");reader.readAsDataURL(file);}

 // ===== 摘录 / 参阅：与课程对话同一套工作区，传输层换成 AI 会话（/ai/sessions，无 SSE）=====
 const [quotingPaneId,setQuotingPaneId]=useState<string|null>(null);
 const [trays,setTrays]=useState<Record<string,QuotePiece[]>>({});
 const piecesOf=(paneId:string):QuotePiece[]=>trays[paneId]??[];
 const setPiecesOf=(paneId:string,next:QuotePiece[])=>setTrays(cur=>{if(next.length)return{...cur,[paneId]:next};const copy={...cur};delete copy[paneId];return copy;});
 const [panes,setPanes]=useState<PaneState[]>([]);
 const [mainWeight,setMainWeight]=useState(1);
 const [quoteError,setQuoteError]=useState("");
 const sourcesRef=useRef<Record<string,SourceMeta>>({});
 const subSourcesRef=useRef<Record<string,SourceMeta>>({});
 const aiSources=useMemo(()=>{
  const map:Record<string,SourceMeta>={};
  messages.forEach((m:Row,i:number)=>{
   const label=buildTurnLabel("主页面",i+1);
   if(m.question)map["m:"+m.id+":user"]={source:m.question,label:label+"（提问）",paneId:"main",attemptId:active?.id??null,requestId:m.id};
   if(m.answer)map["m:"+m.id+":ai"]={source:m.answer,label,paneId:"main",attemptId:active?.id??null,requestId:m.id};
  });
  return map;
 },[messages,active?.id]);
 useEffect(()=>{sourcesRef.current={...aiSources,...subSourcesRef.current};},[aiSources]);
 const registerSources=useCallback((paneId:string,map:Record<string,SourceMeta>|null)=>{
  if(map)Object.assign(subSourcesRef.current,map);
  else for(const k of Object.keys(subSourcesRef.current))if(k.startsWith("q:"+paneId+":"))delete subSourcesRef.current[k];
  sourcesRef.current={...aiSources,...subSourcesRef.current};
 },[aiSources]);
 const paneTransport:PaneTransport=useMemo(()=>({
  create:async()=>{const created=await liveApi("/ai/sessions","POST");return {id:String(created.id)};},
  send:async(id,request,onStage)=>{onStage("generating");await liveApi("/ai/sessions/"+id+"/messages","POST",{request_id:request.request_id,text:request.message,image:null});},
  load:async(id:string)=>{const d=await liveApi("/ai/sessions/"+id);return (d.messages||[]).map((m:Row)=>({request_id:m.id,message:m.question,response:{answer:m.answer,citations:m.citations||[]}}));},
 }),[]);
 function toggleScissors(paneId:string){setQuoteError("");setQuotingPaneId(cur=>cur===paneId?null:paneId);}
 function exitScissors(){setQuotingPaneId(null);setQuoteError("");}
 function addPieces(paneId:string,incoming:QuotePiece[]){
  setTrays(cur=>{const now=cur[paneId]??[];const byKey=new Map(now.map(x=>[x.key,x]));incoming.forEach(x=>{if(!byKey.has(x.key))byKey.set(x.key,x);});const next=[...byKey.values()];if(next.length>pieceLimit)setQuoteError(`一次最多引用 ${pieceLimit} 处，请先拼接或清理。`);return {...cur,[paneId]:next.slice(0,pieceLimit)};});
 }
 function assemble(parentPaneId:string){
  const pieces=piecesOf(parentPaneId);
  if(!pieces.length)return;
  if(!canAddPane(panes)){setQuoteError(`同时最多保留 ${paneLimit} 个子页面，请先关闭一些。`);return;}
  if(pieces.reduce((n,x)=>n+x.source.length,0)>9000){setQuoteError("摘下的片段过长，请减少或缩短后再拼接。");return;}
  const parent=panes.some(x=>x.id===parentPaneId)?parentPaneId:"main";
  const pane:PaneState={id:newPaneId(),parentId:parent,attemptId:null,quotes:pieces.slice(),question:"",weight:1,state:"open",pinned:false,createdAt:Date.now()};
  setPanes(prev=>{const next=[...prev];next.splice(subtreeEnd(prev,parent),0,pane);return next;});
  setPiecesOf(parentPaneId,[]);exitScissors();
 }
 function closePane(id:string){
  const kids=descendantIds(panes,id);
  if(kids.length&&!window.confirm(`关闭将同时关闭其下 ${kids.length} 个子页面，继续？`))return;
  setPanes(prev=>prev.filter(x=>x.id!==id&&!kids.includes(x.id)));
  setTrays(cur=>{const copy={...cur};[id,...kids].forEach(x=>delete copy[x]);return copy;});
 }
 function bindAttempt(paneId:string,attemptId:string,question:string){setPanes(prev=>prev.map(x=>x.id===paneId?{...x,attemptId,question}:x));}
 function removePaneQuote(paneId:string,pieceId:string){setPanes(prev=>prev.map(x=>x.id===paneId?{...x,quotes:x.quotes.filter(q=>q.id!==pieceId)}:x));}
 async function copyPieces(paneId:string){const pieces=piecesOf(paneId);try{await navigator.clipboard.writeText(pieces.map(x=>x.source).join("\n\n---\n\n"));setQuoteError(`已复制 ${pieces.length} 处`);setTimeout(()=>setQuoteError(""),1600);}catch{setQuoteError("复制失败，请手动选择文字。");}}
 function locatePiece(piece:QuotePiece){
  const container=piece.paneId==="main"?document.querySelector<HTMLElement>(".aiMessages"):document.querySelector<HTMLElement>(`[data-pane-id="${piece.paneId}"] .chatPaneScroll`);
  if(!container)return;
  const target=[...container.querySelectorAll<HTMLElement>("[data-quote-unit]")].find(el=>quoteKeyOf(el)===piece.key);
  if(!target)return;
  target.scrollIntoView({block:"center",behavior:"smooth"});
  target.classList.add("quoteFlash");setTimeout(()=>target.classList.remove("quoteFlash"),1600);
 }
 function resizePanes(patch:Record<string,number>){setPanes(prev=>prev.map(x=>patch[x.id]!==undefined?{...x,weight:patch[x.id]}:x));if(patch.main!==undefined)setMainWeight(patch.main);}
 function movePane(id:string,insertIndex:number){setPanes(prev=>reorderPane(prev,id,insertIndex));}
 function collapsePanes(ids:string[]){if(!ids.length)return;setPanes(prev=>collapseWithSubtree(prev,ids));}
 function collapseOnePane(id:string){setPanes(prev=>prev.map(x=>x.id===id?{...x,state:"tab",pinned:false}:x));}
 function pinPane(id:string){setPanes(prev=>prev.map(x=>x.id===id?{...x,state:"open",pinned:true}:x));}
 function quoteUi():QuoteUi{
  return {piecesOf,setPieces:setPiecesOf,quotingPaneId,error:quoteError,busy,onToggle:toggleScissors,onAssemble:assemble,onCopy:paneId=>void copyPieces(paneId),onClear:paneId=>setPiecesOf(paneId,[]),onExit:exitScissors,onAddPieces:addPieces,onSent:()=>{},onRemoveQuote:removePaneQuote,onLocate:locatePiece};
 }
 // 参阅区（与课程页同一套，文件只在本地打开）
 const [materials,setMaterials]=useState<MaterialPane[]>([]);
 const [dropping,setDropping]=useState(false);
 const [dropZone,setDropZone]=useState<"ask"|"board"|null>(null);
 const [boardWidth,setBoardWidth]=useState(360);
 const materialsRef=useRef<MaterialPane[]>([]);materialsRef.current=materials;
 useEffect(()=>()=>{materialsRef.current.forEach(releaseMaterial);},[]);
 async function addFiles(files:FileList|File[]){
  const room=materialLimit()-materials.length;
  if(room<=0){setError(`参阅区最多停靠 ${materialLimit()} 个页面，请先关闭一些。`);return;}
  const list=Array.from(files).slice(0,room);const paneList:MaterialPane[]=[];
  for(const file of list){const input=inputFromFile(file);if(input.kind==="text"){try{input.source=await file.text();}catch{input.source="（读取失败）";}}paneList.push(newMaterialPane(input,materials.length+paneList.length));}
  setMaterials(cur=>[...cur,...paneList]);
 }
 function addUrl(value:string){
  const url=urlOf(value);
  if(!url){setError("请粘贴以 http:// 或 https:// 开头的网址。");return;}
  if(materials.length>=materialLimit()){setError(`参阅区最多停靠 ${materialLimit()} 个页面，请先关闭一些。`);return;}
  setMaterials(cur=>[...cur,newMaterialPane({kind:"url",title:url.replace(/^https?:\/\//,"").replace(/\/$/,""),source:url},cur.length)]);
 }
 function closeMaterial(id:string){setMaterials(cur=>{const pane=cur.find(x=>x.id===id);if(pane)releaseMaterial(pane);return cur.filter(x=>x.id!==id);});}
 function moveMaterial(id:string,delta:number){setMaterials(cur=>{const i=cur.findIndex(x=>x.id===id),j=i+delta;if(i<0||j<0||j>=cur.length)return cur;const next=[...cur];[next[i],next[j]]=[next[j],next[i]];return next;});}
 function clearMaterials(){setMaterials(cur=>{cur.forEach(releaseMaterial);return [];});}
 function zoneOf(x:number){return x>=window.innerWidth*2/3?"board":"ask";}
 function onDragOver(e:React.DragEvent){
  const types=e.dataTransfer?.types||[];
  if(!Array.from(types).includes("Files")&&!Array.from(types).some(x=>x==="text/uri-list"||x==="text/plain"))return;
  e.preventDefault();e.dataTransfer.dropEffect="copy";
  const zone=zoneOf(e.clientX);if(!dropping)setDropping(true);if(dropZone!==zone)setDropZone(zone);
 }
 function onDragLeave(e:React.DragEvent){if(e.currentTarget.contains(e.relatedTarget as Node))return;setDropping(false);setDropZone(null);}
 function onDrop(e:React.DragEvent){
  e.preventDefault();const zone=zoneOf(e.clientX);setDropping(false);setDropZone(null);
  const files=e.dataTransfer?.files;
  if(!files?.length){const url=e.dataTransfer.getData("text/uri-list")||e.dataTransfer.getData("text/plain");if(url)addUrl(url);return;}
  if(zone==="board")void addFiles(files);else void attachToQuestion(files);
 }
 async function attachToQuestion(files:FileList|File[]){
  const list=Array.from(files);let appended="";
  for(const file of list){
   if(isTextFile(file)){let text="";try{text=await file.text();}catch{text="";}appended+=`\n\n【文件：${file.name}】\n${text.slice(0,4000)}`;}
   else if(isImageFile(file)){try{const dataUrl=await fileToDataUrl(file);const result=await liveApi("/recognize","POST",{data_url:dataUrl});appended+=`\n\n【图片识别：${file.name}】\n${(result?.text||"").slice(0,4000)}`;}catch{setError(`${file.name} 识别失败，可以先存成图片再拖进来。`);return;}}
   else{setError(`暂不支持把 ${file.name} 作为提问附件（浏览器无法读取该格式正文）。拖到右侧可并排参阅。`);return;}
  }
  if(!appended)return;
  setText(cur=>cur+appended);setError("");window.setTimeout(()=>aiInput.current?.focus(),0);
 }
 function startBoardResize(e:React.PointerEvent){
  e.preventDefault();const startX=e.clientX,width=boardWidth;
  const move=(ev:PointerEvent)=>setBoardWidth(Math.min(760,Math.max(280,width-(ev.clientX-startX))));
  const up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);};
  window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);
 }

 // 自己动手改/建笔记：同样落在新的笔记库（科目=AI 教学）
 const noteEditor=draft&&<section className="aiNoteEditor" aria-label="编辑笔记"><h2>{draft.id?"编辑笔记":"新建笔记"}</h2><input aria-label="笔记标题" maxLength={200} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/><textarea aria-label="笔记内容" rows={10} maxLength={60000} value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})}/><div className="aiActions"><button disabled={busy||!draft.title.trim()} onClick={()=>void run(async()=>{const body={title:draft.title,content:draft.content||"",course_id:"ai_literacy",folder_path:draft.folder_path||"",kind:"md",source:"student"};if(draft.id)await liveApi("/notes/"+draft.id,"PATCH",body);else await liveApi("/notes","POST",body);const list=await liveApi("/notes?course_id=ai_literacy");setNotes(list.items||[]);setDraft(null);setNotice("笔记已保存");})}>确认保存</button><button disabled={busy} onClick={()=>setDraft(null)}>取消</button></div></section>;
 return <div className={"aiLearning"+(tab===""?" lmAIChat":"")} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
 {dropping&&<div className={"dropOverlay"+(dropZone?" is"+dropZone:"")} aria-hidden="true">
  <div className="dropZone dropZoneAsk"><StudentIcon name="file"/><strong>上传文件 · 向 AI 提问</strong><span>文本/Markdown 直接读入输入框；图片先识别成文字再提问</span></div>
  <div className="dropZoneLine" aria-hidden="true"/>
  <div className="dropZone dropZoneBoard"><StudentIcon name="library"/><strong>并排参阅 · 不参与提问</strong><span>作为参阅页停在右侧，只看不聊（文件不出本机）</span></div>
 </div>}
 <div className="pageHeading"><div><h1>AI 学习</h1>{tab===""&&<p>{courseIntro("ai")} · 独立知识问答</p>}</div>{tab===""&&<button aria-label="打开AI对话列表" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(!historyOpen)}><StudentIcon name="menu"/>历史对话</button>}</div>
 {/* 笔记入口直接指向新的笔记库，不再在 AI 页另起一套 */}
 <nav className="aiEntrances" aria-label="AI 学习导航">{tabs.map(([key,title])=><Link key={key} className="aiEntrance" href={key==="notes"?"/student/notes":"/student/ai"+(key?"/"+key:"")} aria-current={key===tab?"page":undefined}><span className="aiEntranceMark"><StudentIcon name={(entranceMeta[key]||["spark",""])[0]}/></span><span className="aiEntranceBody"><strong>{title}</strong><span>{(entranceMeta[key]||["",""])[1]}</span></span></Link>)}</nav>
 {error&&<p role="alert" className="portalError">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {tab===""&&<div className="aiChatLayout"><aside className={"aiHistory"+(historyOpen?" isOpen":"")}><button disabled={busy} onClick={()=>{setHistoryOpen(false);setActive(null);setMessages([]);pending.current=null;setText("");setPicture("");}}>新对话</button>{sessions.map(s=><div className="aiHistoryRow" key={s.id}><button disabled={busy} aria-pressed={active?.id===s.id} onClick={()=>run(async()=>{const d=await liveApi("/ai/sessions/"+s.id);setHistoryOpen(false);setActive(d);setMessages(d.messages);pending.current=null;setText("");setPicture("");})}>{s.title}</button><button title="删除对话" aria-label={"删除对话 "+s.title} disabled={busy} onClick={()=>{if(window.confirm("删除这段对话？已保存的笔记会保留。"))void run(async()=>{await liveApi("/ai/sessions/"+s.id,"DELETE");setSessions(await liveApi("/ai/sessions"));if(active?.id===s.id){setActive(null);setMessages([]);}});}}>×</button></div>)}</aside>
 <QuotePanes panes={panes} quote={quoteUi()} board={materials.length>0?<>
   <div className="paneResizer" role="separator" aria-orientation="vertical" aria-label="调整参阅区宽度" onPointerDown={startBoardResize}/>
   <div className="materialSlot" style={{flexBasis:boardWidth}}>
    <MaterialBoard panes={materials} onClose={closeMaterial} onHeight={(id,h)=>setMaterials(cur=>cur.map(x=>x.id===id?{...x,height:h}:x))} onMove={moveMaterial} onClear={clearMaterials}/>
   </div>
 </>:null} dropping={dropping} transport={paneTransport} user={{status:"active"}} sourcesRef={sourcesRef} mainWeight={mainWeight} layout={{onWeights:resizePanes,onReorder:movePane,onCollapse:collapsePanes,onCollapseOne:collapseOnePane,onPin:pinPane}} onClose={closePane} onBindAttempt={bindAttempt} onSources={registerSources}>
 <section className="aiChat" aria-label="AI 知识问答"><header className="aiChatHead"><span className="aiChatChip">AI 学习助手</span><span className="aiChatHint">独立知识问答 · 不参与能力评估</span><NoteModeToggle on={noteMode} disabled={busy} toggle={()=>setNoteMode(v=>!v)}/><button type="button" disabled={busy} onClick={()=>{setHistoryOpen(false);setActive(null);setMessages([]);pending.current=null;setText("");setPicture("");}}>新对话</button></header><div className="aiMessages" aria-live="polite" ref={aiMessagesRef}>
 {!messages.length&&!busy&&<div className="aiEmpty"><h2>从一个问题开始</h2><p>{courseIntro("ai")}</p><div className="aiPromptList">{coursePrompts.ai.map(p=><button key={p.title} title={p.question} onClick={()=>{setText(p.question);aiInput.current?.focus();}}>{p.title}</button>)}</div></div>}
 {messages.map(m=><article key={m.id}><div className="lmAIMessage lmAIMe"><span className="lmAIAvatar"><StudentIcon name="person"/></span><div className="lmAIMessageBody"><div className="lmAIName">我</div><div className="aiQuestion" data-quote-src={"m:"+m.id+":user"}><Markdown text={stripNoteMarker(m.question)}/>{m.has_image&&<span>附图已分析（原图不保存）</span>}</div></div></div><div className="lmAIMessage"><span className="lmAIAvatar lmAIBot"><StudentIcon name="spark"/></span><div className="lmAIMessageBody"><div className="lmAIName">AI 学习助手</div><div className="aiAnswer" data-quote-src={"m:"+m.id+":ai"}><Markdown text={m.answer}/>{m.citations.length>0&&<details><summary>教材依据</summary>{m.citations.map((c:Row,i:number)=><p key={c.id}>[{i+1}] {c.title} · PDF 第 {c.pdf_page} 页 · {c.heading}</p>)}</details>}<button disabled={busy} onClick={()=>noteFrom(m)}>整理为笔记</button></div></div></div></article>)}
 {busy&&<p role="status">正在处理…</p>}{quotingPaneId==="main"&&<QuoteHud count={piecesOf("main").length} limit={pieceLimit} error={quoteError} canAssemble={piecesOf("main").length>0} onAssemble={()=>assemble("main")} onCopy={()=>void copyPieces("main")} onClear={()=>setPiecesOf("main",[])} onExit={exitScissors}/>}<div ref={bottom}/></div>
 <QuoteSurface paneId="main" active={quotingPaneId==="main"} containerRef={aiMessagesRef} sourcesRef={sourcesRef} pieces={piecesOf("main")} onChange={next=>setPiecesOf("main",next)} onExit={exitScissors}/>
 <QuoteTray pieces={piecesOf("main")} onRemove={id=>setPiecesOf("main",piecesOf("main").filter(x=>x.id!==id))} onLocate={locatePiece} onAssemble={()=>assemble("main")} busy={busy}/>
 <form className="aiComposer" onSubmit={e=>{e.preventDefault();void send();}}>
 {picture&&<div className="aiAttachment"><img src={picture} alt="待发送图片"/><button type="button" onClick={()=>setPicture("")} disabled={busy}>移除图片</button></div>}
 {/* 与课程对话页统一：可混排公式的输入区（公式渲染为排版结果，发送时序列化为数学文本） */}
 <FormulaComposer key="ai-composer" ref={aiInput} value={text} onChange={setText} onSend={()=>void send()} disabled={busy}
  placeholder={noteMode?"笔记模式：可拖入文件、输入 @ 引用笔记，或选中上面的回答后点「存为笔记」":undefined}/>
 <div className="aiActions">
  <ChatToolMenu label="工具库" disabled={busy}>
    <label className="aiFile"><StudentIcon name="file"/>上传图片<input aria-label="上传图片" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void chooseImage(e.target.files?.[0]);e.target.value="";}}/></label>
    <label className="aiFile"><StudentIcon name="camera"/>拍照<input aria-label="拍照" type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>{void chooseImage(e.target.files?.[0]);e.target.value="";}}/></label>
    <label className="chatDocUpload"><StudentIcon name="file"/>{uploading?"上传中…":"选择文件"}<input type="file" multiple accept={DOC_ACCEPT} aria-label="上传文档" disabled={busy||uploading} onChange={e=>{void addDocuments(Array.from(e.target.files||[]));e.target.value="";}}/></label>
    <QuoteToolbar quoting={quotingPaneId==="main"} count={piecesOf("main").length} disabled={busy} onToggle={()=>toggleScissors("main")}/>
    <MaterialToolbar count={materials.length} onPick={files=>void addFiles(files)} onUrl={addUrl} disabled={busy}/>
  </ChatToolMenu>
  <button className="aiPrimary" disabled={busy||!text.trim()} type="submit"><StudentIcon name="send"/>发送</button></div>
 <p className="aiPrivacy">消息及图片会发送至 DeepSeek；图片仅用于本次回答，不保存原图。</p>
 </form></section></QuotePanes></div>}
 {tab==="resources"&&<><form className="aiSearch" onSubmit={e=>{e.preventDefault();void run(async()=>{const found=await liveApi("/ai/search?q="+encodeURIComponent(query));setResults(found);if(!found.length)setNotice("未找到已核对的相关内容");});}}><input aria-label="搜索教材" placeholder="搜索知识点" value={query} maxLength={500} onChange={e=>setQuery(e.target.value)}/><button disabled={busy||!query.trim()}>搜索</button></form><div className="aiGrid">{resources.map(r=><section className="portalPanel" key={r.id}><h2>{r.title}</h2><p>{r.metadata_json.authors||""}</p><p>{r.metadata_json.total_pages} 页 · 已核对 {r.reviewed_pages} 处节选</p></section>)}{!resources.length&&<p>暂无教材</p>}</div>{results.map(r=><section className="portalPanel" key={r.id}><h3>{r.heading||"教材段落"} · PDF 第 {r.page} 页</h3><Markdown text={r.content}/></section>)}<div className="aiGrid"><section className="portalPanel"><h2>例题与习题</h2><p>暂无已核对的题目</p></section><section className="portalPanel"><h2>课程试卷</h2><p>暂无试卷</p></section></div></>}
 {tab==="notes"&&<><div className="aiActions"><button disabled={busy} onClick={()=>setDraft({title:"",content:"",folder_path:""})}>新建笔记</button><Link href="/student/notes">在笔记库中打开</Link></div><div className="aiGrid">{notes.map(n=><article className="portalPanel" key={n.id}><h2>{n.starred?"★ ":""}{n.title}</h2><p>{n.folder_path||"科目根"} · {n.source==="agent"?"AI 整理":"自写"}</p><div className="aiActions"><Link href={"/student/notes?note="+encodeURIComponent(n.id)}>打开</Link><button disabled={busy} onClick={()=>void run(async()=>{const full=await liveApi("/notes/"+n.id);setDraft(full);})}>编辑</button><button disabled={busy} onClick={()=>{if(window.confirm("把这篇笔记移到回收站？30 天内可以还原。"))void run(async()=>{await liveApi("/notes/"+n.id,"DELETE");const list=await liveApi("/notes?course_id=ai_literacy");setNotes(list.items||[]);});}}>删除</button></div></article>)}</div>{!notes.length&&<p>还没有笔记。可以从回答里「存为笔记」，也可以自己新建。</p>}</>}
 {tab==="tools"&&<AIToolDirectory/>}
 {tab==="setup"&&<WindowsInstaller/>}
 {noteEditor}
 {organizing&&<NoteOrganizeDialog courses={[{course_id:"ai_literacy",display_name:"AI 教学"}]} onClose={()=>setOrganizing(false)}
   onDone={count=>{setOrganizing(false);void run(async()=>{const list=await liveApi("/notes?course_id=ai_literacy");setNotes(list.items||[]);setNotice(`已移动 ${count} 份笔记`);});}}/>}
 {noteTarget&&<NoteSaveCard target={noteTarget} courses={[{course_id:"ai_literacy",display_name:"AI 教学"}]} onClose={()=>setNoteTarget(null)}
   onSaved={()=>void run(async()=>{const list=await liveApi("/notes?course_id=ai_literacy");setNotes(list.items||[]);})}/>}
 {notePanel&&<NotePreferencePanel courseId="ai_literacy" courses={[{course_id:"ai_literacy",display_name:"AI 教学"}]} preset={notePanel}
   allowedSources={["chat"]} onClose={()=>setNotePanel(null)}
   onComposed={(prompt,marker)=>{noteComposed.current={prompt,marker};setText(prompt);setNotePanel(null);aiInput.current?.focus();}}/>}
 </div>;
}
