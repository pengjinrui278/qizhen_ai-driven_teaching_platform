"use client";
import {useEffect,useRef,useState} from "react";
import ChatMarkdown from "./ChatMarkdown";
import StudentIcon from "./StudentIcon";
import {pieceLimit} from "./quote-store";
import type {QuotePiece} from "./quote-store";
import "./chat-quote.css";

// 引用卡片：默认只露一段（CSS 底部署渐隐），悬停或点击展开全文
export function QuoteCard({piece,index,onRemove,onLocate}:{piece:QuotePiece;index:number;onRemove?:(id:string)=>void;onLocate?:(piece:QuotePiece)=>void}){
 const body=useRef<HTMLDivElement>(null);
 const [expanded,setExpanded]=useState(false),[pinned,setPinned]=useState(false),[overflow,setOverflow]=useState(false);
 useEffect(()=>{const el=body.current;if(el)setOverflow(el.scrollHeight>el.clientHeight+4);},[piece.source,expanded]);
 function enter(){if(window.matchMedia("(hover:hover)").matches)setExpanded(true);}
 function leave(){if(window.matchMedia("(hover:hover)").matches&&!pinned)setExpanded(false);}
 function toggle(){setPinned(v=>!v);setExpanded(v=>pinned?!v:true);}
 return <article className={"quoteCard"+(expanded?" isExpanded":"")} onPointerEnter={enter} onPointerLeave={leave}>
  <header className="quoteCardHead">
   <span className="quoteCardTag">引用 {index}</span>
   <span className="quoteCardLabel" title={piece.label}>{piece.label}</span>
   {onLocate&&<button type="button" className="quoteCardAction" onClick={()=>onLocate(piece)}>定位原文</button>}
   {onRemove&&<button type="button" className="quoteCardAction" aria-label={"移除引用 "+index} onClick={()=>onRemove(piece.id)}><StudentIcon name="close"/></button>}
  </header>
  <div className={"quoteCardBody"+(overflow?" isClipped":"")} ref={body}><ChatMarkdown text={piece.source}/></div>
  {(overflow||expanded)&&<button type="button" className="quoteCardToggle" aria-expanded={expanded} onClick={toggle}>{expanded?"收起":"展开全文"}</button>}
 </article>;
}

export function QuoteToolbar({quoting,count,disabled,onToggle}:{quoting:boolean;count:number;disabled:boolean;onToggle:()=>void}){
 return <div className="quoteToolbar" role="group" aria-label="对话工具">
  <button type="button" className={"quoteTool"+(quoting?" isActive":"")} aria-pressed={quoting} aria-describedby="quoteToolHint" title={quoting?"退出剪刀模式（Esc）":"框选本页回答片段，并排追问"} disabled={disabled} onClick={onToggle}>
   <StudentIcon name="scissors"/>剪刀{count>0&&<span className="quoteToolCount">{count}</span>}
  </button>
  <span id="quoteToolHint" className="quoteToolHint">{quoting?(count>0?`本页已选 ${count} 处`:"点选整段，拖动可精确到字"):"框选本页回答片段，并排追问"}</span>
 </div>;
}

// 剪刀模式的浮动操作条（贴在消息区底部）
export function QuoteHud({count,limit,error,canAssemble,onAssemble,onCopy,onClear,onExit}:{count:number;limit:number;error:string;canAssemble:boolean;onAssemble:()=>void;onCopy:()=>void;onClear:()=>void;onExit:()=>void}){
 return <div className="quoteHud" role="toolbar" aria-label="剪刀操作">
  <span className="quoteHudCount" role="status" aria-live="polite">{count>0?`已选 ${count} / ${limit} 处`:"点选整段；按住拖动可精确到字，公式始终整块"}</span>
  {error&&<span className="quoteHudError" role="alert">{error}</span>}
  <button type="button" disabled={!count} onClick={onCopy}>复制</button>
  <button type="button" disabled={!count} onClick={onClear}>清空</button>
  <button type="button" className="primary" disabled={!canAssemble} title={error||undefined} onClick={onAssemble}>拼接成子页面</button>
  <button type="button" onClick={onExit}>退出</button>
 </div>;
}

// 已剪片段托盘：位于输入框上方，按剪取顺序从上到下排列
export default function QuoteTray({pieces,onRemove,onLocate,onAssemble,busy}:{pieces:QuotePiece[];onRemove:(id:string)=>void;onLocate?:(piece:QuotePiece)=>void;onAssemble:()=>void;busy:boolean}){
 if(!pieces.length)return null;
 return <section className="quoteTray" aria-label="已剪下的引用片段">
  <div className="quoteTrayHead"><strong>已剪 {pieces.length} / {pieceLimit} 处</strong><button type="button" className="primary" disabled={busy} onClick={onAssemble}>拼接成子页面</button></div>
  <div className="quoteTrayList">{pieces.map((p,i)=><QuoteCard key={p.id} piece={p} index={i+1} onRemove={onRemove} onLocate={onLocate}/>)}</div>
 </section>;
}
