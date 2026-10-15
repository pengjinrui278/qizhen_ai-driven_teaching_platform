"use client";
import {useEffect,useRef} from "react";
import {QUOTE_SKIP,quoteKeyOf,readQuoteUnit,readRangePiece,topUnitsWithin} from "./chat-quote.mjs";
import {holdPiece} from "./quote-store";
import type {QuotePiece} from "./quote-store";

type SourceMeta={source:string;label:string;paneId:string;attemptId?:string|null;requestId:string};
type Sources=Record<string,SourceMeta>;

function topUnit(el:HTMLElement|null):HTMLElement|null{
 if(!el)return null;
 let best=el;
 for(let n=el.parentElement?.closest<HTMLElement>("[data-quote-unit]");n;n=n.parentElement?.closest<HTMLElement>("[data-quote-unit]"))best=n;
 return best.closest(QUOTE_SKIP)?null:best;
}
function unitUnder(target:EventTarget|null):HTMLElement|null{
 const el=target instanceof HTMLElement?target.closest<HTMLElement>("[data-quote-unit]"):null;
 return el&&!el.closest(QUOTE_SKIP)?el:null;
}
function pieceOf(el:HTMLElement,sources:Sources):QuotePiece|null{
 const unit=readQuoteUnit(el,sources);
 return unit?holdPiece({id:crypto.randomUUID(),...unit}):null;
}

// 摘录选择层：只做逻辑，不产出可见 DOM。方案：点选整块（公式为原子）、拖拽跨块连选、段内拖选文字；
// 选中态靠 data-quote-* 契约回贴类名，源文本在 pointerup 时从 pane 的 sources 现场解析。
export default function QuoteSurface({paneId,active,containerRef,sourcesRef,pieces,onChange,onExit}:{
 paneId:string;
 active:boolean;
 containerRef:React.RefObject<HTMLElement|null>;
 sourcesRef:React.RefObject<Sources>;
 pieces:QuotePiece[];
 onChange:(next:QuotePiece[])=>void;
 onExit:()=>void;
}){
 const piecesRef=useRef(pieces);piecesRef.current=pieces;
 const hover=useRef<HTMLElement|null>(null);
 const start=useRef<{x:number;y:number;el:HTMLElement}|null>(null);
 const activeRef=useRef(active);activeRef.current=active;
 const exitRef=useRef(onExit);exitRef.current=onExit;
 const changeRef=useRef(onChange);changeRef.current=onChange;

 // 选中态回贴：按 key 给块加虚线框与序号
 useEffect(()=>{
  const container=containerRef.current;if(!container)return;
  const keys=new Map(pieces.map((p,i)=>[p.key,i]));
  container.querySelectorAll<HTMLElement>("[data-quote-unit]").forEach(el=>{
   const index=keys.get(quoteKeyOf(el));
   el.classList.toggle("quoteSelected",index!==undefined);
   if(index!==undefined)el.dataset.quoteIndex=String(index+1);else delete el.dataset.quoteIndex;
  });
 },[pieces,active,containerRef]);

 useEffect(()=>{
  const container=containerRef.current;
  if(!active||!container)return;
  const clearHover=()=>{hover.current?.classList.remove("quoteHover");hover.current=null;};
  const onOver=(e:PointerEvent)=>{
   const el=unitUnder(e.target);
   if(el===hover.current)return;
   clearHover();
   if(el){el.classList.add("quoteHover");hover.current=el;}
  };
  const onDown=(e:PointerEvent)=>{
   if(e.button!==0)return;
   const el=unitUnder(e.target);
   if(!el)return;
   start.current={x:e.clientX,y:e.clientY,el};
  };
  const onUp=(e:PointerEvent)=>{
   const from=start.current;start.current=null;
   if(!from)return;
   const sources=sourcesRef.current||{};
   const selection=window.getSelection();
   // 1) 拖选：文字自由到字、跨块也行（公式在 rangeSource 里还原为 LaTeX 原子）
   const range=readRangePiece(selection,container);
   if(range&&Math.abs(e.clientX-from.x)+Math.abs(e.clientY-from.y)>4){
    selection?.removeAllRanges();
    const meta=sources[range.host?.getAttribute("data-quote-src")??""];
    if(meta)add([holdPiece({id:crypto.randomUUID(),key:"part:"+crypto.randomUUID(),unit:"text",source:range.source,text:range.source,label:meta.label,paneId:meta.paneId,attemptId:meta.attemptId??null,requestId:meta.requestId})]);
    return;
   }
   selection?.removeAllRanges();
   // 2) 跨块连选（拖拽）或点选整块
   const to=unitUnder(e.target);
   const moved=Math.abs(e.clientX-from.x)+Math.abs(e.clientY-from.y)>8;
   if(moved&&to&&to!==from.el){
    const units=topUnitsWithin(container);
    const a=units.indexOf(topUnit(from.el)!),b=units.indexOf(topUnit(to)!);
    if(a>=0&&b>=0){
     const [lo,hi]=a<=b?[a,b]:[b,a];
     add(units.slice(lo,hi+1).map((el:HTMLElement)=>pieceOf(el,sources)).filter(Boolean) as QuotePiece[]);
     return;
    }
   }
   const piece=pieceOf(from.el,sources);
   if(piece)toggle(piece);
  };
  const onClick=(e:MouseEvent)=>{if(activeRef.current&&(e.target as HTMLElement).closest("a"))e.preventDefault();};
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();exitRef.current();}};
  container.addEventListener("pointerover",onOver);
  container.addEventListener("pointerdown",onDown);
  container.addEventListener("pointerup",onUp);
  container.addEventListener("click",onClick,true);
  document.addEventListener("keydown",onKey);
  return ()=>{
   container.removeEventListener("pointerover",onOver);
   container.removeEventListener("pointerdown",onDown);
   container.removeEventListener("pointerup",onUp);
   container.removeEventListener("click",onClick,true);
   document.removeEventListener("keydown",onKey);
   clearHover();
  };
 },[active,containerRef]); // 回调走 ref/稳定引用，避免每次渲染重挂监听打断进行中的拖选

 function add(incoming:QuotePiece[]){
  const current=piecesRef.current;
  const byKey=new Map(current.map(p=>[p.key,p]));
  incoming.forEach(p=>{if(!byKey.has(p.key))byKey.set(p.key,p);});
  changeRef.current([...byKey.values()]);
 }
 function toggle(piece:QuotePiece){
  const current=piecesRef.current;
  const exists=current.some(p=>p.key===piece.key);
  changeRef.current(exists?current.filter(p=>p.key!==piece.key):[...current,piece]);
 }
 return null;
}
