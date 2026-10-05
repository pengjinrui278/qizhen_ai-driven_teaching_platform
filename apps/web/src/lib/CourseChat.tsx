"use client";
import {useEffect,useRef,useState} from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import PhotoInput from "./PhotoInput";
import StudentIcon from "./StudentIcon";
import "./student-chat.css";
import coursePrompts from "./course-prompts.json";
import {normalizeMath} from "./math-markdown.mjs";
import {streamCourseMessage} from "./course-stream";
import "./course-chat.css";
import {courseIntro} from "./course-intro";
type Row=Record<string,any>;
type Api=(path:string,method?:string,body?:any)=>Promise<any>;
function MessageText({text}:{text:string}){return <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex,{throwOnError:false}]]}>{normalizeMath(text)}</ReactMarkdown>;}
export default function CourseChat({api,courses,user,sandboxes=[],streaming=false}:{api:Api;courses:Row[];user:Row;sandboxes?:Row[];streaming?:boolean}){
 const [stage,setStage]=useState("");
 const [assignment,setAssignment]=useState(""),[theme,setTheme]=useState("conditions");
 const [course,setCourse]=useState("mathematical_analysis"),[sessions,setSessions]=useState<Row[]>([]),[active,setActive]=useState<Row|null>(null),[events,setEvents]=useState<Row[]>([]);
 const [draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[pending,setPending]=useState<Row|null>(null),[copied,setCopied]=useState(""),[historyOpen,setHistoryOpen]=useState(false),[feedback,setFeedback]=useState("");
 const [relatedChunks,setRelatedChunks]=useState<Row[]>([]),[relatedLoading,setRelatedLoading]=useState(false),[showRelated,setShowRelated]=useState(false);
 const lock=useRef(false),epoch=useRef(0),bottom=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const [historyLoading,setHistoryLoading]=useState(true),[historyError,setHistoryError]=useState("");
 const [failedSession,setFailedSession]=useState<Row|null>(null);
 const historyPanel=useRef<HTMLElement>(null),historyToggle=useRef<HTMLButtonElement>(null);
 const [actionId,setActionId]=useState<string|null>(null);
 const actionTimer=useRef<ReturnType<typeof setTimeout>|null>(null),historyEpoch=useRef(0);
 const workspace=useRef<HTMLElement>(null),followBottom=useRef(true);
 const pendingRef=useRef<Row|null>(null);
 const streamAbort=useRef<AbortController|null>(null);
 function leaveRequest(){epoch.current++;streamAbort.current?.abort();streamAbort.current=null;lock.current=false;setBusy(false);setStage("" );}
 const [historyEnd,setHistoryEnd]=useState(false);
 const [historyCollapsed,setHistoryCollapsed]=useState(false);
 async function loadOlder(){const serial=++historyEpoch.current;setHistoryLoading(true);setHistoryError("");try{const rows=await api("/attempts?offset="+sessions.length+"&limit=100");if(serial===historyEpoch.current){setSessions(old=>[...old,...rows.filter((r:Row)=>!old.some(o=>o.id===r.id))]);setHistoryEnd(rows.length<100);}}catch(e){if(serial===historyEpoch.current)setHistoryError((e as Error).message);}finally{if(serial===historyEpoch.current)setHistoryLoading(false);}}
 useEffect(()=>{const box=input.current;if(!box)return;const resize=()=>{box.style.height="auto";const style=getComputedStyle(box);const border=parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);box.style.height=Math.min(140,Math.max(44,Math.ceil(box.scrollHeight+border)))+"px";};resize();window.addEventListener("resize",resize);return()=>window.removeEventListener("resize",resize);},[draft]);
 useEffect(()=>{if(historyOpen)historyPanel.current?.querySelector<HTMLButtonElement>("button")?.focus();},[historyOpen]);
 function cancelActions(){if(actionTimer.current)clearTimeout(actionTimer.current);actionTimer.current=null;setActionId(null);}
 async function retryHistory(){const token=epoch.current;const rows=await loadHistory();if(token!==epoch.current||!rows||active)return;const id=new URLSearchParams(location.search).get("attempt");if(id)await resume(rows.find((row:Row)=>row.id===id)||{id});}
 function updateUrl(c:string,id?:string){const url=new URL(location.href);url.searchParams.set("course",c);if(id)url.searchParams.set("attempt",id);else url.searchParams.delete("attempt");history.replaceState(history.state,"",url);}
 async function loadHistory(){const serial=++historyEpoch.current;setHistoryLoading(true);setHistoryEnd(false);setHistoryError("");try{const rows=await api("/attempts");if(serial===historyEpoch.current)setSessions(rows);return serial===historyEpoch.current?rows:null;}catch(e){if(serial===historyEpoch.current)setHistoryError((e as Error).message);return null;}finally{if(serial===historyEpoch.current)setHistoryLoading(false);}}
 useEffect(()=>{let mounted=true;const token=++epoch.current;setSessions([]);setActive(null);setEvents([]);cancelActions();
  const q=new URLSearchParams(location.search);const c=q.get("course");if(c)setCourse(c);
  void loadHistory().then(async rows=>{if(!mounted||token!==epoch.current||!rows)return;const id=q.get("attempt");if(id)await resume(rows.find((a:Row)=>a.id===id)||{id});});
  return()=>{mounted=false;streamAbort.current?.abort();epoch.current++;historyEpoch.current++;if(actionTimer.current)clearTimeout(actionTimer.current);};},[user.id]);
 useEffect(()=>{const el=workspace.current;if(el&&followBottom.current)el.scrollTop=el.scrollHeight;},[events,pending,busy,actionId]);
 function resetRelated(){setRelatedChunks([]);setRelatedLoading(false);setShowRelated(false);setCopied("");setFeedback("");}
 function clear(c=course){leaveRequest();cancelActions();followBottom.current=true;updateUrl(c);setLoading(false);setFailedSession(null);resetRelated();setCourse(c);setAssignment("");setActive(null);setEvents([]);setPending(null);pendingRef.current=null;setDraft("");setError("");setHistoryOpen(false);input.current?.focus();}
 async function resume(a:Row){leaveRequest();setFailedSession(null);const token=++epoch.current;cancelActions();followBottom.current=false;if(workspace.current)workspace.current.scrollTop=0;resetRelated();setActive(null);setEvents([]);setPending(null);pendingRef.current=null;setDraft("");setLoading(true);setError("");try{const d=await api("/attempts/"+a.id);if(token===epoch.current){updateUrl(d.course_id,a.id);setCourse(d.course_id);setActive(d);setAssignment(d.sandbox_id||"");setEvents(d.events);setPending(null);pendingRef.current=null;setDraft(d.events.length===0?(d.problem?.text||""):"");setHistoryOpen(false);}}catch(e){if(token===epoch.current){setError("无法打开对话："+(e as Error).message);setFailedSession(a);}}finally{if(token===epoch.current)setLoading(false);}}
 async function send(retry=false,mode="chat"){
  if(lock.current||loading||user.status!=="active")return;
  const msg=mode==="chat"?draft.trim():(mode==="first_hint"?"我卡住了，请给我一个方向提示":mode==="next_hint"?"还是不太懂，请再深入一点":mode==="full_solution"?"请梳理大致解题流程、主要步骤、条件检查和验证方法，保留核心计算或论证让我完成":draft.trim());
  const request=retry?pendingRef.current:{request_id:crypto.randomUUID(),mode,message:msg};
  if(!request?.message)return;
  cancelActions();lock.current=true;setBusy(true);setError("");setFeedback("");setPending(request);pendingRef.current=request;
  const token=epoch.current;
  try{
   let a=active;
   if(!a){a=await api("/attempts","POST",{course_id:course,text:request.message,sandbox_id:assignment||null});if(token!==epoch.current)return;setActive(a);updateUrl(course,a!.id);setSessions(rows=>[a!,...rows.filter(row=>row.id!==a!.id)]); }
   const aid=a!.id;
   setStage("queued");
   if(streaming){streamAbort.current=new AbortController();await streamCourseMessage(aid,request,value=>{if(token===epoch.current)setStage(value);},streamAbort.current.signal);}
   else await api("/attempts/"+aid+"/messages","POST",request);
   const completedAt=Date.now();
   const detail=await api("/attempts/"+aid);
   if(token!==epoch.current)return;
   setEvents(detail.events);setPending(null);pendingRef.current=null;setDraft("");
   const latest=detail.events.at(-1);if(latest?.request_id===request.request_id&&latest.response?.answer){actionTimer.current=setTimeout(()=>{if(token===epoch.current)setActionId(request.request_id);},Math.max(0,3000-(Date.now()-completedAt)));}
   void loadHistory();
  }catch(e){if(token===epoch.current)setError((e as Error).message);}
  finally{if(token===epoch.current){lock.current=false;setBusy(false);}}
 }
 const name=courses.find(c=>c.course_id===course)?.display_name||"课程";
 async function report(outcome:string){if(!active||busy)return;try{await api("/attempts/"+active.id+"/feedback","POST",{request_id:crypto.randomUUID(),outcome,theme,note:""});setFeedback("已记录");}catch(e){setError((e as Error).message);}}
 async function searchRelated(text:string){
  if(!text.trim())return;
  const token=epoch.current;
  setRelatedLoading(true);setShowRelated(true);
  try{
   const chunks=await api("/textbooks/related","POST",{course_id:course,text:text.slice(0,12000)});
   if(token===epoch.current)setRelatedChunks(chunks);
  }catch(e){if(token===epoch.current){setRelatedChunks([]);setError("教材搜索暂不可用，识别文字已保留，可继续提问。");}}
  finally{if(token===epoch.current)setRelatedLoading(false);}
 }
 // Capture the conversation generation so old callbacks cannot fill a new draft.
 const photoEpoch=epoch.current;
 function handleRecognizedText(text:string){
  if(photoEpoch!==epoch.current)return;
  setDraft(current=>current?current+"\n"+text:text);
  void searchRelated(text);
 }
 const isInitial=(e:Row,i:number)=>i===0&&e.message===active?.problem?.text;
 const courseSymbol:Record<string,string>={mathematical_analysis:"ε",linear_algebra_analytic_geometry:"⟨⟩",university_physics:"ω",point_set_topology:"τ",ordinary_differential_equations:"y′"};
 const suggestionList=(coursePrompts as Record<string,{title:string;question:string}[]>)[course]||[{title:"从一个问题开始",question:"请帮我拆解这个问题，并引导我检查自己的思路。"}];
 return <section className={"courseChat lmCourseChat"+(showRelated?" hasRelated":"")+(historyCollapsed?" historyCollapsed":"")}>
 {historyOpen&&<button className="chatDrawerOverlay" aria-label="关闭历史对话遮罩" onClick={()=>setHistoryOpen(false)}/> }
 <aside ref={historyPanel} aria-label="历史对话" onKeyDown={e=>{if(e.key==="Escape"){setHistoryOpen(false);historyToggle.current?.focus();}}} className={"chatHistory "+(historyOpen?"isOpen":"")}><button className="chatHistoryClose" onClick={()=>{setHistoryOpen(false);historyToggle.current?.focus();}}>关闭对话列表</button><label>课程<select aria-label="聊天课程" disabled={busy||loading} value={course} onChange={e=>clear(e.target.value)}>{courses.map(c=><option key={c.course_id} value={c.course_id}>{c.display_name}</option>)}</select></label>{!active&&<details><summary>关联作业</summary><select aria-label="关联作业" disabled={busy||loading} value={assignment} onChange={e=>setAssignment(e.target.value)}><option value="">私人学习</option>{sandboxes.filter(s=>s.course_id===course&&s.status==="open").map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></details>}<h2>最近对话</h2>{historyLoading&&<p role="status">正在加载历史…</p>}{historyError&&<p role="alert">历史加载失败：{historyError}<button onClick={()=>void retryHistory()}>重新加载历史</button></p>}<div className="chatSessionList">{sessions.filter(s=>s.course_id===course).map(a=><button key={a.id} aria-current={active?.id===a.id?"true":undefined} onClick={()=>resume(a)}>{a.problem.text?.slice(0,55)||"课程对话"}</button>)}{!historyLoading&&!historyError&&!sessions.some(s=>s.course_id===course)&&<p>暂无对话</p>}</div>{sessions.length>=100&&!historyEnd&&<button disabled={historyLoading} onClick={()=>void loadOlder()}>加载更早的对话</button>}</aside>
 <section className="chatWorkspace" ref={workspace} onScroll={()=>{const el=workspace.current;if(el)followBottom.current=el.scrollHeight-el.clientHeight-el.scrollTop<60;}}><header className="chatHeader"><button ref={historyToggle} className="chatHistoryToggle" aria-label="打开对话列表" aria-expanded={historyOpen} onClick={()=>{if(window.matchMedia("(min-width:1024px)").matches)setHistoryCollapsed(!historyCollapsed);else setHistoryOpen(!historyOpen);}}><StudentIcon name="menu"/></button><label className="lmChatCourse"><StudentIcon name="library"/><select aria-label="当前课程" disabled={busy||loading} value={course} onChange={e=>clear(e.target.value)}>{courses.map(c=><option key={c.course_id} value={c.course_id}>{c.display_name}</option>)}</select></label><button onClick={()=>clear()}>新对话</button></header>
 <div className="chatMessages" role="log" aria-label="课程对话" aria-live="polite">
 {!active&&!pending&&<div className="chatWelcome"><div className="welcomeIcon">{courseSymbol[course]||"∑"}</div><h2>你好，我是{name} Course Mirror</h2><p>{courseIntro(course)}</p><div className="suggestionRow">{suggestionList.map(s=><button key={s.title} title={s.question} type="button" disabled={busy||loading} onClick={()=>{setDraft(s.question);input.current?.focus();}}>{s.title}</button>)}</div></div>}
 {loading&&<p role="status">正在打开对话…</p>}
 {active&&(events.length===0||!isInitial(events[0],0))&&<div className="lmMessageRow lmMessageMe"><span className="lmMessageAvatar"><StudentIcon name="person"/></span><div className="lmMessageBody"><div className="lmMessageName">我</div><article className="chatUser"><MessageText text={active.problem.text||"课程问题"}/></article></div></div>}
 {active&&!loading&&events.length===0&&!busy&&<p role="status">这段对话尚无已完成的回答。原问题已保留在下方，可直接发送继续。</p>}
 {events.map((e,i)=><div className="chatExchange" key={e.request_id}><div className="lmMessageRow lmMessageMe"><span className="lmMessageAvatar"><StudentIcon name="person"/></span><div className="lmMessageBody"><div className="lmMessageName">我</div><article className="chatUser"><MessageText text={e.message||active?.problem?.text||"继续"}/></article></div></div><div className="lmMessageRow"><span className="lmMessageAvatar lmMessageAI"><StudentIcon name="spark"/></span><div className="lmMessageBody"><div className="lmMessageName">Course Mirror · {name}</div><article className="chatAssistant">{e.response?.hint_level&&<div className="hintTag">{e.response?.decision?.hint_scale_version==="course-hints-v1-three" ? `提示 ${e.response.hint_level}/3` : `历史提示级别 ${e.response.hint_level}（量表未转换）`}</div>}<MessageText text={e.response.answer}/><div className="chatMessageTools"><button onClick={async()=>{try{await navigator.clipboard.writeText(e.response.answer);setCopied(e.request_id);}catch{setError("复制失败，请手动选择文字。");}}}>{copied===e.request_id?"✓ 已复制":"复制"}</button>{e.response.citations?.length>0&&<details><summary>资料来源</summary>{e.response.citations.map((c:Row,j:number)=><p key={j}>{c.locator||c.source_id}</p>)}</details>}</div>{actionId===e.request_id&&!busy&&!loading&&<div className="hintButtons" aria-label="继续学习"><button className="hintBtn" disabled={user.status!=="active"} onClick={()=>send(false,"first_hint")}>我卡住了</button><button className="hintBtn" disabled={user.status!=="active"} onClick={()=>send(false,"next_hint")}>再深入一点</button><button className="hintBtn" disabled={user.status!=="active"} onClick={()=>send(false,"full_solution")}>梳理解题框架</button></div>}</article></div></div></div>)}
 {pending&&<div className="lmMessageRow lmMessageMe"><span className="lmMessageAvatar"><StudentIcon name="person"/></span><div className="lmMessageBody"><div className="lmMessageName">我</div><article className="chatUser"><MessageText text={pending.message}/></article></div></div>}
 {busy&&<p className="chatThinking" role="status">{({queued:"正在准备…",retrieving:"寻知 · 正在查找教材…",generating:"答疑 · 正在思考…",checking:"正在核对回答…"} as Row)[stage]||"正在思考…"}</p>}<div ref={bottom}/></div>
 {error&&<div className="chatError" role="alert">{error}{failedSession&&!loading&&<button onClick={()=>void resume(failedSession)}>重新打开对话</button>}{pending&&!busy&&<button onClick={()=>send(true)}>重试</button>}</div>}
 <form className="chatComposer" onSubmit={e=>{e.preventDefault();void send();}}>
 <textarea ref={input} aria-label="发送消息" placeholder="输入消息，或上传题目图片…（支持 LaTeX 公式）" value={draft} maxLength={6000} rows={1} disabled={busy||loading||user.status!=="active"} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/>
 <div className="chatComposerActions"><details className="chatAttachments"><summary><StudentIcon name="camera"/>图片</summary><PhotoInput key={photoEpoch} disabled={busy||loading||user.status!=="active"} recognize={data=>api("/recognize","POST",{data_url:data})} onText={handleRecognizedText}/></details><button className="primary" type="submit" disabled={busy||loading||!draft.trim()||user.status!=="active"}><StudentIcon name="send"/>{busy?"思考中":"发送"}</button></div>
 </form>
 {events.length>0&&<details><summary>补充学习反馈</summary><label>反馈环节<select value={theme} onChange={e=>setTheme(e.target.value)}><option value="conditions">定理条件</option><option value="quantifiers">量词与依赖</option><option value="construction">辅助对象</option></select></label><button disabled={busy} onClick={()=>report("still_stuck")}>仍有困难</button><button disabled={busy} onClick={()=>report("independent_success")}>这次独立完成</button>{feedback&&<p role="status">{feedback}</p>}</details>}
 </section>
 {showRelated&&<div className="relatedPanel">
  <div className="relatedHeader">
   <span className="relatedTitle"><StudentIcon name="library"/>相关教材内容</span>
   <button className="relatedClose" aria-label="关闭相关教材" onClick={()=>setShowRelated(false)}><StudentIcon name="close"/></button>
  </div>
  {relatedLoading?<p className="relatedLoading">正在搜索教材…</p>:
   relatedChunks.length?<div className="relatedList">
    {relatedChunks.map((c:Row)=><div key={c.chunk_id} className="relatedItem">
     <div className="relatedMeta">{c.chapter||"教材"} · {c.locator?.split("·")[1]?.trim()||""}</div>
     <div className="relatedContent">{c.content?.slice(0,120)}{c.content?.length>120?"…":""}</div>
     <button className="relatedInsert" onClick={()=>setDraft(cur=>(cur?cur+"\n\n":"")+"参考教材："+(c.chapter||"")+" "+(c.content?.slice(0,80)||""))}>引用到对话</button>
    </div>)}
   </div>:<p className="relatedEmpty">未找到相关教材内容</p>}
 </div>}
</section>;
}
