"use client";
import {useRef, useState} from "react";
import "./learning-feedback.css";
type Row = Record<string, any>;
const themes: Row = {conditions: "定理条件", quantifiers: "量词与依赖", construction: "辅助构造"};
const outcomes: Record<string,string> = {continued: "能够继续", solved: "自报完成", still_stuck: "仍有困难", independent_success: "自报独立完成"};
const kinds: Row = {...outcomes, student_question: "明确提出困惑", artifact_review: "作品判断", ta_review: "作品判断", independent_test: "独立任务记录"};
const sources: Row = {interaction: "课程交互", self_report: "学生自述", artifact_review: "作品审阅", ta_review: "教学团队审阅"};
const strengths: Row = {weak: "弱", medium: "中等", strong: "强"};
const statuses: Row = {worth_attention: "待核对", improving: "出现相反证据", emerging: "观察中", weakened: "原判断减弱"};
function Icon({kind}: {kind: "pulse" | "chart" | "clock" | "file"}) {
 const paths = {pulse: "M22 12h-4l-3 9L9 3l-3 9H2", chart: "M3 3v18h18M7 16v-5m5 5V7m5 9v-3", clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 6v6l4 2", file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6"};
 return <svg className="lf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}
function sourceText(row: Row) {return `来源：${sources[row.source] || row.source || "未标注"} · 证据强度：${strengths[row.strength] || row.strength || "未标注"}`;}

export default function LearningFeedback({memory, courses, onCorrect}: {memory: Row; courses: Row[]; onCorrect: (id: string, note: string) => Promise<void>}) {
 const [course, setCourse] = useState("all"), [days, setDays] = useState("14");
 const [selected, setSelected] = useState<string | null>(null), [note, setNote] = useState("");
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
 const opener = useRef<HTMLButtonElement | null>(null), root = useRef<HTMLElement | null>(null);
 const observations: Row[] = memory.observations || [];
 const cutoff = days === "all" ? 0 : Date.now() - Number(days) * 86400000;
 const rows = observations.filter(o => (course === "all" || o.course_id === course) && new Date(o.created_at).getTime() >= cutoff);
 const valid = rows.filter(o => !o.disputed), feedback = valid.filter(o => outcomes[o.kind]);
 // 后端假设保持原样；不根据前端时段或活动次数推断能力。
 const hypotheses: Row[] = (memory.hypotheses || []).filter((h: Row) => course === "all" || h.course_id === course);
 const dates = Array.from({length: 7}, (_, i) => {const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d;});
 const counts = dates.map(d => valid.filter(o => new Date(o.created_at).toDateString() === d.toDateString()).length), peak = Math.max(1, ...counts);
 const courseName = (id: string) => courses.find(c => c.course_id === id)?.display_name || id || "课程未标注";
 return <section className="learningFeedback" ref={root} aria-label="学习档案与诊断">
  <header className="lf-heading"><div><h1>学习档案与诊断</h1><p>基于学习证据的持续观察，可核对、可更正。</p></div><div className="lf-filters">
   <label><span className="lf-sr">反馈课程</span><select aria-label="反馈课程" value={course} disabled={busy} onChange={e => setCourse(e.target.value)}><option value="all">全部课程</option>{courses.map(c => <option key={c.course_id} value={c.course_id}>{c.display_name}</option>)}</select></label>
   <label><span className="lf-sr">反馈时间</span><select aria-label="反馈时间" value={days} disabled={busy} onChange={e => setDays(e.target.value)}><option value="14">近 14 天</option><option value="30">近 30 天</option><option value="all">全部时间</option></select></label>
  </div></header>
  <section className="lf-panel" aria-labelledby="lf-observations-title">
   <div className="lf-panel-head"><h2 id="lf-observations-title"><Icon kind="pulse"/>持续学习观察</h2><span className="lf-badge lf-info">{hypotheses.length} 项候选观察</span></div>
   <p className="lf-note">不是能力评分或已确认诊断。以下依据所选课程的历史有效证据；时间筛选仅影响活动图表和记录。</p>
   {hypotheses.length ? <div className="lf-diagnoses">{hypotheses.map(h => {
    const status = statuses[h.status] ? h.status : "emerging", support: string[] = h.supporting || [], contra: string[] = h.contradicting || [];
    return <article key={h.id} className="lf-diagnosis" data-status={status}>
     <div className="lf-card-head"><h3>{themes[h.theme] || h.theme || "学习环节"}</h3><span className="lf-badge">{statuses[status]}</span></div>
     <p>{h.statement}</p><p className="lf-meta">{courseName(h.course_id)} · {h.sufficiency || "证据不足"}</p><p className="lf-meta">支持 {support.length} 条 · 相反 {contra.length} 条</p>
     <details className="lf-evidence"><summary>查看证据来源</summary>{support.length + contra.length ? <ul>{[...new Set([...support, ...contra])].map(id => {
      const record = observations.find(o => o.id === id && o.course_id === h.course_id);
      return <li key={id}>{record ? <><strong>{record.disputed ? "已更正／撤回" : support.includes(id) ? "支持记录" : "相反记录"}</strong><p>{record.text}</p><p className="lf-meta">{sourceText(record)} · {new Date(record.created_at).toLocaleDateString("zh-CN")}</p>{record.disputed && <p>更正说明：{record.correction}</p>}</> : "来源记录暂不可用，请核对后再解读此观察。"}</li>;
     })}</ul> : <p>暂无可定位的来源记录。</p>}</details>
    </article>;
   })}</div> : <div className="lf-empty"><p>暂无候选观察</p><p>有足够且可核对的证据后再形成观察；没有记录不代表能力不足。</p></div>}
  </section>
  <div className="lf-charts">
   <section className="lf-panel" aria-labelledby="lf-activity-title"><h2 id="lf-activity-title"><Icon kind="chart"/>近 7 天学习活动</h2><p className="lf-note">有效记录数量，仅描述活动，不代表掌握程度。</p>
    {counts.some(Boolean) ? <ol className="lf-activity" aria-label="每日有效记录数">{counts.map((n, i) => <li key={i} aria-label={`${dates[i].getMonth() + 1}月${dates[i].getDate()}日：${n} 条`}><span className="lf-bar-count">{n}</span><div className="lf-bar-space" aria-hidden="true"><span style={{height: `${n / peak * 100}%`}}/></div><span className="lf-day">{dates[i].getMonth() + 1}/{dates[i].getDate()}</span></li>)}</ol> : <div className="lf-empty"><p>近 7 天暂无有效记录</p><p>更正或撤回的记录不计入活动数量。</p></div>}
   </section>
   <section className="lf-panel" aria-labelledby="lf-outcome-title"><h2 id="lf-outcome-title"><Icon kind="clock"/>主动反馈分布</h2><p className="lf-note">所选时段共 {feedback.length} 条自述，独立性与正确性尚需验证。</p>
    {feedback.length ? <ul className="lf-outcomes">{Object.entries(outcomes).map(([key, label]) => {const count = feedback.filter(o => o.kind === key).length; return <li key={key} data-kind={key}><span>{label}</span><div className="lf-track" aria-hidden="true"><span style={{width: `${count / feedback.length * 100}%`}}/></div><strong>{count}<span className="lf-sr"> 条</span></strong></li>;})}</ul> : <div className="lf-empty"><p>暂无主动反馈</p><p>只展示实际记录，不生成示例比例。</p></div>}
   </section>
  </div>
  <section className="lf-panel" aria-labelledby="lf-records-title"><div className="lf-panel-head"><h2 id="lf-records-title"><Icon kind="file"/>学习记录时间线</h2><span className="lf-meta">所选时段 {rows.length} 条</span></div>
   {notice && <p className="lf-notice" role="status">{notice}</p>}
   {!rows.length ? <div className="lf-empty"><p>所选范围暂无学习记录</p><p>可以调整课程或时间筛选。</p></div> : <ol className="lf-records">{rows.map(o => <li key={o.id}><article className="lf-record" tabIndex={-1} data-record-id={o.id} data-disputed={o.disputed ? "true" : "false"}>
    <div className="lf-record-head"><span className="lf-badge" data-kind={o.kind}>{kinds[o.kind] || "学习记录"}</span><h3>{themes[o.theme] || "学习反馈"}</h3><time dateTime={o.created_at}>{new Date(o.created_at).toLocaleString("zh-CN", {month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"})}</time></div>
    <p className="lf-record-text">{o.text}</p><p className="lf-meta">{courseName(o.course_id)} · {sourceText(o)}</p>
    {o.disputed ? <p className="lf-correction"><strong>已更正／撤回观察</strong> · {o.correction || "已记录更正"}</p> : <button type="button" className="lf-correct-button" disabled={busy} onClick={e => {opener.current = e.currentTarget; setSelected(o.id); setNote(""); setError(""); setNotice("");}}>纠正记录<span className="lf-sr">：{themes[o.theme] || "学习反馈"}</span></button>}
    {selected === o.id && !o.disputed && <form className="lf-form" aria-label="更正学习记录" aria-busy={busy} onSubmit={async e => {
     e.preventDefault(); if (busy || !note.trim()) return; setBusy(true); setError("");
     try {await onCorrect(o.id, note.trim()); setSelected(null); setNotice("更正已保存，观察与活动记录已刷新。"); requestAnimationFrame(() => {Array.from(root.current?.querySelectorAll<HTMLElement>("[data-record-id]") || []).find(el => el.dataset.recordId === o.id)?.focus();});}
     catch (e) {setError(e instanceof Error ? e.message : "保存失败，请稍后重试。");} finally {setBusy(false);}
    }}><label>更正说明<textarea aria-label="更正说明" autoFocus required maxLength={1000} value={note} disabled={busy} onChange={e => setNote(e.target.value)} aria-describedby="lf-correction-help"/></label><p id="lf-correction-help" className="lf-note">说明哪里需要更正。提交后，此观察将不再参与当前推断；原记录仍可查看。</p>
     {error && <p className="lf-error" role="alert">{error}</p>}<div className="lf-form-actions"><button type="submit" className="lf-save" disabled={busy || !note.trim()}>{busy ? "保存中…" : error ? "重试保存" : "保存更正"}</button><button type="button" disabled={busy} onClick={() => {setSelected(null); setError(""); opener.current?.focus();}}>取消</button></div>
    </form>}
   </article></li>)}</ol>}
  </section>
 </section>;
}
