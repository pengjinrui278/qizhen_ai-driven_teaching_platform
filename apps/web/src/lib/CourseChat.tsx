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
import FormulaComposer from "./FormulaComposer";
import ChatMarkdown,{messageSource} from "./ChatMarkdown";
import QuoteSurface from "./QuoteSurface";
import QuotePanes from "./QuotePanes";
import type {QuoteUi} from "./QuotePanes";
import QuoteTray,{QuoteHud,QuoteToolbar} from "./QuoteTray";
import {buildTurnLabel,collectUnitsWithin,quoteKeyOf} from "./chat-quote.mjs";
import {canAddPane,clearWorkspace,descendantIds,holdPiece,loadWorkspace,newPaneId,paneLimit,pieceLimit,saveWorkspace,subtreeEnd} from "./quote-store";
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
 const lock=useRef(false),epoch=useRef(0),bottom=useRef<HTMLDivElement>(null),input=useRef<HTMLDivElement>(null);
 const [historyLoading,setHistoryLoading]=useState(true),[historyError,setHistoryError]=useState("");
 const [failedSession,setFailedSession]=useState<Row|null>(null);
 const historyPanel=useRef<HTMLElement>(null),historyToggle=useRef<HTMLButtonElement>(null);
 const [actionId,setActionId]=useState<string|null>(null);
 const actionTimer=useRef<ReturnType<typeof setTimeout>|null>(null),historyEpoch=useRef(0);
 const workspace=useRef<HTMLElement>(null),followBottom=useRef(true);
 const pendingRef=useRef<Row|null>(null);
 const streamAbort=useRef<AbortController|null>(null);
 function leaveRequest(){epoch.current++;streamAbort.current?.abort();streamAbort.current=null;lock.current=false;setBusy(false);setStage("" );}
 const [historyEnd,setHistoryEnd]=useState(false);
 const [historyCollapsed,setHistoryCollapsed]=useState(false);
 // 剪刀：引用片段 → 拼接 → 并行子页面。状态与持久化都集中在这里，不改既有会话逻辑。
 const [quotingPaneId,setQuotingPaneId]=useState<string|null>(null);
 const [pieces,setPieces]=useState<QuotePiece[]>([]);
 const [panes,setPanes]=useState<PaneState[]>([]);
 const [quoteError,setQuoteError]=useState("");
 const paneSeq=useRef(0);
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
  setQuotingPaneId(null);setPieces([]);setQuoteError("");
  if(!active?.id){setPanes([]);return;}
  const stored=loadWorkspace(user.id,active.id);
  if(stored){setPanes(stored.panes);paneSeq.current=stored.seq;}
  else{setPanes([]);}
 },[active?.id,user.id]);
 useEffect(()=>{ // 持久化 pane 树、追问链路与剪贴片段；会话未建立时不写
  if(!user?.id||!active?.id)return;
  saveWorkspace({v:1,userId:user.id,mainAttemptId:active.id,course,panes,seq:paneSeq.current,updatedAt:Date.now()});
 },[panes,user?.id,active?.id,course]);
 function toggleScissors(paneId:string){setQuoteError("");setQuotingPaneId(cur=>cur===paneId?null:paneId);}
 function exitScissors(){setQuotingPaneId(null);setQuoteError("");}
 function addPieces(incoming:QuotePiece[]){
  setPieces(cur=>{
   const byKey=new Map(cur.map(p=>[p.key,p]));
   incoming.forEach(p=>{if(!byKey.has(p.key))byKey.set(p.key,p);});
   const next=[...byKey.values()];
   if(next.length>pieceLimit)setQuoteError(`一次最多引用 ${pieceLimit} 处，请先拼接或清理。`);
   return next.slice(0,pieceLimit);
  });
 }
 function assemble(parentPaneId:string){
  if(!pieces.length)return;
  if(!canAddPane(panes)){setQuoteError(`同时最多保留 ${paneLimit} 个子页面，请先关闭一些。`);return;}
  if(pieces.reduce((n,p)=>n+p.source.length,0)>9000){setQuoteError("剪下的片段过长，请减少或缩短后再拼接。");return;}
  const parent=panes.some(p=>p.id===parentPaneId)?parentPaneId:"main";
  const pane:PaneState={id:newPaneId(),parentId:parent,title:"子页面 "+(paneSeq.current+1),attemptId:null,quotes:pieces.slice(),question:"",weight:1,state:"open",pinned:false,createdAt:Date.now()};
  paneSeq.current+=1;
  setPanes(prev=>{const next=[...prev];next.splice(subtreeEnd(prev,parent),0,pane);return next;});
  setPieces([]);exitScissors();
 }
 function closePane(id:string){
  const kids=descendantIds(panes,id);
  if(kids.length&&!window.confirm(`关闭将同时关闭其下 ${kids.length} 个子页面，继续？`))return;
  setPanes(prev=>prev.filter(p=>p.id!==id&&!kids.includes(p.id)));
 }
 function bindAttempt(paneId:string,attemptId:string,question:string){setPanes(prev=>prev.map(p=>p.id===paneId?{...p,attemptId,question}:p));}
 function removePaneQuote(paneId:string,pieceId:string){setPanes(prev=>prev.map(p=>p.id===paneId?{...p,quotes:p.quotes.filter(q=>q.id!==pieceId)}:p));}
 async function copyPieces(){try{await navigator.clipboard.writeText(pieces.map(p=>p.source).join("\n\n---\n\n"));setQuoteError(`已复制 ${pieces.length} 处`);setTimeout(()=>setQuoteError(""),1600);}catch{setQuoteError("复制失败，请手动选择文字。");}}
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
  if(found.length)addPieces(found as QuotePiece[]);
 }
 function quoteUi():QuoteUi{
  return {pieces,quotingPaneId,error:quoteError,canAssemble:pieces.length>0,busy:busy||loading,onToggle:toggleScissors,onAssemble:assemble,onCopy:()=>void copyPieces(),onClear:()=>setPieces([]),onExit:exitScissors,onAddPieces:addPieces,setPieces,onSent:()=>void loadHistory(),onRemoveQuote:removePaneQuote,onLocate:locatePiece};
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
 async function send(retry=false,mode="chat"){
  if(lock.current||loading||user.status!=="active")return;
  const msg=mode==="chat"?draft.trim():(mode==="first_hint"?"我卡住了，请给我一个方向提示":mode==="next_hint"?"还是不太懂，请再深入一点":mode==="full_solution"?"请梳理大致解题流程、主要步骤、条件检查和验证方法，保留核心计算或论证让我完成":draft.trim());
  const request=retry?pendingRef.current:{request_id:crypto.randomUUID(),mode,message:msg};
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
 return <section className={"courseChat lmCourseChat"+(showRelated?" hasRelated":"")+(historyCollapsed?" historyCollapsed":"")}>
 {historyOpen&&<button className="chatDrawerOverlay" aria-label="关闭历史对话遮罩" onClick={()=>setHistoryOpen(false)}/> }
 <aside ref={historyPanel} aria-label="历史对话" onKeyDown={e=>{if(e.key==="Escape"){setHistoryOpen(false);historyToggle.current?.focus();}}} className={"chatHistory "+(historyOpen?"isOpen":"")}><div className="chatSidebarHead"><strong>课程学习</strong><button aria-label={historyCollapsed?"展开左栏":"收起左栏"} onClick={()=>{if(window.matchMedia("(min-width:1024px)").matches)setHistoryCollapsed(!historyCollapsed);else setHistoryOpen(false);}}><StudentIcon name="menu"/></button></div><label>课程<select aria-label="聊天课程" disabled={loading} value={course} onChange={e=>clear(e.target.value)}>{courses.map(c=><option key={c.course_id} value={c.course_id}>{c.display_name}</option>)}</select></label>{!active&&<details><summary>关联作业</summary><select aria-label="关联作业" disabled={busy||loading} value={assignment} onChange={e=>setAssignment(e.target.value)}><option value="">私人学习</option>{sandboxes.filter(s=>s.course_id===course&&s.status==="open").map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></details>}<h2>最近对话</h2>{historyLoading&&<p role="status">正在加载历史…</p>}{historyError&&<p role="alert">历史加载失败：{historyError}<button onClick={()=>void retryHistory()}>重新加载历史</button></p>}<div className="chatSessionList"><ChatHistoryList sessions={sessions.filter(s=>s.course_id===course)} activeId={active?.id} onOpen={a=>void resume(a)}/>{!historyLoading&&!historyError&&!sessions.some(s=>s.course_id===course)&&<p>暂无对话</p>}</div>{sessions.length>=100&&!historyEnd&&<button disabled={historyLoading} onClick={()=>void loadOlder()}>加载更早的对话</button>}</aside>
 <QuotePanes panes={panes} quote={quoteUi()} api={api} user={user} streaming={streaming} course={course} sourcesRef={sourcesRef} onClose={closePane} onBindAttempt={bindAttempt} onSources={registerSources} onRemoveQuote={removePaneQuote}>
 <section className="chatWorkspace" ref={workspace} data-quoting={quotingPaneId==="main"?"":undefined} onScroll={()=>{const el=workspace.current;if(el)followBottom.current=el.scrollHeight-el.clientHeight-el.scrollTop<60;}}><header className="chatHeader"><button ref={historyToggle} className="chatSidebarLauncher" aria-label="打开对话列表" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(true)}><StudentIcon name="menu"/></button><span className="chatCourseName">{name}</span><QuoteToolbar quoting={quotingPaneId==="main"} count={pieces.length} disabled={busy||loading} onToggle={()=>toggleScissors("main")}/><button onClick={()=>clear()}>新对话</button></header>
 <div className="chatMessages" role="log" aria-label="课程对话" aria-live="polite">
 {!active&&!pending&&<div className="chatWelcome"><div className="welcomeIcon">{courseSymbol[course]||"∑"}</div><h2>你好，我是{name} Course Mirror</h2><p>{courseIntro(course)}</p><div className="suggestionRow">{suggestionList.map(s=><button key={s.title} title={s.question} type="button" disabled={busy||loading} onClick={()=>{setDraft(s.question);input.current?.focus();}}>{s.title}</button>)}</div></div>}
 {loading&&<p role="status">正在打开对话…</p>}
 {active&&(!pending||pending.message!==active.problem.text)&&(events.length===0||!isInitial(events[0],0))&&<div className="lmMessageRow lmMessageMe"><span className="lmMessageAvatar"><StudentIcon name="person"/></span><div className="lmMessageBody"><div className="lmMessageName">我</div><article className="chatUser"><MessageText text={active.problem.text||"课程问题"}/></article></div></div>}
 {active&&!loading&&events.length===0&&!busy&&<p role="status">这段对话尚无已完成的回答。原问题已保留在下方，可直接发送继续。</p>}
 {events.map((e,i)=><div className="chatExchange" id={"turn-"+e.request_id} key={e.request_id}><div className="lmMessageRow lmMessageMe"><span className="lmMessageAvatar"><StudentIcon name="person"/></span><div className="lmMessageBody"><div className="lmMessageName">我</div><article className="chatUser" data-quote-src={"e:"+e.request_id+":user"}><MessageText text={e.message||active?.problem?.text||"继续"}/></article></div></div><div className="lmMessageRow"><span className="lmMessageAvatar lmMessageAI"><StudentIcon name="spark"/></span><div className="lmMessageBody"><div className="lmMessageName">Course Mirror · {name}</div><article className="chatAssistant" data-quote-src={"e:"+e.request_id+":ai"}>{e.response?.hint_level&&<div className="hintTag">{e.response?.decision?.hint_scale_version==="course-hints-v1-three" ? `提示 ${e.response.hint_level}/3` : `历史提示级别 ${e.response.hint_level}（量表未转换）`}</div>}<MessageText text={e.response.answer}/><div className="chatMessageTools"><button onClick={async()=>{try{await navigator.clipboard.writeText(e.response.answer);setCopied(e.request_id);}catch{setError("复制失败，请手动选择文字。");}}}>{copied===e.request_id?"✓ 已复制":"复制"}</button><button onClick={()=>quoteAnswer(e.request_id)}>引用此回答</button>{e.response.citations?.length>0&&<details><summary>资料来源</summary>{e.response.citations.map((c:Row,j:number)=><p key={j}>{c.locator||c.source_id}</p>)}</details>}</div>{actionId===e.request_id&&!busy&&!loading&&<div className="hintButtons" aria-label="继续学习"><button className="hintBtn" disabled={user.status!=="active"} onClick={()=>send(false,"first_hint")}>我卡住了</button><button className="hintBtn" disabled={user.status!=="active"} onClick={()=>send(false,"next_hint")}>再深入一点</button><button className="hintBtn" disabled={user.status!=="active"} onClick={()=>send(false,"full_solution")}>梳理解题框架</button></div>}</article></div></div></div>)}
 {pending&&<div className="lmMessageRow lmMessageMe"><span className="lmMessageAvatar"><StudentIcon name="person"/></span><div className="lmMessageBody"><div className="lmMessageName">我</div><article className="chatUser"><MessageText text={pending.message}/></article></div></div>}
 {busy&&<p className="chatThinking" role="status">{({queued:"正在准备…",retrieving:"寻知 · 正在查找教材…",generating:"答疑 · 正在思考…",checking:"正在核对回答…"} as Row)[stage]||"正在思考…"}</p>}{quotingPaneId==="main"&&<QuoteHud count={pieces.length} limit={pieceLimit} error={quoteError} canAssemble={pieces.length>0} onAssemble={()=>assemble("main")} onCopy={()=>void copyPieces()} onClear={()=>setPieces([])} onExit={exitScissors}/>}<div ref={bottom}/></div>
 {error&&<div className="chatError" role="alert">{error}{failedSession&&!loading&&<button onClick={()=>void resume(failedSession)}>重新打开对话</button>}{pending&&!busy&&<button onClick={()=>send(true)}>重试</button>}</div>}
 <QuoteTray pieces={pieces} onRemove={id=>setPieces(cur=>cur.filter(p=>p.id!==id))} onLocate={locatePiece} onAssemble={()=>assemble("main")} busy={busy}/>
 <form className="chatComposer" key="composer" onSubmit={e=>{e.preventDefault();void send();}}>
 <FormulaComposer key={photoEpoch} ref={input} value={draft} onChange={setDraft} onSend={()=>void send()} disabled={busy||loading||user.status!=="active"||quotingPaneId==="main"}/>
 <div className="chatComposerActions"><details className="chatAttachments"><summary><StudentIcon name="camera"/>图片</summary><PhotoInput key={photoEpoch} disabled={busy||loading||user.status!=="active"} recognize={data=>api("/recognize","POST",{data_url:data})} onText={handleRecognizedText}/></details><button className="primary" type="submit" disabled={busy||loading||!draft.trim()||user.status!=="active"}><StudentIcon name="send"/>{busy?"思考中":"发送"}</button></div>
 </form>
 {events.length>0&&<details><summary>补充学习反馈</summary><label>反馈环节<select value={theme} onChange={e=>setTheme(e.target.value)}><option value="conditions">定理条件</option><option value="quantifiers">量词与依赖</option><option value="construction">辅助对象</option></select></label><button disabled={busy} onClick={()=>report("still_stuck")}>仍有困难</button><button disabled={busy} onClick={()=>report("independent_success")}>这次独立完成</button>{feedback&&<p role="status">{feedback}</p>}</details>}
 </section>
 <QuoteSurface active={quotingPaneId==="main"} containerRef={workspace} sourcesRef={sourcesRef} pieces={pieces} onChange={setPieces} onExit={exitScissors}/>
 </QuotePanes>
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
