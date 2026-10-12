"use client";
import {useEffect,useRef,useState} from "react";
import type {ReactNode} from "react";
import ChatMarkdown,{messageSource} from "./ChatMarkdown";
import FormulaComposer from "./FormulaComposer";
import StudentIcon from "./StudentIcon";
import QuoteSurface from "./QuoteSurface";
import {QuoteCard,QuoteHud,QuoteToolbar} from "./QuoteTray";
import {buildTurnLabel,collectUnitsWithin,serializeFollowUp} from "./chat-quote.mjs";
import {holdPiece} from "./quote-store";
import type {PaneState,QuotePiece} from "./quote-store";
import {streamCourseMessage} from "./course-stream";
import "./chat-quote.css";

type Row=Record<string,any>;
type Api=(path:string,method?:string,body?:any)=>Promise<any>;
type SourceMeta={source:string;label:string;paneId:string;attemptId?:string|null;requestId:string};
type Sources=Record<string,SourceMeta>;
const MESSAGE_LIMIT=12000;

export type QuoteUi={
 pieces:QuotePiece[];
 quotingPaneId:string|null;
 error:string;
 canAssemble:boolean;
 busy:boolean;
 onToggle:(paneId:string)=>void;
 onAssemble:(parentPaneId:string)=>void;
 onCopy:()=>void;
 onClear:()=>void;
 onExit:()=>void;
 onAddPieces:(pieces:QuotePiece[])=>void;
 setPieces:(pieces:QuotePiece[])=>void;
 onSent:()=>void;
 onRemoveQuote:(paneId:string,pieceId:string)=>void;
 onLocate:(piece:QuotePiece)=>void;
};

function paneSources(pane:PaneState,events:Row[]):Sources{
 const map:Sources={};
 events.forEach((e:Row,i:number)=>{
  const label=buildTurnLabel(pane.title,i+1);
  if(e.message)map["q:"+pane.id+":"+e.request_id+":user"]={source:messageSource(e.message),label:label+"（提问）",paneId:pane.id,attemptId:pane.attemptId,requestId:e.request_id};
  if(e.response?.answer)map["q:"+pane.id+":"+e.request_id+":ai"]={source:messageSource(e.response.answer),label,paneId:pane.id,attemptId:pane.attemptId,requestId:e.request_id};
 });
 return map;
}

