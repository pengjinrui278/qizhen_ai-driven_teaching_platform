"use client";
type Row=Record<string,any>;
export default function ProblemEditor({value,onChange,knowledge=[]}:{value:string;onChange:(s:string)=>void;knowledge?:Row[]}){
 let doc:Row;try{doc=JSON.parse(value);}catch{return <p role="alert">无法加载题目，请重新选择。</p>;}
 const update=(patch:Row)=>onChange(JSON.stringify({...doc,...patch},null,2));
 const solution=(i:number,patch:Row)=>update({solution_paths:doc.solution_paths.map((s:Row,j:number)=>i===j?{...s,...patch}:s)});
 return <div className="friendlyEditor">
 <label>题目正文<textarea rows={4} value={doc.statement||""} onChange={e=>update({statement:e.target.value})} required/></label>
 {knowledge.length>0&&<label>关联知识点<select multiple value={doc.knowledge_ids||[]} onChange={e=>update({knowledge_ids:Array.from(e.target.selectedOptions,o=>o.value)})}>{knowledge.map(k=><option key={k.id} value={k.id}>{k.title}</option>)}</select></label>}
 <h3>参考解法</h3>{(doc.solution_paths||[]).map((s:Row,i:number)=><fieldset key={i}><legend>解法 {i+1}</legend>
 <label>解法策略<input value={s.strategy||""} onChange={e=>solution(i,{strategy:e.target.value})}/></label>
 <label>推导步骤（每行一步）<textarea rows={5} value={(s.key_steps||[]).join("\n")} onChange={e=>solution(i,{key_steps:e.target.value.split("\n")})}/></label></fieldset>)}
 <button type="button" onClick={()=>update({solution_paths:[...(doc.solution_paths||[]),{path_id:"path_"+Date.now(),strategy:"",key_steps:[]}]})}>添加一种参考解法</button>
 <h3>教学要点</h3>{(doc.hint_ladder||[]).map((h:Row,i:number)=><label key={i}>第 {i+1} 条参考<textarea rows={2} value={h.content||""} onChange={e=>update({hint_ladder:doc.hint_ladder.map((v:Row,j:number)=>i===j?{...v,content:e.target.value}:v)})}/></label>)}
 <button type="button" onClick={()=>update({hint_ladder:[...(doc.hint_ladder||[]),{level:(doc.hint_ladder||[]).length+1,type:"direction",content:""}]})}>添加教学要点</button>
 <label>常见错误（每行一项）<textarea rows={3} value={(doc.common_mistakes||[]).join("\n")} onChange={e=>update({common_mistakes:e.target.value.split("\n")})}/></label>
 </div>;
}
