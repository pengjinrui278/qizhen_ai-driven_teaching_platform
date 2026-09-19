"use client";
import {useState} from "react";
const examples=[
 {tool:"analysis_epsilon",name:"数分：1/n型数列误差界",data:{epsilon:"1/10",c:1,N:11}},
 {tool:"linear_residual",name:"线代：Ax=b残差",data:{A:[[1,2],[2,1]],x:[1,2],b:[5,4]}},
 {tool:"physics_dimensions",name:"物理：SI量纲对照",data:{left:[0,0,1,0,0,0,0],numerator:[[1,0,0,0,0,0,0]],denominator:[[1,0,-1,0,0,0,0]]}},
 {tool:"finite_topology",name:"拓扑：有限空间公理",data:{universe:[1,2],opens:[[],[1],[1,2]]}},
 {tool:"ode_polynomial",name:"ODE：多项式解与初值",data:{coefficients:[1,0,1],forcing:[0,2],y0:1}}
];
export default function VerificationTools({demonstration=false}:{demonstration?:boolean}){
 const [index,setIndex]=useState(0),[input,setInput]=useState(JSON.stringify(examples[0].data,null,2));
 const [result,setResult]=useState(""),[busy,setBusy]=useState(false);
 return <details className="pilotCard"><summary>学科计算核对工具（可选）</summary>
 <p>只检查结构化计算，不判定任意证明，不写入学习观察。数分工具仅适用于 aₙ=L+c/n，N取正整数；SI量纲顺序为长度、质量、时间、电流、温度、物质的量、发光强度。</p>
 <form className="pilotForm" onSubmit={async e=>{e.preventDefault();setBusy(true);try{
 if(demonstration){setResult("界面演示：此处展示结构化工具输入。未调用真实验证器；请切换真实账号执行计算，不能把此提示当作验证通过。");return;}
 const response=await fetch((process.env.NEXT_PUBLIC_API_BASE??"")+"/api/v2/verify",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","X-Mirror-Request":"1"},body:JSON.stringify({tool:examples[index].tool,data:JSON.parse(input)})});
 const value=await response.json();setResult(JSON.stringify(value,null,2));
 }catch(error){setResult(error instanceof Error?error.message:String(error));}finally{setBusy(false);}}}>
 <label>工具范围<select disabled={busy} value={index} onChange={e=>{const n=Number(e.target.value);setIndex(n);setInput(JSON.stringify(examples[n].data,null,2));setResult("");}}>{examples.map((x,i)=><option key={x.tool} value={i}>{x.name}</option>)}</select></label>
 <label>结构化输入<textarea rows={9} value={input} disabled={busy} onChange={e=>setInput(e.target.value)}/></label>
 <button disabled={busy}>核对这组输入</button>{result&&<pre aria-live="polite">{result}</pre>}</form></details>;
}
