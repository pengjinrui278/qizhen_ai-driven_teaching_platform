"use client";
import {useEffect,useRef,useState} from "react";
import ChatMarkdown from "./ChatMarkdown";
import StudentIcon from "./StudentIcon";
import {formatSize,kindLabel,type MaterialPane} from "./material-store";
import "./material-board.css";

// 单个素材瓷砖：只有“看”的功能，不含 agent 对话
function MaterialTile({pane,index,onClose,onHeight,onMove}:{pane:MaterialPane;index:number;onClose:(id:string)=>void;onHeight:(id:string,h:number)=>void;onMove:(id:string,delta:number)=>void}){
 const [expanded,setExpanded]=useState(false);
 const drag=useRef<{y:number;h:number}|null>(null);
 function startResize(e:React.PointerEvent){
  e.preventDefault();
  drag.current={y:e.clientY,h:pane.height};
  const move=(ev:PointerEvent)=>{if(!drag.current)return;onHeight(pane.id,Math.min(900,Math.max(160,drag.current.h+(ev.clientY-drag.current.y))));};
  const up=()=>{drag.current=null;window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);};
  window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);
 }
 const body=()=>{
  if(pane.kind==="pdf")return <iframe className="materialFrame" src={pane.source} title={pane.title}/>;
  if(pane.kind==="url")return <iframe className="materialFrame" src={pane.source} title={pane.title} sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerPolicy="no-referrer"/>;
  if(pane.kind==="image")return <div className="materialImageWrap"><img src={pane.source} alt={pane.title}/></div>;
  if(pane.kind==="text")return <div className="materialText"><ChatMarkdown text={pane.source||"（空文件）"}/></div>;
  return <div className="materialUnsupported"><StudentIcon name="file"/><p>{pane.note||"暂不支持在线预览"}</p>{pane.source&&<a href={pane.source} target="_blank" rel="noreferrer">在新标签中打开</a>}</div>;
 };
 return <section className="materialTile" style={expanded?undefined:{height:pane.height}} data-kind={pane.kind} aria-label={pane.title}>
  <header className="materialTileHead">
   <button type="button" className="materialGrip" title="上移/下移（Alt+方向键）" aria-label={"调整 "+pane.title+" 的位置"} onKeyDown={e=>{if(!e.altKey)return;if(e.key==="ArrowUp"){e.preventDefault();onMove(pane.id,-1);}if(e.key==="ArrowDown"){e.preventDefault();onMove(pane.id,1);}}}><StudentIcon name="menu"/></button>
   <span className="materialKind">{kindLabel(pane.kind)}</span>
   <span className="materialTitle" title={pane.title}>{pane.title}{pane.size?<em> · {formatSize(pane.size)}</em>:null}</span>
   <button type="button" className="materialAct" aria-label={expanded?"还原高度":"展开高度"} title={expanded?"还原高度":"展开高度"} onClick={()=>setExpanded(v=>!v)}><StudentIcon name="up"/></button>
   <button type="button" className="materialAct" aria-label={"关闭 "+pane.title} title="关闭" onClick={()=>onClose(pane.id)}><StudentIcon name="close"/></button>
  </header>
  <div className="materialBody">{body()}</div>
  {!expanded&&<div className="materialResize" role="separator" aria-orientation="horizontal" aria-label={"调整 "+pane.title+" 高度"} onPointerDown={startResize}/>}
 </section>;
}

// 素材工具（放主面板页头）：选择文件 / 粘贴网址
export function MaterialToolbar({count,onPick,onUrl,disabled}:{count:number;onPick:(files:FileList)=>void;onUrl:(value:string)=>void;disabled:boolean}){
 const [open,setOpen]=useState(false),[value,setValue]=useState("");
 const file=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(!open)return;const esc=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false);};document.addEventListener("keydown",esc);return()=>document.removeEventListener("keydown",esc);},[open]);
 return <div className="materialToolbar">
  <button type="button" className={"quoteTool"+(open?" isActive":"")} aria-expanded={open} aria-describedby="materialToolHint" title="把本地文件拖进页面，或在这里选择文件/粘贴网址" disabled={disabled} onClick={()=>setOpen(v=>!v)}>
   <StudentIcon name="library"/>素材{count>0&&<span className="quoteToolCount">{count}</span>}
  </button>
  <span id="materialToolHint" className="quoteToolHint">素材页只在本地打开文件，不上传服务器；刷新后清空</span>
  {open&&<div className="materialPopup" role="dialog" aria-label="添加素材">
   <p className="materialPopupNote">文件只在本地浏览器打开，不上传服务器。</p>
   <button type="button" className="materialPopupPick" onClick={()=>file.current?.click()}>选择本地文件…</button>
   <input ref={file} type="file" multiple hidden aria-label="选择本地文件" onChange={e=>{if(e.target.files?.length)onPick(e.target.files);e.target.value="";setOpen(false);}}/>
   <form className="materialPopupUrl" onSubmit={e=>{e.preventDefault();if(!value.trim())return;onUrl(value);setValue("");setOpen(false);}}>
    <input aria-label="粘贴网址" placeholder="粘贴网址 https://…" value={value} onChange={e=>setValue(e.target.value)}/>
    <button type="submit" disabled={!value.trim()}>加入</button>
   </form>
   <p className="materialPopupNote">注意：多数网站禁止被嵌入，空白时请用「在新标签中打开」。</p>
  </div>}
 </div>;
}

// 拼图区：停靠在对话卡片右侧的并列阅读空间
export default function MaterialBoard({panes,onClose,onHeight,onMove,onClear}:{panes:MaterialPane[];onClose:(id:string)=>void;onHeight:(id:string,h:number)=>void;onMove:(id:string,delta:number)=>void;onClear:()=>void}){
 if(!panes.length)return null;
 return <aside className="materialBoard" aria-label="素材拼图区">
  <header className="materialBoardHead">
   <StudentIcon name="library"/>
   <strong>素材 {panes.length}</strong>
   <span className="materialBoardHint">仅本地打开 · 刷新清空</span>
   <button type="button" className="materialAct" aria-label="关闭全部素材" title="关闭全部" onClick={onClear}><StudentIcon name="close"/></button>
  </header>
  <div className="materialBoardList">{panes.map((pane,index)=><MaterialTile key={pane.id} pane={pane} index={index} onClose={onClose} onHeight={onHeight} onMove={onMove}/>)}</div>
 </aside>;
}
