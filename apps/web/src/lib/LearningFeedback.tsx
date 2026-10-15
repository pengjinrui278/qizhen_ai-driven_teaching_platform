"use client";
import {useEffect, useRef, useState} from "react";
import {liveApi} from "./Pilot";
import {OTHER_COLOR, SERIES, ChartTable, ShareBar, TrendColumns} from "./LearningCharts";
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
const dayKey = (value: string) => new Date(value).toDateString();
const dayLabel = (value: string) => new Date(value).toLocaleDateString("zh-CN", {month: "long", day: "numeric", weekday: "short"});
const clock = (value: string) => new Date(value).toLocaleTimeString("zh-CN", {hour: "2-digit", minute: "2-digit", hour12: false});

export default function LearningFeedback({memory, courses, notes = [], notesError = "", onCorrect, loadState="ready", loadError="", onRetry}: {memory: Row; courses: Row[]; notes?: Row[]; notesError?: string; onCorrect: (id: string, note: string) => Promise<void>;loadState?:"loading"|"ready"|"error";loadError?:string;onRetry?:()=>void}) {
 const [course, setCourse] = useState("all"), [days, setDays] = useState("14");
 const [showAllObservations,setShowAllObservations]=useState(false);
 const [selected, setSelected] = useState<string | null>(null), [note, setNote] = useState("");
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
 const opener = useRef<HTMLButtonElement | null>(null), root = useRef<HTMLElement | null>(null);

 const observations: Row[] = memory.observations || [];
 const cutoff = days === "all" ? 0 : Date.now() - Number(days) * 86400000;
 const inScope = (row: Row) => (course === "all" || row.course_id === course) && new Date(row.created_at).getTime() >= cutoff;
 const rows = observations.filter(inScope);
 const valid = rows.filter(o => !o.disputed), feedback = valid.filter(o => outcomes[o.kind]);
 const activities: Row[] = (memory.activities || []).filter(inScope);
 // 后端假设保持原样；不根据前端时段或活动次数推断能力。
 const hypotheses: Row[] = (memory.hypotheses || []).filter((h: Row) => course === "all" || h.course_id === course);
 const courseName = (id: string) => courses.find(c => c.course_id === id)?.display_name || id || "课程未标注";

 const scopedNotes = notes.filter(n => (course === "all" || n.course_id === course)
   && new Date(n.updated_at || n.created_at).getTime() >= cutoff);
 const weekAgo = Date.now() - 7 * 86400000;
 const starredNotes = scopedNotes.filter(n => n.starred);
 const agentNotes = scopedNotes.filter(n => n.source === "agent");
 const freshNotes = scopedNotes.filter(n => new Date(n.created_at).getTime() >= weekAgo);

 // 科目占比：只给前 4 个科目固定配色（配色槽位有上限，第 5 个起并入「其他」灰），
 // 顺序按科目 id 稳定排序 —— 颜色跟着科目走，不跟着当前排名走。
 const shareRows = (() => {
  const totals = new Map<string, number>();
  for (const row of activities) totals.set(row.course_id, (totals.get(row.course_id) || 0) + 1);
  for (const row of scopedNotes) totals.set(row.course_id, (totals.get(row.course_id) || 0) + 1);
  const sorted = [...totals.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, 4), tail = sorted.slice(4);
  const rows = head.map(([id, value], index) => ({key: id, label: courseName(id), value, color: SERIES[index]}));
  if (tail.length) rows.push({key: "__other", label: `其他 ${tail.length} 个科目`, value: tail.reduce((s, [, n]) => s + n, 0), color: OTHER_COLOR});
  return rows;
 })();

 // 活动趋势：近 8 周，对话轮次与笔记产出各一张小倍数柱图，共用一套刻度
 const weeks = Array.from({length: 8}, (_, i) => {
  const end = new Date(); end.setHours(23, 59, 59, 999); end.setDate(end.getDate() - (7 - i) * 7);
  const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
  return {start, end, label: `${start.getMonth() + 1}/${start.getDate()}`,
          full: `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`};
 });
 const inWeek = (value: string, w: typeof weeks[number]) => {
  const t = new Date(value).getTime(); return t >= w.start.getTime() && t <= w.end.getTime();
 };
 // 这张图自带 8 周窗口，所以只受课程筛选影响；两个序列必须用同一口径，
 // 否则「对话」按上方时间筛选、「笔记」不按，两张小倍数图会互相打架。
 const trendActivities = (memory.activities || []).filter((a: Row) => course === "all" || a.course_id === course);
 const trendNotes = notes.filter(n => course === "all" || n.course_id === course);
 const trendSeries = [
  {key: "chat", title: "每周对话轮次", color: SERIES[0],
   values: weeks.map(w => trendActivities.filter((a: Row) => inWeek(a.created_at, w)).length)},
  {key: "note", title: "每周笔记产出", color: SERIES[1],
   values: weeks.map(w => trendNotes.filter(n => inWeek(n.created_at, w)).length)},
 ];

 // 学习时间线：对话活动与笔记产出合并成一条流，按天分组
 const timeline = (() => {
  const items = [
   ...activities.map(a => ({id: "a:" + a.request_id, at: a.created_at, type: "chat" as const,
     text: a.summary || a.question || "课程对话", course: a.course_id, tag: null as string | null})),
   ...scopedNotes.map(n => ({id: "n:" + n.id, at: n.created_at, type: "note" as const,
     text: n.title, course: n.course_id, tag: n.source === "agent" ? "AI 整理" : "自写"})),
  ].filter(item => item.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const groups = new Map<string, typeof items>();
  for (const item of items) groups.set(dayKey(item.at), [...(groups.get(dayKey(item.at)) || []), item]);
  return [...groups.entries()].slice(0, 14);
 })();

 // 最近进展：只讲证据与观察的变化，不换算成能力
 const changedHypotheses = hypotheses.filter(h => h.status && h.status !== "emerging");
 const corrected = rows.filter(o => o.disputed);

 if(loadState==="loading")return <section className="learningFeedback"><p role="status">正在加载学习记录…</p></section>;
 if(loadState==="error")return <section className="learningFeedback"><p role="alert">学习记录加载失败：{loadError}</p><button onClick={onRetry}>重新加载</button></section>;
 return <section className="learningFeedback" ref={root} aria-label="学习档案与诊断">
  <header className="lf-heading"><div><h1>学习档案与诊断</h1></div><div className="lf-filters">
   <label><span className="lf-sr">反馈课程</span><select aria-label="反馈课程" value={course} disabled={busy} onChange={e => setCourse(e.target.value)}><option value="all">全部课程</option>{courses.map(c => <option key={c.course_id} value={c.course_id}>{c.display_name}</option>)}</select></label>
   <label><span className="lf-sr">反馈时间</span><select aria-label="反馈时间" value={days} disabled={busy} onChange={e => setDays(e.target.value)}><option value="14">近 14 天</option><option value="30">近 30 天</option><option value="all">全部时间</option></select></label>
  </div></header>

  <section className="lf-panel" aria-labelledby="lf-progress-title">
   <div className="lf-panel-head"><h2 id="lf-progress-title"><Icon kind="pulse"/>最近进展</h2>
    <span className="lf-badge lf-info">证据变化 {changedHypotheses.length + corrected.length} 处</span></div>
   {changedHypotheses.length || corrected.length ? <ul className="lf-progress-list">
    {corrected.map(o => <li key={"c" + o.id} data-kind="corrected">
     <span className="lf-badge lf-info">观察被更正</span>
     <p>{themes[o.theme] || "学习反馈"} · {o.correction || "已记录更正"}</p>
     <p className="lf-meta">{courseName(o.course_id)} · {new Date(o.created_at).toLocaleDateString("zh-CN")}</p></li>)}
    {changedHypotheses.map(h => <li key={"h" + h.id} data-kind={h.status}>
     <span className="lf-badge">{statuses[h.status] || h.status}</span>
     <p>{h.statement}</p>
     <p className="lf-meta">{courseName(h.course_id)} · 支持 {(h.supporting || []).length} 条 · 相反 {(h.contradicting || []).length} 条</p></li>)}
   </ul> : <div className="lf-empty"><p>所选范围没有出现新的证据变化</p><p>没有变化不等于没有学习；只说明还没有可核对的新证据。</p></div>}
   <p className="lf-meta">同期活动量：{activities.length} 轮对话 · {scopedNotes.length} 份笔记（活动量不代表掌握程度）。</p>
  </section>

  <section className="lf-panel" aria-labelledby="lf-share-title">
   <div className="lf-panel-head"><h2 id="lf-share-title"><Icon kind="chart"/>各科目学习占比</h2>
    <span className="lf-meta">按对话轮次 + 笔记份数计</span></div>
   {shareRows.length ? <>
    <ShareBar rows={shareRows}/>
    <ChartTable caption="各科目学习占比" head={["科目", "条数", "占比"]}
     rows={shareRows.map(row => {const total = shareRows.reduce((s, r) => s + r.value, 0);
      return [row.label, row.value, `${Math.round(row.value / total * 100)}%`];})}/>
   </> : <div className="lf-empty"><p>所选范围暂无活动</p><p>在课程里提问或生成笔记后，这里会显示精力分布。</p></div>}
  </section>

  <section className="lf-panel" aria-labelledby="lf-trend-title">
   <div className="lf-panel-head"><h2 id="lf-trend-title"><Icon kind="chart"/>活动趋势（近 8 周）</h2></div>
   <TrendColumns weeks={weeks} series={trendSeries}/>
   <ChartTable caption="活动趋势" head={["周", "对话轮次", "笔记产出"]}
    rows={weeks.map((w, i) => [w.full, trendSeries[0].values[i], trendSeries[1].values[i]])}/>
  </section>

  <section className="lf-panel" aria-labelledby="lf-notes-title">
   <div className="lf-panel-head"><h2 id="lf-notes-title"><Icon kind="file"/>笔记产出</h2>
    <a href={"/student/notes"}>打开我的笔记</a></div>
   {notesError && <p className="lf-error" role="alert">{notesError}</p>}
   <ul className="lf-kpis">
    {[["笔记总数", scopedNotes.length, "所选范围"], ["近 7 天新增", freshNotes.length, "按创建时间"],
      ["标记为重要", starredNotes.length, "复习优先看"], ["AI 整理", agentNotes.length, "由 agent 生成"]].map(([label, value, hint]) =>
     <li key={String(label)}><span>{label}</span><strong>{value}</strong><span className="lf-meta">{hint}</span></li>)}
   </ul>
   {scopedNotes.length ? <ul className="lf-note-list">{scopedNotes.slice(0, 6).map(n =>
    <li key={n.id}><a href={"/student/notes?note=" + encodeURIComponent(n.id)}>{n.starred ? "★ " : ""}{n.title}</a>
     <span className="lf-meta">{courseName(n.course_id)} · {n.folder_path || "科目根"} · {n.source === "agent" ? "AI 整理" : "自写"}</span></li>)}</ul>
    : <div className="lf-empty"><p>所选范围暂无笔记</p><p>可以在对话里让 AI 按章节生成一份。</p></div>}
  </section>

  <section className="lf-panel" aria-labelledby="lf-timeline-title">
   <div className="lf-panel-head"><h2 id="lf-timeline-title"><Icon kind="clock"/>学习时间线</h2>
    <span className="lf-meta">对话与笔记合并</span></div>
   {timeline.length ? <ol className="lf-timeline">{timeline.map(([day, items]) =>
    <li key={day}><h3>{dayLabel(items[0].at)}</h3><ul>{items.slice(0, 12).map(item =>
     <li key={item.id} data-type={item.type}><span className="lf-badge">{item.type === "note" ? "笔记" : "对话"}</span>
      <p>{item.text}</p>
      <p className="lf-meta">{courseName(item.course)} · {clock(item.at)}{item.tag ? ` · ${item.tag}` : ""}</p></li>)}</ul></li>)}
   </ol> : <div className="lf-empty"><p>所选范围暂无学习活动</p><p>去课程里提问，或让 AI 生成一份笔记。</p></div>}
  </section>

  <section className="lf-panel" aria-labelledby="lf-observations-title">
   <div className="lf-panel-head"><h2 id="lf-observations-title"><Icon kind="pulse"/>持续学习观察</h2><span className="lf-badge lf-info">{hypotheses.length} 项候选观察</span></div>
   {hypotheses.length ? <div className="lf-diagnoses">{(showAllObservations?hypotheses:hypotheses.slice(0,3)).map(h => {
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
  {hypotheses.length>3&&<button onClick={()=>setShowAllObservations(v=>!v)}>{showAllObservations?"收起观察":"查看更多观察"}</button>}

  <details className="lf-feedback-details"><summary>反馈统计与原始记录</summary>
  <section className="lf-panel" aria-labelledby="lf-outcome-title"><h2 id="lf-outcome-title"><Icon kind="clock"/>主动反馈分布</h2>
   {feedback.length ? <ul className="lf-outcomes">{Object.entries(outcomes).map(([key, label]) => {const count = feedback.filter(o => o.kind === key).length; return <li key={key} data-kind={key}><span>{label}</span><div className="lf-track" aria-hidden="true"><span style={{width: `${count / feedback.length * 100}%`}}/></div><strong>{count}<span className="lf-sr"> 条</span></strong></li>;})}</ul> : <div className="lf-empty"><p>暂无主动反馈</p><p>只展示实际记录，不生成示例比例。</p></div>}
  </section>
  <section className="lf-panel" aria-labelledby="lf-records-title"><div className="lf-panel-head"><h2 id="lf-records-title"><Icon kind="file"/>学习记录与更正</h2><span className="lf-meta">所选时段 {rows.length} 条</span></div>
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
  </details>
 </section>;
}