// 子页面：一条独立会话（引用卡片 + 针对性追问），自身管理 attempt/流式/重试，回答可再被剪刀引用
function SubChatPane({pane,index,course,api,user,streaming,quote,sourcesRef,onClose,onBindAttempt,onSources}:{
 pane:PaneState;index:number;course:string;api:Api;user:Row;streaming:boolean;quote:QuoteUi;
 sourcesRef:React.RefObject<Sources>;
 onClose:(id:string)=>void;onBindAttempt:(paneId:string,attemptId:string,question:string)=>void;onSources:(paneId:string,sources:Sources|null)=>void;
}){
 const [events,setEvents]=useState<Row[]>([]);
 const [draft,setDraft]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(Boolean(pane.attemptId)),[stage,setStage]=useState(""),[error,setError]=useState(""),[missing,setMissing]=useState(false);
 const lock=useRef(false),epoch=useRef(0),abort=useRef<AbortController|null>(null),bottom=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),input=useRef<HTMLDivElement>(null);
 const pending=useRef<Row|null>(null),loaded=useRef<string|null>(null);

 useEffect(()=>()=>{epoch.current++;abort.current?.abort();},[]);
 useEffect(()=>{
  if(!pane.attemptId||loaded.current===pane.attemptId)return;
  loaded.current=pane.attemptId;let live=true;
  api("/attempts/"+pane.attemptId).then(d=>{if(live)setEvents(d.events||[]);})
   .catch(()=>{if(live)setMissing(true);})
   .finally(()=>{if(live)setLoading(false);});
  return ()=>{live=false;};
 },[pane.attemptId,api]);
 useEffect(()=>{
  onSources(pane.id,paneSources(pane,events));
  return ()=>onSources(pane.id,null);
 },[events,pane.id,pane.title,pane.attemptId]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{bottom.current?.scrollIntoView({block:"nearest"});},[events,busy]);

 async function send(retry=false){
  if(lock.current||loading||user.status!=="active")return;
  const question=draft.trim();
  const request=retry&&pending.current?pending.current:{request_id:crypto.randomUUID(),mode:"chat",message:question?serializeFollowUp(pane.quotes,question):""};
  if(!request.message)return;
  if(request.message.length>MESSAGE_LIMIT){setError("引用片段与问题合计过长，请减少片段后重试。");return;}
  lock.current=true;setBusy(true);setError("");setDraft("");pending.current=request;
  const token=epoch.current;
  try{
   let aid=pane.attemptId;
   if(!aid){
    const created=await api("/attempts","POST",{course_id:course,text:request.message,sandbox_id:null});
    if(token!==epoch.current)return;
    aid=String(created.id);loaded.current=aid;onBindAttempt(pane.id,aid,question);
   }
   setStage("queued");
   if(streaming){abort.current=new AbortController();await streamCourseMessage(aid!,request,v=>{if(token===epoch.current)setStage(v);},abort.current.signal);}
   else await api("/attempts/"+aid+"/messages","POST",request);
   const detail=await api("/attempts/"+aid);
   if(token!==epoch.current)return;
   setEvents(detail.events||[]);pending.current=null;quote.onSent();
  }catch(e){if(token===epoch.current)setError((e as Error).message);}
  finally{if(token===epoch.current){lock.current=false;setBusy(false);setStage("");}}
 }
 return <section className="chatPane" data-pane-id={pane.id} data-pane-index={index} aria-label={pane.title}>
  <header className="chatPaneHead">
   <span className="chatPaneTitle">{pane.title}</span>
   <QuoteToolbar quoting={quote.quotingPaneId===pane.id} count={quote.pieces.length} disabled={busy||loading||quote.busy} onToggle={()=>quote.onToggle(pane.id)}/>
   <button type="button" className="chatPaneClose" aria-label={"关闭 "+pane.title} onClick={()=>onClose(pane.id)}><StudentIcon name="close"/></button>
  </header>
  <div className="chatPaneScroll" ref={scroll}>
   {missing&&<p className="chatPaneMissing" role="alert">该子页面已失效（会话可能已被删除）。<button type="button" onClick={()=>onClose(pane.id)}>关闭</button></p>}
   {loading&&<p role="status">正在打开子页面…</p>}
   {!loading&&!missing&&pane.quotes.length>0&&<ul className="quoteCardList">{pane.quotes.map((p,i)=><li key={p.id}><QuoteCard piece={p} index={i+1} onRemove={events.length?undefined:(id)=>quote.onRemoveQuote(pane.id,id)} onLocate={quote.onLocate}/></li>)}</ul>}
   {events.map((e:Row,i:number)=><div className="chatExchange" key={e.request_id}>
    <div className="lmMessageRow lmMessageMe"><span className="lmMessageAvatar"><StudentIcon name="person"/></span><div className="lmMessageBody"><div className="lmMessageName">我</div><article className="chatUser" data-quote-src={"q:"+pane.id+":"+e.request_id+":user"}><ChatMarkdown text={i===0?(pane.question||"（引用追问）"):(e.message||"")}/></article></div></div>
    <div className="lmMessageRow"><span className="lmMessageAvatar lmMessageAI"><StudentIcon name="spark"/></span><div className="lmMessageBody"><div className="lmMessageName">Course Mirror · {pane.title}</div><article className="chatAssistant" data-quote-src={"q:"+pane.id+":"+e.request_id+":ai"}>
     <ChatMarkdown text={e.response?.answer||""}/>
     <div className="chatMessageTools"><button type="button" onClick={()=>quoteAnswer(e.request_id)}>引用此回答</button></div>
    </article></div></div>
   </div>)}
   {busy&&<p className="chatThinking" role="status">{({queued:"正在准备…",retrieving:"寻知 · 正在查找教材…",generating:"答疑 · 正在思考…",checking:"正在核对回答…"} as Row)[stage]||"正在思考…"}</p>}
   <div ref={bottom}/>
  </div>
  {quote.quotingPaneId===pane.id&&<QuoteHud count={quote.pieces.length} limit={12} error={quote.error} canAssemble={quote.canAssemble} onAssemble={()=>quote.onAssemble(pane.id)} onCopy={quote.onCopy} onClear={quote.onClear} onExit={quote.onExit}/>}
  <QuoteSurface active={quote.quotingPaneId===pane.id} containerRef={scroll} sourcesRef={sourcesRef} pieces={quote.pieces} onChange={quote.setPieces} onExit={quote.onExit}/>
  {error&&<div className="chatError" role="alert">{error}{pending.current&&!busy&&<button type="button" onClick={()=>void send(true)}>重试</button>}</div>}
  <form className="chatComposer" key="composer" onSubmit={e=>{e.preventDefault();void send();}}>
   <FormulaComposer key={pane.id} ref={input} value={draft} onChange={setDraft} onSend={()=>void send()} disabled={busy||loading||quote.quotingPaneId===pane.id||user.status!=="active"}/>
   <div className="chatComposerActions"><span/><button className="primary" type="submit" disabled={busy||loading||!draft.trim()||user.status!=="active"}><StudentIcon name="send"/>{busy?"思考中":"发送"}</button></div>
  </form>
 </section>;

 function quoteAnswer(requestId:string){
  const host=scroll.current?.querySelector<HTMLElement>(`[data-quote-src="q:${pane.id}:${requestId}:ai"]`);
  if(!host)return;
  const found=collectUnitsWithin(host,paneSources(pane,events)).map(p=>({...holdPiece(p),id:crypto.randomUUID()}));
  if(found.length)quote.onAddPieces(found as QuotePiece[]);
 }
}

export default function QuotePanes({panes,quote,children,api,user,streaming,course,sourcesRef,onClose,onBindAttempt,onSources,onRemoveQuote}:{
 panes:PaneState[];
 quote:QuoteUi;
 children:ReactNode;
 api:Api;user:Row;streaming:boolean;course:string;
 sourcesRef:React.RefObject<Sources>;
 onClose:(id:string)=>void;
 onBindAttempt:(paneId:string,attemptId:string,question:string)=>void;
 onSources:(paneId:string,sources:Sources|null)=>void;
 onRemoveQuote:(paneId:string,pieceId:string)=>void;
}){
 return <div className={"chatPanes"+(panes.length?" hasPanes":"")}>
  {children}
  {panes.map((pane,i)=><SubChatPane key={pane.id} pane={pane} index={i+1} course={course} api={api} user={user} streaming={streaming} quote={quote} sourcesRef={sourcesRef} onClose={onClose} onBindAttempt={onBindAttempt} onSources={onSources}/>)}
 </div>;
}
