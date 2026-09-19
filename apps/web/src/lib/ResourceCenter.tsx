"use client";
import {useEffect,useState} from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "./resource-center.css";
type Row=Record<string,any>;
function MathText({text}:{text:string}){return <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex,{throwOnError:false}]]}>{text.replace(/\\\[([\s\S]*?)\\\]/g,(_,s)=>"$$"+s+"$$").replace(/\\\(([\s\S]*?)\\\)/g,(_,s)=>"$"+s+"$")}</ReactMarkdown>;}
function highlight(text:string,q:string){
 if(!q.trim())return text;
 const parts=q.trim().split(/\s+/).filter(Boolean);
 if(!parts.length)return text;
 let result=text;
 for(const p of parts){
  const re=new RegExp("("+p.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","gi");
  result=result.replace(re,'<mark class="rcHighlight">$1</mark>');
 }
 return result;
}
const TYPE_LABELS:Record<string,string>={definition:"定义",theorem:"定理",corollary:"推论",lemma:"引理",proposition:"命题",example:"例",exercise:"习题",proof:"证明",explanation:"",property:"性质",remark:"注"};
function parseChunk(title:string|undefined){
 if(!title)return {type:"",label:"",name:""};
 const parts=title.split("·").map(s=>s.trim()).filter(Boolean);
 // 找类型段
 for(let i=parts.length-1;i>=0;i--){
  const p=parts[i];
  const m=p.match(/^(definition|theorem|corollary|lemma|proposition|example|exercise|proof|explanation|property|remark)\b\s*(.*)$/i);
  if(m){
   const type=m[1].toLowerCase();
   const rest=m[2].trim();
   return {type,label:TYPE_LABELS[type]||type,name:rest};
  }
 }
 return {type:"",label:"",name:parts[parts.length-1]||""};
}
export default function ResourceCenter({api,courses}:{api:(path:string,method?:string,body?:unknown)=>Promise<any>;courses:Row[]}){
 const [course,setCourse]=useState(courses[0]?.course_id||"mathematical_analysis");
 const [tab,setTab]=useState<"textbooks"|"exams">("textbooks");
 const [view,setView]=useState<"list"|"search"|"reader"|"exam">("list");
 const [query,setQuery]=useState("");
 const [textbooks,setTextbooks]=useState<Row[]>([]);
 const [exams,setExams]=useState<Row[]>([]);
 const [searchResults,setSearchResults]=useState<Row[]>([]);
 const [activeBook,setActiveBook]=useState<Row|null>(null);
 const [chapters,setChapters]=useState<Row[]>([]);
 const [activeChapter,setActiveChapter]=useState<string>("");
 const [chunkContent,setChunkContent]=useState<Row[]>([]);
 const [activeExam,setActiveExam]=useState<Row|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{loadList();},[course]);
 async function loadList(){
  setLoading(true);setError("");setView("list");setActiveBook(null);setActiveExam(null);
  try{
   const [t,e]=await Promise.all([api("/textbooks?course_id="+encodeURIComponent(course)),api("/exams?course_id="+encodeURIComponent(course))]);
   setTextbooks(t);setExams(e);
  }catch(err){setError(err instanceof Error?err.message:String(err));}
  finally{setLoading(false);}
 }
 async function doSearch(){
  if(!query.trim())return;
  setLoading(true);setError("");
  try{
   const r=await api("/textbooks/search?course_id="+encodeURIComponent(course)+"&q="+encodeURIComponent(query)+"&limit=30");
   setSearchResults(r);setView("search");
  }catch(err){setError(err instanceof Error?err.message:String(err));}
  finally{setLoading(false);}
 }
 async function openReader(book:Row){
  setActiveBook(book);setLoading(true);setError("");
  try{
   const ch=await api("/textbooks/"+encodeURIComponent(book.source_id)+"/chapters");
   setChapters(ch);setActiveChapter(ch[0]?.chapter||"");
   if(ch[0]?.chapter)await loadChapter(book.source_id,ch[0].chapter);
   setView("reader");
  }catch(err){setError(err instanceof Error?err.message:String(err));}
  finally{setLoading(false);}
 }
 async function loadChapter(sourceId:string,chapter:string){
  setLoading(true);
  try{
   const chunks=await api("/textbooks/"+encodeURIComponent(sourceId)+"/chunks?chapter="+encodeURIComponent(chapter)+"&limit=400");
   setChunkContent(chunks);setActiveChapter(chapter);
  }catch(err){setError(err instanceof Error?err.message:String(err));}
  finally{setLoading(false);}
 }
 async function openExam(exam:Row){
  setLoading(true);setError("");
  try{
   const detail=await api("/exams/"+encodeURIComponent(exam.paper_id));
   setActiveExam(detail);setView("exam");
  }catch(err){setError(err instanceof Error?err.message:String(err));}
  finally{setLoading(false);}
 }
 const courseName=courses.find(c=>c.course_id===course)?.display_name||course;
 return <div className="rcContainer">
  <div className="rcTopbar">
   <div className="rcCourseSelect">
    <label>课程</label>
    <select value={course} onChange={e=>setCourse(e.target.value)}>
     {courses.map(c=><option key={c.course_id} value={c.course_id}>{c.display_name}</option>)}
    </select>
   </div>
   <div className="rcSearchBox">
    <input type="text" placeholder="搜索教材全文，如：一致连续、拉格朗日中值定理" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")doSearch();}}/>
    <button onClick={doSearch} disabled={loading||!query.trim()}>搜索</button>
   </div>
  </div>
  {error&&<div className="rcError" role="alert">{error}</div>}
  {view==="list"&&<>
   <div className="rcTabs">
    <button className={tab==="textbooks"?"active":""} onClick={()=>setTab("textbooks")}>教材库 <span className="rcCount">{textbooks.length}</span></button>
    <button className={tab==="exams"?"active":""} onClick={()=>setTab("exams")}>真题卷 <span className="rcCount">{exams.length}</span></button>
   </div>
   {loading?<p className="rcLoading">加载中…</p>:
   tab==="textbooks"?(
    textbooks.length?<div className="rcCardGrid">
     {textbooks.map(b=><div key={b.source_id} className="rcBookCard" onClick={()=>openReader(b)}>
      <div className="rcBookCover"><span className="rcBookSymbol">∑</span></div>
      <div className="rcBookInfo">
       <h3>{b.title}</h3>
       <p className="rcBookMeta">{b.volume} · {b.edition}</p>
       <p className="rcBookStats">{b.chapter_count} 章 · {b.chunk_count} 个文本块</p>
       <span className="rcBookAction">在线阅读 →</span>
      </div>
     </div>)}
    </div>:<div className="rcEmpty"><p>该课程暂未录入教材</p><p className="rcEmptyHint">教材录入后可在此在线阅读与全文搜索</p></div>
   ):(
    exams.length?<div className="rcCardGrid">
     {exams.map(e=><div key={e.paper_id} className="rcExamCard" onClick={()=>openExam(e)}>
      <div className="rcExamHeader"><span className="rcExamYear">{e.year}</span><span className={"rcExamType "+(e.exam_type.includes("期末")?"final":"mid")}>{e.exam_type}</span></div>
      <h3>{e.title}</h3>
      <p className="rcExamMeta">{e.semester} · {e.question_count} 题{e.total_score?` · ${e.total_score}分`:""}</p>
      <p className={"rcExamAnswer "+(e.has_answers?"yes":"no")}>{e.has_answers?"✓ 含答案解析":"暂无答案"}</p>
     </div>)}
    </div>:<div className="rcEmpty"><p>该课程暂未收录真题卷</p><p className="rcEmptyHint">历年期末真题卷正在整理中，敬请期待</p></div>
   )}
  </>}
  {view==="search"&&<>
   <div className="rcSearchHeader">
    <button className="rcBackBtn" onClick={()=>setView("list")}>← 返回资源库</button>
    <span>搜索 "{query}" 的结果：{searchResults.length} 条</span>
   </div>
   {searchResults.length?<div className="rcSearchResults">
    {searchResults.map(r=><div key={r.chunk_id} className="rcSearchItem" onClick={()=>{
     const book=textbooks.find(b=>b.source_id===r.source_id);
     if(book){openReader(book).then(()=>{if(r.chapter)loadChapter(book.source_id,r.chapter);});}
    }}>
     <div className="rcSearchMeta">{r.chapter||"未分章"} · {r.locator?.split("·")[1]?.trim()||""}</div>
     <div className="rcSearchTitle" dangerouslySetInnerHTML={{__html:highlight(r.title||"",query)}}/>
     <div className="rcSearchSnippet" dangerouslySetInnerHTML={{__html:highlight(r.content.slice(0,300),query)}}/>
     <span className="rcSearchJump">查看原文 →</span>
    </div>)}
   </div>:<p className="rcEmpty">未找到匹配内容，试试其他关键词</p>}
  </>}
  {view==="reader"&&activeBook&&<div className="rcReader">
   <div className="rcReaderSidebar">
    <button className="rcBackBtn" onClick={()=>setView("list")}>← 返回教材库</button>
    <h3>{activeBook.title} {activeBook.volume}</h3>
    <div className="rcChapterList">
     {chapters.map(ch=><button key={ch.chapter} className={activeChapter===ch.chapter?"active":""} onClick={()=>loadChapter(activeBook.source_id,ch.chapter)}>{ch.chapter}</button>)}
    </div>
   </div>
   <div className="rcReaderContent">
    <h2>{activeChapter}</h2>
    {loading?<p className="rcLoading">加载中…</p>:
     chunkContent.length?<div className="rcBookContent">
      {chunkContent.map(c=>{
       const {type,label,name}=parseChunk(c.title);
       const isStructured=["definition","theorem","corollary","lemma","proposition","property"].includes(type);
       const isExample=type==="example";
       const isExercise=type==="exercise";
       const isProof=type==="proof";
       return <div key={c.chunk_id} className={"rcBookBlock rcType-"+type}>
        {label&&<div className="rcBlockLabel">
         <span className="rcLabelTag">{label}</span>
         {name&&name!==c.content?.slice(0,name.length)&&<span className="rcBlockName">{name}</span>}
        </div>}
        <div className="rcBlockBody"><MathText text={c.content}/></div>
       </div>;
      })}
     </div>:<p className="rcEmpty">该章节暂无内容</p>}
   </div>
  </div>}
  {view==="exam"&&activeExam&&<div className="rcExamDetail">
   <button className="rcBackBtn" onClick={()=>setView("list")}>← 返回真题卷</button>
   <div className="rcExamDetailHeader">
    <h2>{activeExam.paper.title}</h2>
    <p>{activeExam.paper.year}年 · {activeExam.paper.semester} · {activeExam.paper.exam_type}{activeExam.paper.total_score?` · 满分${activeExam.paper.total_score}分`:""}</p>
   </div>
   <div className="rcQuestionList">
    {activeExam.questions.map((q:Row)=><article key={q.question_id} className="rcQuestion">
     <div className="rcQuestionHeader"><span className="rcQNumber">{q.number}</span>{q.score?<span className="rcQScore">{q.score}分</span>:null}</div>
     <div className="rcQStatement"><MathText text={q.statement}/></div>
     {q.solution&&<details className="rcQSolution"><summary>查看答案与解析</summary><MathText text={q.solution}/></details>}
     {q.answer&&!q.solution&&<details className="rcQSolution"><summary>查看答案</summary><MathText text={q.answer}/></details>}
    </article>)}
   </div>
  </div>}
 </div>;
}
