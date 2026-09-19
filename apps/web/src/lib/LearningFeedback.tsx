"use client";
import {useState} from "react";
type Row=Record<string,any>;
const themeNames:Row={conditions:"定理条件",quantifiers:"量词与依赖",construction:"辅助构造"};
const themeDesc:Row={conditions:"定理适用条件的核对与判断",quantifiers:"量词顺序、变量依赖与 ε-N 构造",construction:"辅助对象、辅助函数与构造思路"};
const outcomes:Row={continued:"能够继续",solved:"自报完成",still_stuck:"仍有困难",independent_success:"自报独立完成"};
const statusLabels:Row={worth_attention:{label:"需关注",color:"#dc2626",bg:"#fef2f2"},improving:{label:"改善中",color:"#059669",bg:"#ecfdf5"},emerging:{label:"观察中",color:"#d97706",bg:"#fffbeb"},weakened:{label:"已改善",color:"#2563eb",bg:"#eff6ff"}};
export default function LearningFeedback({memory,courses,onCorrect}:{memory:Row;courses:Row[];onCorrect:(id:string,note:string)=>Promise<void>}){
 const [course,setCourse]=useState("all"),[days,setDays]=useState("14"),[selected,setSelected]=useState<string|null>(null),[note,setNote]=useState(""),[busy,setBusy]=useState(false);
 const cutoff=days==="all"?0:Date.now()-Number(days)*86400000;
 const rows=(memory.observations||[]).filter((o:Row)=>(course==="all"||o.course_id===course)&&new Date(o.created_at).getTime()>=cutoff);
 const valid=rows.filter((o:Row)=>!o.disputed),feedback=valid.filter((o:Row)=>outcomes[o.kind]);
 const hypotheses=(memory.hypotheses||[]).filter((h:Row)=>course==="all"||h.course_id===course);
 const [error,setError]=useState("");
 // 学习状态摘要
 const activeDays=new Set(valid.map((o:Row)=>new Date(o.created_at).toDateString())).size;
 const worthAttention=hypotheses.filter((h:Row)=>h.status==="worth_attention").length;
 const improving=hypotheses.filter((h:Row)=>h.status==="improving").length;
 const stillStuck=valid.filter((o:Row)=>o.kind==="still_stuck").length;
 const independentSuccess=valid.filter((o:Row)=>o.kind==="independent_success").length;
 // 近7天趋势
 const dates=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d;});
 const counts=dates.map(d=>valid.filter((o:Row)=>new Date(o.created_at).toDateString()===d.toDateString()).length),peak=Math.max(1,...counts);
 const point=(n:number,i:number)=>[42+i*66,160-n/peak*116];
 return <section className="feedbackPage">
 <div className="pageHeading"><h1>学习档案与诊断</h1><div className="filters"><select aria-label="反馈课程" value={course} onChange={e=>setCourse(e.target.value)}><option value="all">全部课程</option>{courses.map(c=><option key={c.course_id} value={c.course_id}>{c.display_name}</option>)}</select><select aria-label="反馈时间" value={days} onChange={e=>setDays(e.target.value)}><option value="14">近14天</option><option value="30">近30天</option><option value="all">全部</option></select></div></div>
 {/* 学习状态摘要 */}
 <div className="diagnosisSummary">
  <div className="summaryCard"><span className="summaryLabel">学习活跃度</span><strong className="summaryValue">{activeDays}<small>天</small></strong><span className="summarySub">{valid.length} 条学习记录</span></div>
  <div className="summaryCard warning"><span className="summaryLabel">需关注环节</span><strong className="summaryValue">{worthAttention}<small>个</small></strong><span className="summarySub">{stillStuck} 次自述仍有困难</span></div>
  <div className="summaryCard success"><span className="summaryLabel">改善中</span><strong className="summaryValue">{improving}<small>个</small></strong><span className="summarySub">{independentSuccess} 次独立完成</span></div>
  <div className="summaryCard"><span className="summaryLabel">主动反馈</span><strong className="summaryValue">{feedback.length}<small>次</small></strong><span className="summarySub">自我认知参与度</span></div>
 </div>
 {/* 薄弱点诊断 */}
 <section className="pilotCard diagnosisSection">
  <h2>薄弱点诊断</h2>
  <p className="diagnosisNote">基于你的学习交互记录生成，不是能力评分。新证据可以修正旧判断。</p>
  {hypotheses.length?<div className="diagnosisGrid">
   {hypotheses.map((h:Row)=>{
    const st=statusLabels[h.status]||statusLabels.emerging;
    const support=h.supporting?.length||0;
    const contra=h.contradicting?.length||0;
    const total=support+contra;
    const supportPct=total?Math.round(support/total*100):0;
    return <div key={h.id} className="diagnosisCard" style={{borderLeftColor:st.color}}>
     <div className="diagnosisHeader">
      <span className="diagnosisTheme">{themeNames[h.theme]||h.theme}</span>
      <span className="diagnosisStatus" style={{background:st.bg,color:st.color}}>{st.label}</span>
     </div>
     <p className="diagnosisStatement">{h.statement}</p>
     <div className="evidenceBar">
      <div className="evidenceSupport" style={{width:supportPct+"%"}} title={`支持证据 ${support} 条`}/>
      <div className="evidenceContra" style={{width:(100-supportPct)+"%"}} title={`相反证据 ${contra} 条`}/>
     </div>
     <div className="evidenceMeta">
      <span className="evidenceSupportText">支持 {support}</span>
      <span className="evidenceSufficiency">{h.sufficiency||"证据不足"}</span>
      <span className="evidenceContraText">相反 {contra}</span>
     </div>
     <p className="diagnosisDesc">{themeDesc[h.theme]||""}</p>
    </div>;
   })}
  </div>:<div className="emptyDiagnosis"><p>暂无诊断数据</p><p className="emptyHint">多与 Course Mirror 互动、主动反馈学习状态，系统会逐步形成你的学习画像</p></div>}
 </section>
 <div className="chartGrid">
  <section className="pilotCard"><h2>近7天学习活跃度</h2><svg className="trendChart" viewBox="0 0 470 205" role="img" aria-label={"近七天记录数量："+counts.join("、")}>
   {Array.from(new Set([0,Math.round(peak/2),peak])).map(tick=>{const n=tick/peak;return <g key={n}><line x1="38" x2="449" y1={160-116*n} y2={160-116*n} stroke="#e2e8f0"/><text x="8" y={165-116*n}>{tick}</text></g>;})}
   <polyline points={counts.map((n,i)=>point(n,i).join(",")).join(" ")} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
   {counts.map((n,i)=><g key={i}><circle cx={point(n,i)[0]} cy={point(n,i)[1]} r="5" fill="#2563eb" stroke="#fff" strokeWidth="2"><title>{dates[i].toLocaleDateString()}：{n}条</title></circle><text textAnchor="middle" x={point(n,i)[0]} y="192">{dates[i].getMonth()+1}/{dates[i].getDate()}</text></g>)}</svg></section>
  <section className="pilotCard"><h2>主动反馈分布</h2><div className="outcomeGrid">{Object.entries(outcomes).map(([key,label])=>{
   const count=feedback.filter((o:Row)=>o.kind===key).length;
   const max=Math.max(1,...Object.keys(outcomes).map(k=>feedback.filter((o:Row)=>o.kind===k).length));
   return <div key={key} className="outcomeBarItem"><div className="outcomeBarLabel"><span>{label}</span><strong>{count}</strong></div><div className="outcomeBarTrack"><div className="outcomeBarFill" style={{width:count/max*100+"%"}}/></div></div>;
  })}</div></section>
 </div>
 {error&&<p className="portalError" role="alert">{error}</p>}
 <section className="pilotCard"><h2>学习记录详情</h2>{!rows.length?<p>暂无记录</p>:<div className="feedbackRecords">{rows.map((o:Row)=><article key={o.id}><div><span>{themeNames[o.theme]||"学习反馈"}</span><time>{new Date(o.created_at).toLocaleDateString("zh-CN")}</time></div><p>{o.text}</p>{o.disputed?<p>已纠正：{o.correction}</p>:<button onClick={()=>{setSelected(o.id);setNote("");}}>纠正记录</button>}{selected===o.id&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{await onCorrect(o.id,note);setSelected(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label>更正说明<textarea required value={note} onChange={e=>setNote(e.target.value)}/></label><button disabled={busy}>保存</button><button type="button" onClick={()=>setSelected(null)}>取消</button></form>}</article>)}</div>}</section>
 </section>;
}
