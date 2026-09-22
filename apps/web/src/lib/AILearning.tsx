"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import WindowsInstaller from "./WindowsInstaller";
import AIToolDirectory from "./AIToolDirectory"; import coursePrompts from "./course-prompts.json";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {liveApi} from "./Pilot";
import "katex/dist/katex.min.css";
import "./ai-learning.css";
import "./ai-prompts.css";
type Row=Record<string,any>;
const tabs=[["","知识问答"],["resources","学习资料"],["notes","我的笔记"],["tools","工具中心"],["setup","本地安装"]];
function Markdown({text}:{text:string}){
 const normalized=text.replace(/\\\[([\s\S]*?)\\\]/g,(_,s)=>"$$"+s+"$$").replace(/\\\(([\s\S]*?)\\\)/g,(_,s)=>"$"+s+"$");
 return <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex,{throwOnError:false}]]}>{normalized}</ReactMarkdown>;
}
function saveFile(name:string,content:string){const u=URL.createObjectURL(new Blob([content],{type:"text/markdown;charset=utf-8"}));const a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}
export default function AILearning({section=""}:{section?:string}){
 const tab=section.replace(/^ai\/?/,"");
 const [sessions,setSessions]=useState<Row[]>([]),[active,setActive]=useState<Row|null>(null),[messages,setMessages]=useState<Row[]>([]);
 const [text,setText]=useState(""),[picture,setPicture]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [resources,setResources]=useState<Row[]>([]),[notes,setNotes]=useState<Row[]>([]),[results,setResults]=useState<Row[]>([]),[query,setQuery]=useState("");
 const [draft,setDraft]=useState<Row|null>(null);
 const lock=useRef(false),bottom=useRef<HTMLDivElement>(null),pending=useRef<{id:string;text:string;image:string}|null>(null);
 async function run(task:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");try{await task();}catch(e){setError(e instanceof Error?e.message:"暂时无法完成");}finally{lock.current=false;setBusy(false);}}
 useEffect(()=>{if(tab==="tools"||tab==="setup")return;let live=true;Promise.all([liveApi("/ai/sessions"),liveApi("/ai/resources"),liveApi("/ai/notes")]).then(([s,r,n])=>{if(live){setSessions(s);setResources(r);setNotes(n);}}).catch(e=>live&&setError(e.message));return()=>{live=false;};},[]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:"nearest",behavior:"smooth"});},[messages,busy]);
 async function send(){if(!text.trim())return;await run(async()=>{
  let current=active;
  if(!current){current=await liveApi("/ai/sessions","POST");setActive(current);}
  if(!pending.current||pending.current.text!==text||pending.current.image!==picture)pending.current={id:crypto.randomUUID(),text,image:picture};
  await liveApi("/ai/sessions/"+current!.id+"/messages","POST",{request_id:pending.current.id,text,image:picture||null});
  const detail=await liveApi("/ai/sessions/"+current!.id);setActive(detail);setMessages(detail.messages);
  setSessions(await liveApi("/ai/sessions"));setText("");setPicture("");pending.current=null;
 });}
 function noteFrom(m:Row){setDraft({title:m.question.slice(0,80),content:m.answer,message_id:m.id});}
 async function chooseImage(file?:File){if(!file)return;setError("");if(file.size>4*1024*1024){setError("图片请小于 4MB");return;}if(!["image/png","image/jpeg","image/webp"].includes(file.type)){setError("请选择 PNG、JPEG 或 WebP 图片");return;}const reader=new FileReader();reader.onload=()=>setPicture(String(reader.result));reader.onerror=()=>setError("无法读取图片");reader.readAsDataURL(file);}
 const noteEditor=draft&&<section className="aiNoteEditor" aria-label="编辑笔记"><h2>{draft.id?"编辑笔记":"保存笔记"}</h2><input aria-label="笔记标题" maxLength={120} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/><textarea aria-label="笔记内容" rows={10} maxLength={30000} value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})}/><div className="aiActions"><button disabled={busy||!draft.title.trim()||!draft.content.trim()} onClick={()=>run(async()=>{await liveApi("/ai/notes"+(draft.id?"/"+draft.id:""),draft.id?"PUT":"POST",{title:draft.title,content:draft.content,message_id:draft.message_id});setNotes(await liveApi("/ai/notes"));setDraft(null);setNotice("笔记已保存");})}>确认保存</button><button disabled={busy} onClick={()=>setDraft(null)}>取消</button></div></section>;
 return <div className="aiLearning">
 <div className="pageHeading"><h1>AI 学习</h1></div>
 <nav className="aiTabs" aria-label="AI 学习导航">{tabs.map(([key,title])=><Link key={key} href={"/student/ai"+(key?"/"+key:"")} aria-current={key===tab?"page":undefined}>{title}</Link>)}</nav>
 {error&&<p role="alert" className="portalError">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {tab===""&&<div className="aiChatLayout"><aside className="aiHistory"><button disabled={busy} onClick={()=>{setActive(null);setMessages([]);pending.current=null;setText("");setPicture("");}}>新对话</button>{sessions.map(s=><div className="aiHistoryRow" key={s.id}><button disabled={busy} aria-pressed={active?.id===s.id} onClick={()=>run(async()=>{const d=await liveApi("/ai/sessions/"+s.id);setActive(d);setMessages(d.messages);pending.current=null;setText("");setPicture("");})}>{s.title}</button><button title="删除对话" aria-label={"删除对话 "+s.title} disabled={busy} onClick={()=>{if(window.confirm("删除这段对话？已保存的笔记会保留。"))void run(async()=>{await liveApi("/ai/sessions/"+s.id,"DELETE");setSessions(await liveApi("/ai/sessions"));if(active?.id===s.id){setActive(null);setMessages([]);}});}}>×</button></div>)}</aside>
 <section className="aiChat" aria-label="AI 知识问答"><div className="aiMessages" aria-live="polite">
 {!messages.length&&!busy&&<div className="aiEmpty"><h2>从一个问题开始</h2><p>讨论原理、证据与实践。</p><div className="aiPromptList">{coursePrompts.ai.map(p=><button key={p.title} title={p.question} onClick={()=>{setText(p.question);document.getElementById("ai-question")?.focus();}}>{p.title}</button>)}</div></div>}
 {messages.map(m=><article key={m.id}><div className="aiQuestion"><Markdown text={m.question}/>{m.has_image&&<span>附图已分析（原图不保存）</span>}</div><div className="aiAnswer"><Markdown text={m.answer}/>{m.citations.length>0&&<details><summary>教材依据</summary>{m.citations.map((c:Row,i:number)=><p key={c.id}>[{i+1}] {c.title} · PDF 第 {c.pdf_page} 页 · {c.heading}</p>)}</details>}<button disabled={busy} onClick={()=>noteFrom(m)}>整理为笔记</button></div></article>)}
 {busy&&<p role="status">正在处理…</p>}<div ref={bottom}/></div>
 <form className="aiComposer" onSubmit={e=>{e.preventDefault();void send();}}>
 {picture&&<div className="aiAttachment"><img src={picture} alt="待发送图片"/><button type="button" onClick={()=>setPicture("")} disabled={busy}>移除图片</button></div>}
 <textarea id="ai-question" aria-label="你的问题" placeholder="输入问题…" maxLength={12000} value={text} disabled={busy} onChange={e=>setText(e.target.value)}/>
 <div className="aiActions"><label className="aiFile">上传图片<input aria-label="上传图片" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void chooseImage(e.target.files?.[0]);e.target.value="";}}/></label><label className="aiFile">拍照<input aria-label="拍照" type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>{void chooseImage(e.target.files?.[0]);e.target.value="";}}/></label><button className="aiPrimary" disabled={busy||!text.trim()} type="submit">发送</button></div>
 <p className="aiPrivacy">消息及图片会发送至 DeepSeek；图片仅用于本次回答，不保存原图。</p>
 </form></section></div>}
 {tab==="resources"&&<><form className="aiSearch" onSubmit={e=>{e.preventDefault();void run(async()=>{const found=await liveApi("/ai/search?q="+encodeURIComponent(query));setResults(found);if(!found.length)setNotice("未找到已核对的相关内容");});}}><input aria-label="搜索教材" placeholder="搜索知识点" value={query} maxLength={500} onChange={e=>setQuery(e.target.value)}/><button disabled={busy||!query.trim()}>搜索</button></form><div className="aiGrid">{resources.map(r=><section className="portalPanel" key={r.id}><h2>{r.title}</h2><p>{r.metadata_json.authors||""}</p><p>{r.metadata_json.total_pages} 页 · 已核对 {r.reviewed_pages} 处节选</p></section>)}{!resources.length&&<p>暂无教材</p>}</div>{results.map(r=><section className="portalPanel" key={r.id}><h3>{r.heading||"教材段落"} · PDF 第 {r.page} 页</h3><Markdown text={r.content}/></section>)}<div className="aiGrid"><section className="portalPanel"><h2>例题与习题</h2><p>暂无已核对的题目</p></section><section className="portalPanel"><h2>课程试卷</h2><p>暂无试卷</p></section></div></>}
 {tab==="notes"&&<><div className="aiActions"><button disabled={busy} onClick={()=>setDraft({title:"",content:""})}>新建笔记</button><button disabled={!notes.length} onClick={()=>saveFile("AI学习笔记.md",notes.map(n=>"# "+n.title+"\n\n"+n.content+"\n\n"+n.citations.map((c:Row)=>c.title+" PDF第"+c.pdf_page+"页").join("\n")).join("\n\n---\n\n"))}>导出全部</button></div><div className="aiGrid">{notes.map(n=><article className="portalPanel" key={n.id}><h2>{n.title}</h2><Markdown text={n.content}/><div className="aiActions"><button disabled={busy} onClick={()=>setDraft(n)}>编辑</button><button disabled={busy} onClick={()=>{if(window.confirm("删除这篇笔记？"))void run(async()=>{await liveApi("/ai/notes/"+n.id,"DELETE");setNotes(await liveApi("/ai/notes"));});}}>删除</button></div></article>)}</div>{!notes.length&&<p>还没有笔记，可以从回答中整理，也可以自己记录。</p>}</>}
 {tab==="tools"&&<AIToolDirectory/>}
 {tab==="setup"&&<WindowsInstaller/>}
 {noteEditor}
 </div>;
}
