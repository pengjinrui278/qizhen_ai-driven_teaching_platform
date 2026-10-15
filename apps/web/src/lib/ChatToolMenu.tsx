"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import "./chat-tool-menu.css";

// 输入框旁的「+」工具入口：拍照/上传图片、文档、摘录、参阅都收在这里。
// 之前它们平铺在输入框下面，一多就把输入区挤变形；收成一个入口既整齐也好找。
export default function ChatToolMenu({label="工具库",disabled,children}:{
 label?:string;disabled?:boolean;children:ReactNode;
}){
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null);

 useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
  const esc=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();setOpen(false);toggle.current?.focus();}};
  document.addEventListener("pointerdown",outside);
  document.addEventListener("keydown",esc);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",esc);};
 },[open]);

 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);

 return <div className="chatToolMenu" ref={root}>
  <button ref={toggle} type="button" className={"chatToolToggle"+(open?" isOpen":"")}
   aria-expanded={open} aria-haspopup="dialog" aria-label={label} title={label}
   disabled={disabled} onClick={()=>setOpen(v=>!v)}>
   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
  </button>
  {open&&<div className="chatToolPanel" role="dialog" aria-label={label}>
   <p className="chatToolPanelTitle">{label}</p>
   {children}
  </div>}
 </div>;
}

/** 工具面板里的一格：一行标题 + 控件。刻意不接受说明文字——界面不替用户复述功能。 */
export function ChatToolSection({title,children}:{title:string;children:ReactNode}){
 return <section className="chatToolSection">
  <h4>{title}</h4>
  {children}
 </section>;
}
