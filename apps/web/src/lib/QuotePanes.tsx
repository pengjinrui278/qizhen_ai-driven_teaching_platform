"use client";
import {cloneElement,isValidElement,useEffect,useRef,useState} from "react";
import type {ReactElement,ReactNode} from "react";
import ChatMarkdown,{messageSource} from "./ChatMarkdown";
import FormulaComposer from "./FormulaComposer";
import StudentIcon from "./StudentIcon";
import QuoteSurface from "./QuoteSurface";
import {QuoteCard,QuoteHud,QuoteToolbar} from "./QuoteTray";
import {buildTurnLabel,collectUnitsWithin,serializeFollowUp} from "./chat-quote.mjs";
import {descendantIds,holdPiece} from "./quote-store";
import type {PaneState,QuotePiece} from "./quote-store";
import {streamCourseMessage} from "./course-stream";
import "./chat-quote.css";

type Row=Record<string,any>;
type Api=(path:string,method?:string,body?:any)=>Promise<any>;
type SourceMeta={source:string;label:string;paneId:string;attemptId?:string|null;requestId:string};
type Sources=Record<string,SourceMeta>;
const MESSAGE_LIMIT=12000;
const MIN_PANE=340;      // 面板最小宽度（px），自动收纳的判据
const STRIP_GAP=14;
const RESIZER=8;

// 剪贴托盘按面板隔离：每个面板只看到、只拼接自己剪下的片段
export type QuoteUi={
 piecesOf:(paneId:string)=>QuotePiece[];
 setPieces:(paneId:string,next:QuotePiece[])=>void;
 quotingPaneId:string|null;
 error:string;
 busy:boolean;
 onToggle:(paneId:string)=>void;
 onAssemble:(parentPaneId:string)=>void;
 onCopy:(paneId:string)=>void;
 onClear:(paneId:string)=>void;
 onExit:()=>void;
 onAddPieces:(paneId:string,pieces:QuotePiece[])=>void;
 onSent:()=>void;
 onRemoveQuote:(paneId:string,pieceId:string)=>void;
 onLocate:(piece:QuotePiece)=>void;
};

// M2 布局回调：权重拖动、换位、抽页收纳、抽出定格
export type PaneLayout={
 onWeights:(patch:Record<string,number>)=>void;
 onReorder:(id:string,insertIndex:number)=>void;
 onCollapse:(ids:string[])=>void;      // 自动收纳：连同子树一起收
 onCollapseOne:(id:string)=>void;      // 手动收起：只收这一页，按用户意愿
 onPin:(id:string)=>void;
};

// 子页面编号永远等于它在条带里的位置（主页面之后第 1 个就是「子页面 1」）
export const paneTitle=(index:number)=>"子页面 "+index;

function paneSources(pane:PaneState,title:string,events:Row[]):Sources{
 const map:Sources={};
 events.forEach((e:Row,i:number)=>{
  const label=buildTurnLabel(title,i+1);
  if(e.message)map["q:"+pane.id+":"+e.request_id+":user"]={source:messageSource(e.message),label:label+"（提问）",paneId:pane.id,attemptId:pane.attemptId,requestId:e.request_id};
  if(e.response?.answer)map["q:"+pane.id+":"+e.request_id+":ai"]={source:messageSource(e.response.answer),label,paneId:pane.id,attemptId:pane.attemptId,requestId:e.request_id};
 });
 return map;
}

