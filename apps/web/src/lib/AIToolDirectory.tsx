"use client";
import {useState} from "react";
import catalog from "./ai-tools.json";
import "./ai-tools.css";
const categories=["全部","对话","生图","视频","音乐","文案","办公","编程"];
export default function AIToolDirectory(){
 const [category,setCategory]=useState("全部"),[query,setQuery]=useState(""),[notice,setNotice]=useState(""),[help,setHelp]=useState("");
 const filtered=catalog.filter(t=>(category==="全部"||t.categories.includes(category))&&
   (t.name+" "+t.description+" "+t.categories.join(" ")).toLowerCase().includes(query.trim().toLowerCase()));
 async function copy(url:string){try{await navigator.clipboard.writeText(url);setNotice("已复制，可粘贴到系统浏览器打开");}catch{setNotice("无法自动复制，请长按或右键官网链接复制地址");}}
 return <section aria-label="AI 工具目录">
 <input aria-label="搜索工具" placeholder="搜索工具名称或用途" value={query} onChange={e=>setQuery(e.target.value)}/>
 <div className="aiFilters" style={{marginTop:16}}>{categories.map(c=><button key={c} aria-pressed={category===c} onClick={()=>{setCategory(c);setHelp("");}}>{c} · {c==="全部"?catalog.length:catalog.filter(t=>t.categories.includes(c)).length}</button>)}</div>
 {notice&&<p role="status">{notice}</p>}
 <div className="aiGrid">{filtered.map(t=><article className="portalPanel aiToolCard" key={t.id} data-tool={t.id}>
 <div className="aiToolTags">{t.categories.map(c=><span key={c}>{c}</span>)}{t.international&&<span>国际服务</span>}</div>
 <h2>{t.name}</h2><p>{t.description}</p>
 <div className="aiActions"><a href={t.url} target="_blank" rel="noopener noreferrer" aria-label={"打开 "+t.name+" 官网"}>打开官网 ↗</a><button onClick={()=>copy(t.url)} aria-label={"复制 "+t.name+" 链接"}>复制链接</button><button onClick={()=>setHelp(help===t.id?"":t.id)} aria-expanded={help===t.id}>打不开？</button></div>
 {help===t.id&&<div className="aiLinkHelp"><p>可复制链接，在系统浏览器中打开。若仍失败，请记录页面报错；网络、地区或账号限制需要按该服务的官方要求处理。</p>
 {["midjourney","canva","chatgpt","claude"].includes(t.id)&&<p>该官网可能要求浏览器验证，请在系统浏览器中按页面提示操作。</p>}
 <a href={t.url} target="_blank" rel="noopener noreferrer">{new URL(t.url).hostname}</a>
 {t.categories.includes("音乐")&&t.id!=="haimian"&&<p>也可以试试 <a href="https://www.haimian.com/" target="_blank" rel="noopener noreferrer">海绵音乐 ↗</a></p>}
 </div>}
 </article>)}</div>
 {!filtered.length&&<p>没有找到相关工具，请换一个关键词。</p>}
 <p>外部工具使用各自账号，费用以官网为准；上传内容由对应服务商处理。国际服务的可用性以当地网络及服务商支持范围为准。</p>
 </section>;
}
