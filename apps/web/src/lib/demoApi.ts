// Browser-only, synthetic review sandbox. Never sends requests or writes real accounts.
export type DemoRow=Record<string,any>;
export type PortalRole="student"|"teacher";
const KEY="mathmirror-interface-review-v1";
export const demoCourses=[
 {course_id:"mathematical_analysis",display_name:"数学分析",topic:"数列极限 · 量词与条件",symbol:"ε",color:"sage"},
 {course_id:"linear_algebra_analytic_geometry",display_name:"高等代数与解析几何",topic:"线性方程组 · 空间结构",symbol:"A",color:"blue"},
 {course_id:"university_physics",display_name:"大学物理",topic:"运动学 · 量纲分析",symbol:"ω",color:"sand"},
 {course_id:"point_set_topology",display_name:"点集拓扑",topic:"开集 · 连续映射",symbol:"τ",color:"rose"},
 {course_id:"ordinary_differential_equations",display_name:"常微分方程",topic:"初值问题 · 解的核验",symbol:"y′",color:"violet"}
];
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
function copy<T>(v:T):T{return JSON.parse(JSON.stringify(v));}
export const demoProblems:DemoRow[]=[
 {id:"review_limit",course_id:"mathematical_analysis",statement:"用定义证明：$\\displaystyle\\lim_{n\\to\\infty}\\frac1n=0$。请明确 $N$ 如何依赖 $\\varepsilon$。",
  hints:["把目标写为：给定任意 $\\varepsilon>0$，后面的项与零的距离都要小于它。","把 $1/n<\\varepsilon$ 改写为关于 $n$ 的条件，再选择一个足够大的整数。"],
  steps:["任取 $\\varepsilon>0$，取 $N=\\lceil1/\\varepsilon\\rceil$。","若整数 $n>N$，则 $n>1/\\varepsilon$，故 $|1/n-0|<\\varepsilon$。","这对任意 $\\varepsilon>0$ 成立，因此极限为零。"]},
 {id:"review_bounded",course_id:"mathematical_analysis",statement:"设数列 $\\{a_n\\}$ 有界且 $b_n\\to0$。证明 $a_nb_n\\to0$。",
  hints:["有界性提供了一个怎样的、与 $n$ 无关的常数？","先用统一上界控制乘积，再利用另一因子趋于零。"],
  steps:["存在 $M>0$ 使所有 $n$ 都满足 $|a_n|\\le M$。","任给 $\\varepsilon>0$，因 $b_n\\to0$，存在 $N$ 使 $n>N$ 时 $|b_n|<\\varepsilon/M$。","于是 $|a_nb_n|\\le M|b_n|<\\varepsilon$，结论成立。"]},
 {id:"review_unique",course_id:"mathematical_analysis",statement:"证明收敛数列的极限唯一。你在何处用到了两个收敛条件？",
  hints:["若有两个不同的极限，能否用同一个靠后的数列项把它们联系起来？","比较两极限的固定距离与它们到该数列项的距离之和。"],
  steps:["设 $a_n\\to A$ 且 $a_n\\to B$。若 $d=|A-B|>0$，取 $\\varepsilon=d/3$。","两个收敛条件分别给出 $N_1,N_2$。对 $n>\\max(N_1,N_2)$，两项误差都小于 $d/3$。","三角不等式给出 $d\\le|A-a_n|+|a_n-B|<2d/3$，矛盾。故 $A=B$。"]},
 {id:"review_linear",course_id:"linear_algebra_analytic_geometry",statement:"解方程组 $x+2y=5,\\ 2x+y=4$，并代回检验。",
  hints:["尝试消去一个未知量。","消元后先求一个未知量，再回代。"],steps:["第二式减第一式的两倍得 $-3y=-6$，所以 $y=2$。","回代得 $x=1$；两式左侧分别为5和4。"]},
 {id:"review_physics",course_id:"university_physics",statement:"半径 $R=0.5\\,\\mathrm m$，角位置 $\\theta(t)=2t^3-t$。求 $t=1\\,\\mathrm s$ 时切向与法向加速度大小。",
  hints:["先求角速度和角加速度。","切向量涉及角加速度，法向量涉及角速度的平方。"],steps:["$\\omega=6t^2-1$，$\\alpha=12t$；在该时刻分别为5和12。","$a_t=R|\\alpha|=6\\,\\mathrm{m/s^2}$，$a_n=R\\omega^2=12.5\\,\\mathrm{m/s^2}$。"]},
 {id:"review_topology",course_id:"point_set_topology",statement:"验证 $X=\\{1,2\\}$ 上的集合族 $\\tau=\\{\\varnothing,\\{1\\},X\\}$ 是拓扑。",
  hints:["依次检查空集、全集和交并封闭。","这里集合族有限，可枚举任意子族的并及有限交。"],steps:["空集和全集都在集合族中。","这些集合按包含关系排成链，任意子族的并与有限非空交都是其中一个集合；空族交为全集。","三条公理均满足。"]},
 {id:"review_ode",course_id:"ordinary_differential_equations",statement:"求解初值问题 $y'=2t,\\ y(0)=1$ 并检验。",
  hints:["对右侧积分后保留积分常数。","利用初值确定常数，再核对微分方程。"],steps:["积分得 $y=t^2+C$，初值给出 $C=1$。","$y=t^2+1$ 的导数为 $2t$ 且 $y(0)=1$。"]}
].map(p=>({...p,problem_id:p.id,coursepack_id:"demo-"+p.course_id,review:"needs_ta_review",max_hint_level:p.hints.length,
 type:"problem",provenance:"synthetic_interface_fixture",answer_type:"proof",knowledge_ids:[],common_mistakes:[],
 rights:{allowed_for_runtime:true,allowed_for_rag:true,allowed_for_eval:true,allowed_for_training:false},
 hint_ladder:p.hints.map((content:string,i:number)=>({level:i+1,type:"direction",content})),
 solution_paths:[{path_id:"review",strategy:"定义法",key_steps:p.steps}]}));