// 子页面：一条独立会话（引用卡片 + 针对性追问），自身管理 attempt/流式/重试，回答可再被剪刀引用
function SubChatPane({pane,index,title,course,api,user,streaming,quote,sourcesRef,layout,dropSide,onClose,onBindAttempt,onSources,onDragStart,onSiblingMove}:{
 pane:PaneState;index:number;title:string;course:string;api:Api;user:Row;streaming:boolean;quote:QuoteUi;
 sourcesRef:React.RefObject<Sources>;layout:PaneLayout;dropSide?:"before"|"after";
 onClose:(id:string)=>void;onBindAttempt:(paneId:string,attemptId:string,question:string)=>void;onSources:(paneId:string,sources:Sources|null)=>void;
 onDragStart:(e:React.PointerEvent,id:string)=>void;
 onSiblingMove:(id:string,dir:-1|1)=>void;
}){
 const [events,setEvents]=useState<Row[]>([]);
 const [draft,setDraft]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(Boolean(pane.attemptId)),[stage,setStage]=useState(""),[error,setError]=useState(""),[missing,setMissing]=useState(false);
 const lock=useRef(false),epoch=useRef(0),abort=useRef<AbortController|null>(null),bottom=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),input=useRef<HTMLDivElement>(null);
 const pending=useRef<Row|null>(null),loaded=useRef<string|null>(null);
 const pieces=quote.piecesOf(pane.id);
 const quoting=quote.quotingPaneId===pane.id;

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
  onSources(pane.id,paneSources(pane,title,events));
  return ()=>onSources(pane.id,null);
 },[events,pane.id,title,pane.attemptId]); // eslint-disable-line react-hooks/exhaustive-deps
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
 const collapsed=pane.state==="tab";
 return <section className="chatPane" data-pane-id={pane.id} data-pane-index={index} data-state={pane.state} data-drop={dropSide} aria-label={title} style={collapsed?undefined:{flexGrow:pane.weight}}>
  {collapsed&&<div className="paneTabFace" onClick={e=>{if(!(e.target as HTMLElement).closest(".paneTabClose"))layout.onPin(pane.id);}}>
   <button type="button" className="paneTabOpen" aria-label={title+"，已收起，点击展开"} title="点击展开此页" onClick={()=>layout.onPin(pane.id)}>
    <StudentIcon name="up"/>
    <span className="paneTabLabel">{title}</span>
   </button>
   <button type="button" className="paneTabClose" aria-label={"关闭 "+title} title="关闭此页" onClick={()=>onClose(pane.id)}><StudentIcon name="close"/></button>
  </div>}
  <div className="chatPaneInner">
  <header className="chatPaneHead">
   <button type="button" className="paneGrip" aria-label={"拖动排序："+title+"（可用 Alt+方向键换位）"} title="拖动换位（Alt+方向键亦可）" onPointerDown={e=>onDragStart(e,pane.id)} onKeyDown={e=>{if(!e.altKey)return;if(e.key==="ArrowLeft"){e.preventDefault();onSiblingMove(pane.id,-1);}if(e.key==="ArrowRight"){e.preventDefault();onSiblingMove(pane.id,1);}}}><StudentIcon name="menu"/></button>
   <span className="chatPaneTitle">{title}</span>
   <QuoteToolbar quoting={quoting} count={pieces.length} disabled={busy||loading||quote.busy} onToggle={()=>quote.onToggle(pane.id)}/>
   <span className="chatPaneActions">
    <button type="button" className="chatPaneCollapse" aria-label={"收起 "+title+" 为页边"} title="收起为页边" onClick={()=>layout.onCollapseOne(pane.id)}><StudentIcon name="up"/></button>
    <button type="button" className="chatPaneClose" aria-label={"关闭 "+title} title="关闭此页" onClick={()=>onClose(pane.id)}><StudentIcon name="close"/></button>
   </span>
  </header>
  <div className="chatPaneScroll" ref={scroll}>
   {missing&&<p className="chatPaneMissing" role="alert">该子页面已失效（会话可能已被删除）。<button type="button" onClick={()=>onClose(pane.id)}>关闭</button></p>}
   {loading&&<p role="status">正在打开子页面…</p>}
   {!loading&&!missing&&pane.quotes.length>0&&<ul className="quoteCardList">{pane.quotes.map((p,i)=><li key={p.id}><QuoteCard piece={p} index={i+1} onRemove={events.length?undefined:(id)=>quote.onRemoveQuote(pane.id,id)} onLocate={quote.onLocate}/></li>)}</ul>}
   {events.map((e:Row,i:number)=><div className="chatExchange" key={e.request_id}>
    <div className="lmMessageRow lmMessageMe"><span className="lmMessageAvatar"><StudentIcon name="person"/></span><div className="lmMessageBody"><div className="lmMessageName">我</div><article className="chatUser" data-quote-src={"q:"+pane.id+":"+e.request_id+":user"}><ChatMarkdown text={i===0?(pane.question||"（引用追问）"):(e.message||"")}/></article></div></div>
    <div className="lmMessageRow"><span className="lmMessageAvatar lmMessageAI"><StudentIcon name="spark"/></span><div className="lmMessageBody"><div className="lmMessageName">Course Mirror · {title}</div><article className="chatAssistant" data-quote-src={"q:"+pane.id+":"+e.request_id+":ai"}>
     <ChatMarkdown text={e.response?.answer||""}/>
     <div className="chatMessageTools"><button type="button" onClick={()=>quoteAnswer(e.request_id)}>引用此回答</button></div>
    </article></div></div>
   </div>)}
   {busy&&<p className="chatThinking" role="status">{({queued:"正在准备…",retrieving:"寻知 · 正在查找教材…",generating:"答疑 · 正在思考…",checking:"正在核对回答…"} as Row)[stage]||"正在思考…"}</p>}
   <div ref={bottom}/>
  </div>
  {quoting&&<QuoteHud count={pieces.length} limit={12} error={quote.error} canAssemble={pieces.length>0} onAssemble={()=>quote.onAssemble(pane.id)} onCopy={()=>quote.onCopy(pane.id)} onClear={()=>quote.onClear(pane.id)} onExit={quote.onExit}/>}
  <QuoteSurface paneId={pane.id} active={quoting} containerRef={scroll} sourcesRef={sourcesRef} pieces={pieces} onChange={next=>quote.setPieces(pane.id,next)} onExit={quote.onExit}/>
  {error&&<div className="chatError" role="alert">{error}{pending.current&&!busy&&<button type="button" onClick={()=>void send(true)}>重试</button>}</div>}
  <form className="chatComposer" key="composer" onSubmit={e=>{e.preventDefault();void send();}}>
   <FormulaComposer key={pane.id} ref={input} value={draft} onChange={setDraft} onSend={()=>void send()} disabled={busy||loading||quoting||user.status!=="active"}/>
   <div className="chatComposerActions"><span/><button className="primary" type="submit" disabled={busy||loading||!draft.trim()||user.status!=="active"}><StudentIcon name="send"/>{busy?"思考中":"发送"}</button></div>
  </form>
  </div>
 </section>;

 function quoteAnswer(requestId:string){
  const host=scroll.current?.querySelector<HTMLElement>(`[data-quote-src="q:${pane.id}:${requestId}:ai"]`);
  if(!host)return;
  const found=collectUnitsWithin(host,paneSources(pane,title,events)).map(p=>({...holdPiece(p),id:crypto.randomUUID()}));
  if(found.length)quote.onAddPieces(pane.id,found as QuotePiece[]);
 }
}

