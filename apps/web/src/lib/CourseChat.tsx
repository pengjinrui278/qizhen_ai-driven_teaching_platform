"use client";
import {useEffect,useRef,useState} from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import PhotoInput from "./PhotoInput";
import "./course-chat.css";
type Row=Record<string,any>;
type Api=(path:string,method?:string,body?:any)=>Promise<any>;
function MessageText({text}:{text:string}){return <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex,{throwOnError:false}]]}>{text.replace(/\\\[([\s\S]*?)\\\]/g,(_,s)=>"$$"+s+"$$").replace(/\\\(([\s\S]*?)\\\)/g,(_,s)=>"$"+s+"$")}</ReactMarkdown>;}
export default function CourseChat({api,courses,user,sandboxes=[]}:{api:Api;courses:Row[];user:Row;sandboxes?:Row[]}){
 const [assignment,setAssignment]=useState(""),[theme,setTheme]=useState("conditions");
 const [course,setCourse]=useState("mathematical_analysis"),[sessions,setSessions]=useState<Row[]>([]),[active,setActive]=useState<Row|null>(null),[events,setEvents]=useState<Row[]>([]);
 const [draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[pending,setPending]=useState<Row|null>(null),[copied,setCopied]=useState(""),[historyOpen,setHistoryOpen]=useState(false),[feedback,setFeedback]=useState("");
 const [relatedChunks,setRelatedChunks]=useState<Row[]>([]),[relatedLoading,setRelatedLoading]=useState(false),[showRelated,setShowRelated]=useState(false);
 const lock=useRef(false),epoch=useRef(0),bottom=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const pendingRef=useRef<Row|null>(null);
 useEffect(()=>{let mounted=true;const token=epoch.current;const q=new URLSearchParams(location.search);const c=q.get("course");if(c)setCourse(c);
  api("/attempts").then(async rows=>{if(!mounted)return;setSessions(rows);const a=rows.find((a:Row)=>a.id===q.get("attempt"));if(a){const d=await api("/attempts/"+a.id);if(mounted&&epoch.current===token){setCourse(a.course_id);setActive(d);setEvents(d.events);}}}).catch(e=>mounted&&setError(e.message));return()=>{mounted=false;epoch.current++;};},[]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:"nearest"});},[events,pending,busy]);
 function clear(c=course){if(lock.current)return;epoch.current++;setCourse(c);setAssignment("");setActive(null);setEvents([]);setPending(null);pendingRef.current=null;setDraft("");setError("");setFeedback("");setHistoryOpen(false);input.current?.focus();}
 async function resume(a:Row){if(lock.current)return;const token=++epoch.current;setLoading(true);setError("");try{const d=await api("/attempts/"+a.id);if(token===epoch.current){setCourse(a.course_id);setActive(d);setEvents(d.events);setPending(null);pendingRef.current=null;setDraft("");setHistoryOpen(false);}}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 async function send(retry=false,mode="chat"){
  if(lock.current||loading||user.status!=="active")return;
  const msg=mode==="chat"?draft.trim():(mode==="first_hint"?"我卡住了，请给我一个方向提示":mode==="next_hint"?"还是不太懂，请再深入一点":mode==="full_solution"?"我想看完整解答":draft.trim());
  const request=retry?pendingRef.current:{request_id:crypto.randomUUID(),mode,message:msg};
  if(!request?.message)return;
  lock.current=true;setBusy(true);setError("");setFeedback("");setPending(request);pendingRef.current=request;
  const token=epoch.current;
  try{
   let a=active;
   if(!a){a=await api("/attempts","POST",{course_id:course,text:request.message,sandbox_id:assignment||null});if(token!==epoch.current)return;setActive(a);}
   const aid=a!.id;
   await api("/attempts/"+aid+"/messages","POST",request);
   const detail=await api("/attempts/"+aid);
   if(token!==epoch.current)return;
   setEvents(detail.events);setPending(null);pendingRef.current=null;setDraft("");setSessions(await api("/attempts"));input.current?.focus();
  }catch(e){if(token===epoch.current)setError((e as Error).message);}
  finally{lock.current=false;setBusy(false);}
 }
 const name=courses.find(c=>c.course_id===course)?.display_name||"课程";
 const hintLevels=events.filter((e:Row)=>e.response?.hint_level).map((e:Row)=>e.response.hint_level as number);
 const currentHintLevel=hintLevels.length?Math.max(...hintLevels):0;
 const hintsExhausted=events.some((e:Row)=>e.response?.hints_exhausted);
 const isHintMode=events.some((e:Row)=>["first_hint","next_hint"].includes(e.mode||e.interaction_mode))||currentHintLevel>0;
 async function report(outcome:string){if(!active||busy)return;try{await api("/attempts/"+active.id+"/feedback","POST",{request_id:crypto.randomUUID(),outcome,theme,note:""});setFeedback("已记录");}catch(e){setError((e as Error).message);}}
 async function searchRelated(text:string){
  if(!text.trim())return;
  setRelatedLoading(true);setShowRelated(true);
  try{
   const chunks=await api("/textbooks/search?course_id="+encodeURIComponent(course)+"&q="+encodeURIComponent(text.slice(0,200))+"&limit=5");
   setRelatedChunks(chunks);
  }catch(e){setRelatedChunks([]);}
  finally{setRelatedLoading(false);}
 }
 function handleRecognizedText(text:string){
  setDraft(current=>current?current+"\n"+text:text);
  void searchRelated(text);
 }
 const isInitial=(e:Row,i:number)=>i===0&&e.message===active?.problem?.text;
 const courseSymbol:Record<string,string>={mathematical_analysis:"ε",linear_algebra_analytic_geometry:"⟨⟩",university_physics:"ω",point_set_topology:"τ",ordinary_differential_equations:"y′"};
 const suggestions:Record<string,string[]>={
  mathematical_analysis:["ε-δ 证明怎么构造？","数列极限的 N 如何选取","帮我理解夹逼定理"],
  linear_algebra_analytic_geometry:["矩阵的秩怎么求？","线性相关与线性无关","特征值与特征向量"],
  university_physics:["切向与法向加速度","量纲分析怎么做","牛顿第二定律的应用"],
  point_set_topology:["开集公理是什么？","连续映射的拓扑定义","有限补拓扑"],
  ordinary_differential_equations:["分离变量法怎么用？","初值问题解的唯一性","积分因子法"],
 };
 const suggestionList=suggestions[course]||["我卡住了，给个提示","帮我理解这个知识点","这道题的思路是什么"];
 return <section className="courseChat">
 <aside className={"chatHistory "+(historyOpen?"isOpen":"")}><button className="chatNew" disabled={busy||loading} onClick={()=>clear()}>＋ 新对话</button><label>课程<select aria-label="聊天课程" disabled={busy||loading} value={course} onChange={e=>clear(e.target.value)}>{courses.map(c=><option key={c.course_id} value={c.course_id}>{c.display_name}</option>)}</select></label>{!active&&<details><summary>关联作业</summary><select aria-label="关联作业" disabled={busy||loading} value={assignment} onChange={e=>setAssignment(e.target.value)}><option value="">私人学习</option>{sandboxes.filter(s=>s.course_id===course&&s.status==="open").map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></details>}<h2>最近对话</h2><div className="chatSessionList">{sessions.filter(s=>s.course_id===course).map(a=><button key={a.id} aria-current={active?.id===a.id?"true":undefined} disabled={busy||loading} onClick={()=>resume(a)}>{a.problem.text?.slice(0,55)||"课程对话"}</button>)}{!sessions.some(s=>s.course_id===course)&&<p>暂无对话</p>}</div></aside>
 <section className="chatWorkspace"><header className="chatHeader"><button className="chatHistoryToggle" aria-label="打开对话列表" onClick={()=>setHistoryOpen(!historyOpen)}>☰</button><h1>{name}</h1><button disabled={busy||loading} onClick={()=>clear()}>新对话</button></header>
 <div className="chatMessages" role="log" aria-label="课程对话" aria-live="polite">
 {!active&&!pending&&<div className="chatWelcome"><div className="welcomeIcon">{courseSymbol[course]||"∑"}</div><h2>你好，我是{name} Course Mirror</h2><p>卡住时我会给最小有效提示，而不是直接给答案。试试下面的问题，或直接输入你的题目。</p><div className="suggestionRow">{suggestionList.map(s=><button key={s} type="button" disabled={busy||loading} onClick={()=>setDraft(s)}>{s}</button>)}</div></div>}
 {loading&&<p role="status">正在打开对话…</p>}
 {active&&events.length>0&&!isInitial(events[0],0)&&<article className="chatUser"><MessageText text={active.problem.text||"课程问题"}/></article>}
 {events.map((e,i)=><div className="chatExchange" key={e.request_id}><article className="chatUser"><MessageText text={e.message||active?.problem?.text||"继续"}/></article><article className="chatAssistant">{e.response?.hint_level&&<div className="hintTag">提示级别 {e.response.hint_level}/7{e.response.hints_exhausted?" · 已用完":""}</div>}<MessageText text={e.response.answer}/><div className="chatMessageTools"><button onClick={async()=>{try{await navigator.clipboard.writeText(e.response.answer);setCopied(e.request_id);}catch{setError("复制失败，请手动选择文字。");}}}>{copied===e.request_id?"✓ 已复制":"复制"}</button>{e.response.citations?.length>0&&<details><summary>资料来源</summary>{e.response.citations.map((c:Row,j:number)=><p key={j}>{c.locator||c.source_id}</p>)}</details>}</div></article></div>)}
 {pending&&<article className="chatUser"><MessageText text={pending.message}/></article>}
 {busy&&<p className="chatThinking" role="status">正在思考…</p>}<div ref={bottom}/></div>
 {error&&<div className="chatError" role="alert">{error}{pending&&!busy&&<button onClick={()=>send(true)}>重试</button>}</div>}
 <div className="hintToolbar">
  <div className="hintInfo">
   {isHintMode?<span className="hintLevelBadge">提示级别 {currentHintLevel}/7{hintsExhausted?" · 已用完":""}</span>:<span className="hintHint">卡住了？试试渐进提示，而不是直接看答案</span>}
  </div>
  <div className="hintButtons">
   <button className="hintBtn first" disabled={busy||loading||user.status!=="active"} onClick={()=>send(false,"first_hint")} title="给一个方向提示，不涉及具体解法">💡 我卡住了</button>
   <button className="hintBtn next" disabled={busy||loading||user.status!=="active"||!active||hintsExhausted} onClick={()=>send(false,"next_hint")} title="在当前提示基础上再深入一级">⬆️ 再深入一点</button>
   <button className="hintBtn full" disabled={busy||loading||user.status!=="active"||!active} onClick={()=>send(false,"full_solution")} title="查看完整解答（建议先尝试提示）">📖 看完整解答</button>
  </div>
 </div>
 {showRelated&&<div className="relatedPanel">
  <div className="relatedHeader">
   <span className="relatedTitle">📚 相关教材内容</span>
   <button className="relatedClose" onClick={()=>setShowRelated(false)}>×</button>
  </div>
  {relatedLoading?<p className="relatedLoading">正在搜索教材…</p>:
   relatedChunks.length?<div className="relatedList">
    {relatedChunks.map((c:Row)=><div key={c.chunk_id} className="relatedItem">
     <div className="relatedMeta">{c.chapter||"教材"} · {c.locator?.split("·")[1]?.trim()||""}</div>
     <div className="relatedContent">{c.content?.slice(0,120)}{c.content?.length>120?"…":""}</div>
     <button className="relatedInsert" onClick={()=>setDraft(cur=>cur?cur+"\n\n参考教材："+(c.chapter||"")+" "+(c.content?.slice(0,80)||""):cur)}>引用到对话</button>
    </div>)}
   </div>:<p className="relatedEmpty">未找到相关教材内容</p>}
 </div>}
 <form className="chatComposer" onSubmit={e=>{e.preventDefault();void send();}}>
 <textarea ref={input} aria-label="发送消息" placeholder="输入消息，或上传题目图片…（支持 LaTeX 公式）" value={draft} maxLength={6000} rows={3} disabled={busy||loading||user.status!=="active"} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/>
 <div className="chatComposerActions"><details className="chatAttachments"><summary>📷 图片</summary><PhotoInput disabled={busy} recognize={data=>api("/recognize","POST",{data_url:data})} onText={handleRecognizedText}/></details><button className="primary" type="submit" disabled={busy||loading||!draft.trim()||user.status!=="active"}>{busy?"思考中":"发送"}</button></div>
 </form>
 {events.length>0&&<details><summary>补充学习反馈</summary><label>反馈环节<select value={theme} onChange={e=>setTheme(e.target.value)}><option value="conditions">定理条件</option><option value="quantifiers">量词与依赖</option><option value="construction">辅助对象</option></select></label><button disabled={busy} onClick={()=>report("still_stuck")}>仍有困难</button><button disabled={busy} onClick={()=>report("independent_success")}>这次独立完成</button>{feedback&&<p role="status">{feedback}</p>}</details>}
 </section></section>;
}
