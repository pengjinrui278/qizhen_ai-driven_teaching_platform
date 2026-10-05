"use client";
type Row=Record<string,any>;
const states:Row={answered:"已完成问答",pending:"正在生成",failed:"生成失败，可继续",blocked:"回答未通过核对",no_completed_answer:"尚无完整回答",unconfirmed:"等待确认生成状态"};
export default function LearningActivities({activities,courses}:{activities:Row[];courses:Row[]}){
 const groups=new Map<string,Row[]>();for(const a of activities){const key=a.attempt_id;groups.set(key,[...(groups.get(key)||[]),a]);}
 const completed=activities.filter(a=>a.status==="answered").length;
 return <section className="lf-panel lf-conversations" aria-label="课程会话学习记录"><div className="lf-panel-head"><h2>课程学习进展</h2><span>{groups.size} 次会话 · {completed} 轮问答</span></div>
 <p className="lf-note">问答完成不等于掌握知识；你的完成反馈与可核验的学习证据另行记录。</p>
 {!activities.length?<p>当前范围暂无课程会话。</p>:Array.from(groups.entries()).map(([id,rows],i)=><details className="lf-session" key={id} open={i===0}><summary><strong>{rows[0].summary||"课程讨论"}</strong><span>{courses.find(c=>c.course_id===rows[0].course_id)?.display_name||rows[0].course_id} · {rows.length} 条</span></summary><ol>{rows.map((a,j)=><li key={a.request_id||id}><div className="lf-record-head"><span className="lf-badge">{states[a.status]||"状态待确认"}</span><time>{new Date(a.created_at).toLocaleString("zh-CN")}</time></div><p>{a.summary}</p>{a.topics?.length>0&&<p className="lf-meta">涉及主题（文本提取）：{a.topics.join("、")}</p>}<details><summary>查看问题</summary><p className="lf-question">{a.question}</p>{a.original_question&&a.original_question!==a.question&&<p className="lf-question">会话原题：{a.original_question}</p>}</details>{a.citations?.length>0&&<details><summary>教材与知识出处</summary>{a.citations.map((c:Row,n:number)=><p key={n}>{c.locator||c.knowledge_id||c.source_id}</p>)}</details>}<a href={"/student/learn?mode=live&course="+encodeURIComponent(a.course_id)+"&attempt="+encodeURIComponent(id)+(a.request_id?"#turn-"+encodeURIComponent(a.request_id):"")}>回到对应会话</a></li>)}</ol></details>)}
 </section>;
}