export default function QuotePanes({panes,quote,children,board,dropping,api,user,streaming,course,sourcesRef,mainWeight=1,layout,onClose,onBindAttempt,onSources}:{
 panes:PaneState[];
 quote:QuoteUi;
 children:ReactNode;
 board?:ReactNode;        // 素材拼图区（含它的分隔条），与剪刀面板并列但互不干扰
 dropping?:boolean;       // 正把文件拖到页面上
 api:Api;user:Row;streaming:boolean;course:string;
 sourcesRef:React.RefObject<Sources>;
 mainWeight?:number;
 layout:PaneLayout;
 onClose:(id:string)=>void;
 onBindAttempt:(paneId:string,attemptId:string,question:string)=>void;
 onSources:(paneId:string,sources:Sources|null)=>void;
}){
 const strip=useRef<HTMLDivElement>(null);
 const layoutRef=useRef(layout);layoutRef.current=layout;
 const drag=useRef<{id:string;x:number}|null>(null);
 const [drop,setDrop]=useState<{id:string;after:boolean}|null>(null);
 const [resizing,setResizing]=useState(false);

 // 自动收纳：只收不放、从右往左、固定页跳过；连带子树一起收；主页面永不折叠。
 // 必须防抖：截图、滚动条出现等瞬时重排会触发 ResizeObserver，若立即收纳，面板会被
 // 永久收成页边（只收不放）。等布局稳定 >140ms 再判定，并忽略明显异常的窄宽度。
 useEffect(()=>{
  const el=strip.current;if(!el)return;
  const fit=()=>{
   if(el.clientWidth<MIN_PANE)return;
   let open=1+panes.filter(p=>p.state==="open").length;
   if(open*MIN_PANE+(open-1)*(STRIP_GAP+RESIZER)<=el.clientWidth)return;
   const victims:string[]=[];
   for(let i=panes.length-1;i>=0;i-=1){
    if(open*MIN_PANE+(open-1)*(STRIP_GAP+RESIZER)<=el.clientWidth)break;
    const pane=panes[i];
    if(pane.state!=="open"||pane.pinned)continue;
    victims.push(pane.id);
    const kids=descendantIds(panes,pane.id).filter(id=>panes.find(p=>p.id===id)?.state==="open");
    open-=1+kids.length;
   }
   if(victims.length)layoutRef.current.onCollapse(victims);
  };
  let timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(fit,140);};
  schedule();
  const ro=new ResizeObserver(schedule);ro.observe(el);
  return ()=>{clearTimeout(timer);ro.disconnect();};
 },[panes]);

 // 分隔条：拖动分配相邻两页的权重（总和守恒），双击恢复均分
 function startResize(e:React.PointerEvent,leftId:string,rightId:string){
  e.preventDefault();
  const el=strip.current;if(!el)return;
  const weightOf=(id:string)=>id==="main"?mainWeight:(panes.find(p=>p.id===id)?.weight??1);
  // 用相邻两面板的实际像素宽度标定「权重/像素」，这样抽页标签、间距、分隔条都自然被算进去
  const elOf=(id:string)=>id==="main"
   ?el.querySelector<HTMLElement>(":scope > .chatWorkspace")
   :el.querySelector<HTMLElement>(`[data-pane-id="${id}"]`);
  const px=(elOf(leftId)?.getBoundingClientRect().width??0)+(elOf(rightId)?.getBoundingClientRect().width??0);
  const sum=weightOf(leftId)+weightOf(rightId);
  const perPx=sum/Math.max(1,px);
  const minW=MIN_PANE*perPx;
  if(sum<2*minW)return;
  const startX=e.clientX,leftW=weightOf(leftId);
  setResizing(true);
  const move=(ev:PointerEvent)=>{
   const next=Math.min(Math.max(leftW+(ev.clientX-startX)*perPx,minW),sum-minW);
   layoutRef.current.onWeights({[leftId]:next,[rightId]:sum-next});
  };
  const up=()=>{setResizing(false);window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);};
  window.addEventListener("pointermove",move);
  window.addEventListener("pointerup",up);
 }
 function resetResize(leftId:string,rightId:string){
  const weightOf=(id:string)=>id==="main"?mainWeight:(panes.find(p=>p.id===id)?.weight??1);
  const half=(weightOf(leftId)+weightOf(rightId))/2;
  layoutRef.current.onWeights({[leftId]:half,[rightId]:half});
 }

 // 换位：按住页头拖动，整棵子树一起移动；键盘 Alt+方向键走同一通道
 function withoutSubtree(panes:PaneState[],id:string){
  const ids=new Set([id,...descendantIds(panes,id)]);
  return panes.filter(p=>!ids.has(p.id));
 }
 // 同父级的相邻兄弟间移动一格（Alt+方向键用）
 function siblingMove(id:string,dir:-1|1){
  const pane=panes.find(p=>p.id===id);if(!pane)return;
  const siblings=panes.filter(p=>p.parentId===pane.parentId);
  const partner=siblings[siblings.findIndex(p=>p.id===id)+dir];
  if(!partner)return;
  const rest=withoutSubtree(panes,id);
  const at=dir>0
   ?rest.findIndex(p=>p.id===partner.id)+1+descendantIds(panes,partner.id).length
   :rest.findIndex(p=>p.id===partner.id);
  if(at>=0)layoutRef.current.onReorder(id,at);
 }
 function startDrag(e:React.PointerEvent,id:string){
  if((e.target as HTMLElement).closest("button:not(.paneGrip)"))return;
  e.preventDefault();
  const startX=e.clientX;
  let moved=false;
  let target:{id:string;after:boolean}|null=null;
  const move=(ev:PointerEvent)=>{
   if(!moved&&Math.abs(ev.clientX-startX)<8)return;
   moved=true;
   const under=document.elementFromPoint(ev.clientX,ev.clientY)?.closest<HTMLElement>("[data-pane-id],.chatWorkspace");
   if(!under)return;
   const paneId=under.dataset.paneId;
   const box=under.getBoundingClientRect();
   const after=ev.clientX>box.left+box.width/2;
   target=paneId?{id:paneId,after}:{id:"main",after:true};
   setDrop(target);
  };
  const up=()=>{
   window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);
   setDrop(null);
   if(!moved||!target)return;
   const rest=withoutSubtree(panes,id);
   const at=target.id==="main"?0:rest.findIndex(p=>p.id===target!.id)+(target!.after?1:0);
   if(at<0)return;
   layoutRef.current.onReorder(id,at);
  };
  window.addEventListener("pointermove",move);
  window.addEventListener("pointerup",up);
 }

 const visible=(pane:PaneState)=>pane.state==="open";
 let prevVisible="main";
 // 主面板的 flex 权重（拖动分隔条时与相邻子面板分配宽度）。
 // 注意 children 可能是数组（工作区 + 隐藏的选择层），只给第一个元素挂 style。
 const styled=(Array.isArray(children)?children:[children]).map((child,i)=>{
  if(i!==0||!isValidElement(child))return child;
  const element=child as ReactElement<{style?:Record<string,unknown>}>;
  // map 出来的数组元素必须带 key，否则 React 会报 key 警告
  return cloneElement(element,{key:element.key??"main-pane",style:{...(element.props.style||{}),flexGrow:mainWeight}});
 });
 return <div className={"chatSplit"+(dropping?" isDropping":"")+(board?" hasBoard":"")}>
  {dropping&&<div className="materialDropHint"><span>松开即可加入素材区（只在本地打开，不上传）</span></div>}
  <div className={"chatPanes"+(panes.length?" hasPanes":"")+(resizing?" isResizing":"")} ref={strip}>
  {styled}
  {panes.flatMap((pane,i)=>{
   const node=<SubChatPane key={pane.id} pane={pane} index={i+1} title={paneTitle(i+1)} course={course} api={api} user={user} streaming={streaming} quote={quote} sourcesRef={sourcesRef} layout={layout} dropSide={drop?.id===pane.id?(drop.after?"after":"before"):undefined} onClose={onClose} onBindAttempt={onBindAttempt} onSources={onSources} onDragStart={startDrag} onSiblingMove={siblingMove}/>;
   if(visible(pane)){
    const leftId=prevVisible; // 必须快照：回调在触发时才读，闭包里的 let 已经是终值
    const resizer=<div key={pane.id+"-r"} className="paneResizer" role="separator" aria-orientation="vertical" aria-label={"调整 "+paneTitle(i+1)+" 宽度"} onPointerDown={e=>startResize(e,leftId,pane.id)} onDoubleClick={()=>resetResize(leftId,pane.id)}/>;
    prevVisible=pane.id;
    return [resizer,node];
   }
   return [node];
  })}
  </div>
  {board}
 </div>;
}