function seed(){
 const observations=[0,1].map((n)=>({id:"sample-observation-"+n,course_id:"mathematical_analysis",attempt_id:"sample-"+n,kind:"student_question",theme:"quantifiers",
 text:n?"样例记录：我不知道 N 可以依赖哪些量。":"样例记录：我不明白为什么先给定 ε 再选择 N。",direction:"support",source:"合成样例",strength:"weak",disputed:false,created_at:now()}));
 return {users:{student:{id:"demo-student",nickname:"学习者 · 演示",role:"student",status:"active",retention_days:180},teacher:{id:"demo-teacher",nickname:"教学团队 · 演示",role:"teacher",status:"active",retention_days:180}},
 attempts:[{id:"sample-attempt",course_id:"mathematical_analysis",problem:{text:demoProblems[0].statement,problem_id:demoProblems[0].id},created_at:now(),events:[]}],
 observations,boxes:[{id:"sample-sandbox",course_id:"mathematical_analysis",title:"数列极限 · 第一次习题",assignment:"证明 1/n 趋于0，并说明 N 的选取依赖。",class_label:"数分研讨班 · 合成",class_size:3,status:"open",join_code:"REVIEW26",retention_hours:3,created_at:now(),expires_at:new Date(Date.now()+10800000).toISOString(),purged:false}],
 submissions:[{id:"sample-work-1",workspace_id:"sample-sandbox",participant:"样例 A",source:"artifact",synthetic:true,text:"任意 ε>0，取 N=10。当 n>N 时，1/n<ε。所以极限为零。",review:{candidate:{text:"固定的 N=10 无法对应任意小的 ε，请核对 N 与 ε 的依赖。",model:"预置样例"}}},
 {id:"sample-work-2",workspace_id:"sample-sandbox",participant:"样例 B",source:"artifact",synthetic:true,text:"任给 ε>0，取 N=⌈1/ε⌉。当 n>N 时，1/n<ε。因此极限为0。",review:{}},
 {id:"sample-work-3",workspace_id:"sample-sandbox",participant:"样例 C",source:"independent",synthetic:true,text:"独立任务样例：对 2/n，给定 ε 后选 N=⌈2/ε⌉，则 n>N 时误差小于 ε。",review:{}}],
 findings:[{finding_id:"sample-finding",workspace_id:"sample-sandbox",phenomenon:"可在习题课讨论 N 为什么需要随 ε 改变。",ta_status:"candidate",teacher_status:"pending",basis:{synthetic:true,sample_submissions:3}}],
 documents:copy(demoProblems).map(p=>({...p,review:{status:"needs_ta_review"}})),revisions:[]};
}
function read(){try{const s=localStorage.getItem(KEY);return s?JSON.parse(s):seed();}catch{return seed();}}
function write(s:any){localStorage.setItem(KEY,JSON.stringify(s));}
export function resetDemo(){localStorage.removeItem(KEY);}
function memory(s:any){const obs=s.observations.filter((o:any)=>!o.disputed);return {observations:s.observations,hypotheses:obs.length?[
 {id:"sample-hypothesis",course_id:"mathematical_analysis",statement:"在量词次序与 N 的依赖上，可能需要再核对一次",status:obs.length>=2?"worth_attention":"emerging",sufficiency:"合成示例，不是个人能力结论",supporting:obs.map((o:any)=>o.id),contradicting:[]}]:[]};}
