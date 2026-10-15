"use client";
import {useEffect,useRef,useState} from "react";

// mermaid 体积大（约 1MB），只在页面真的出现 ```mermaid 代码块时才动态拉进来，
// 不进主包。securityLevel 用 strict：图里的 HTML/链接不执行。
let loader:Promise<typeof import("mermaid")["default"]>|null=null;
function loadMermaid(){
 if(!loader){
  loader=import("mermaid").then(m=>{
   m.default.initialize({startOnLoad:false,securityLevel:"strict",theme:"neutral"});
   return m.default;
  });
 }
 return loader;
}

let seq=0;

export default function Mermaid({code}:{code:string}){
 const [svg,setSvg]=useState("");
 const [failed,setFailed]=useState(false);
 const host=useRef<HTMLDivElement>(null);

 useEffect(()=>{
  let live=true;
  setSvg("");setFailed(false);
  const source=(code||"").trim();
  if(!source)return;
  loadMermaid().then(mermaid=>mermaid.render("mmd-"+(++seq),source))
   .then(result=>{if(live)setSvg(result.svg);})
   .catch(()=>{if(live)setFailed(true);});
  return()=>{live=false;};
 },[code]);

 // 渲染失败就老老实实显示源码，不吞掉用户的内容
 if(failed)return <figure className="mmdFigure">
  <figcaption className="mmdNote">这张图暂时画不出来，下面是它的源码。</figcaption>
  <pre className="mmdSource"><code>{code}</code></pre>
 </figure>;

 return <figure className="mmdFigure">
  {svg?<div className="mmdSvg" ref={host} dangerouslySetInnerHTML={{__html:svg}}/>
     :<p className="mmdNote" role="status">正在绘制图…</p>}
 </figure>;
}