function report(s:any,box:any){if(box.report)return box.report;return {title:box.title,participants:0,artifact_participants:0,independent_participants:0,confirmed_issues:0,class_size:box.class_size,synthetic_submissions:s.submissions.filter((x:any)=>x.workspace_id===box.id).length,coverage_note:"没有真实学生数据。当前3份作品为合成界面样例。",channel_note:"示例作品与真实教学统计隔离，不据此评估教学效果。",teaching_actions:[],findings:s.findings.filter((f:any)=>f.workspace_id===box.id&&f.teacher_status==="accepted")};}
export async function demoApi(role:PortalRole,path:string,method="GET",body:any={}):Promise<any>{
 const s=read(),parts=path.split("?")[0].split("/").filter(Boolean),uid=parts[1],action=parts[2];let result:any;
 if(s.users[role].status==="frozen"&&method!=="GET"&&!["/me","/me/delete","/auth/logout"].includes(path))throw Error("演示档案已冻结，请先在档案设置恢复更新。");
 const box=s.boxes.find((b:any)=>b.id===uid);
 if(path==="/config")return {environment:"demo",model:"预置交互样例 · 非真实AI",default_retention_hours:3};
 if(path==="/me"&&method==="GET")return s.users[role];
 if(path==="/courses")return demoCourses;
 if(path.startsWith("/problems")){const course=new URLSearchParams(path.split("?")[1]).get("course_id");return demoProblems.filter(p=>p.course_id===course);}
 if(path==="/memory")return memory(s);
 if(parts[0]==="observations"){const o=s.observations.find((o:any)=>o.id===decodeURIComponent(uid));if(!o)throw Error("观察不存在");Object.assign(o,body,{correction:body.note});result=memory(s);}
 else if(path==="/attempts"&&method==="GET")return s.attempts;
 else if(path==="/attempts"&&method==="POST"){
 const p=demoProblems.find(p=>p.id===body.problem_id);
 result={id:id(),course_id:body.course_id,problem:{problem_id:p?.id,text:p?.statement||body.text},sandbox_id:body.sandbox_id,created_at:now(),events:[]};s.attempts.unshift(result);
 }else if(parts[0]==="attempts"){
 const a=s.attempts.find((a:any)=>a.id===uid);if(!a)throw Error("会话不存在");
 if(!action)return a;
 if(action==="feedback"){s.observations.unshift({id:id(),course_id:a.course_id,attempt_id:a.id,theme:body.theme,text:"反馈："+({continued:"提示后可以继续",solved:"自报完成",still_stuck:"仍需核对",independent_success:"自报独立完成"} as any)[body.outcome],direction:body.outcome==="still_stuck"?"support":body.outcome==="independent_success"?"contradict":"neutral",source:"合成反馈",strength:"weak",created_at:now()});result=memory(s);}
 else{
 throw Error("课程助手暂不可用，请稍后重试。");
 }
 }else if(path==="/sandboxes"&&method==="GET")return s.boxes.map((b:any)=>({...b,owner:role==="teacher",join_code:role==="teacher"?b.join_code:null}));
 else if(path==="/sandboxes"&&method==="POST"){result={...body,id:id(),status:"open",created_at:now(),expires_at:new Date(Date.now()+body.retention_hours*3600000).toISOString(),join_code:"DEMO"+Math.random().toString(36).slice(2,6).toUpperCase(),purged:false};s.boxes.unshift(result);}
 else if(path==="/sandboxes/join"){if(!s.boxes.some((b:any)=>b.join_code===body.code.trim().toUpperCase()&&b.status==="open"))throw Error("示例加入码无效，可使用 REVIEW26");result={ok:true};}
 else if(parts[0]==="sandboxes"){
 if(!box)throw Error("作业不存在");
 if(action==="report")return report(s,box);
 if(action==="submissions"&&method==="GET")return s.submissions.filter((x:any)=>x.workspace_id===uid);
 if(action==="findings")return s.findings.filter((x:any)=>x.workspace_id===uid);
 if(action==="submissions"){result={id:id(),workspace_id:uid,text:body.text,source:body.source,synthetic:true,participant:body.participant_username||"当前演示学习者",review:{}};s.submissions.unshift(result);}
 else if(action==="insights"){throw Error("暂时无法生成汇总，请稍后重试。");}
 else if(action==="close"||method==="DELETE"){box.report=report(s,box);box.status="closed";if(method==="DELETE"){box.purged=true;box.assignment="";s.submissions=s.submissions.filter((x:any)=>x.workspace_id!==uid);s.findings=s.findings.filter((x:any)=>x.workspace_id!==uid);}result=box.report;}
 else if(action==="retention"){box.retention_hours=body.retention_hours;box.expires_at=new Date(new Date(box.created_at).getTime()+body.retention_hours*3600000).toISOString();result=box;}
 else result={ok:true};
 }else if(parts[0]==="submissions"){
 const sub=s.submissions.find((x:any)=>x.id===uid);if(!sub)throw Error("作品不存在");
 if(action==="preanalysis"){throw Error("辅助批改暂不可用，请稍后重试。");}
 else{sub.review={...sub.review,...body};result={ok:true};}
 }else if(parts[0]==="findings"){const f=s.findings.find((x:any)=>x.finding_id===uid);if(body.stage==="teacher"&&f.ta_status!=="confirmed")throw Error("请先完成助教确认");f[body.stage==="ta"?"ta_status":"teacher_status"]=body.decision;result={ok:true};}
 else if(path==="/builder")return {packs:demoCourses.map(c=>({id:"demo-"+c.course_id,course_id:c.course_id,problems:s.documents.filter((p:any)=>p.course_id===c.course_id),knowledge:[]})),revisions:s.revisions,evaluation:{passed:0,total:0,scope:"界面样例，不运行真实工具回归；切换真实账号可执行。",cases:[]}};
 else if(path==="/contributions"){result={id:id(),coursepack_id:"demo-"+body.course_id,status:"candidate",content:body};s.revisions.unshift(result);}
 else if(parts[0]==="builder"){
 if(uid==="candidates"){const rev=s.revisions.find((x:any)=>x.id===action);rev.status=body.decision;result=rev;}
 else if(uid==="revisions"){const rev=s.revisions.find((x:any)=>x.id===action);const i=s.documents.findIndex((p:any)=>p.id===rev.content.before.id);s.documents[i]=rev.content.before;result={ok:true};}
 else{if(!body.document.solution_paths?.length||!body.document.hint_ladder?.length)throw Error("请补齐参考解法和教学要点");const old=s.documents.find((p:any)=>p.id===body.document.id);const after={...body.document,course_id:uid.replace("demo-",""),review:{status:"approved"}};s.documents=s.documents.filter((p:any)=>p.id!==after.id);s.documents.push(after);result={id:id(),status:"published",coursepack_id:uid,content:{before:old||null,after}};s.revisions.unshift(result);}
 }else if(path==="/me"&&method==="PATCH"){Object.assign(s.users[role],body);result=s.users[role];}
 else if(path==="/me/export")return {demo:true,user:s.users[role],memory:role==="student"?memory(s):null,attempts:role==="student"?s.attempts:[],note:"浏览器合成样例，不是真实个人档案"};
 else if(path==="/me/delete"){resetDemo();return {deleted:true};}
 else if(path==="/recognize")throw Error("图片识别尚未接通真实视觉模型；演示模式不会上传图片。");
 else if(path==="/auth/logout")return {ok:true};
 else throw Error("此操作不在演示适配器中，请使用真实账号："+path);
 write(s);return copy(result);
}
