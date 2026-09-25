type Row=Record<string,any>;
export async function streamCourseMessage(aid:string,body:Row,onProgress:(stage:string)=>void):Promise<Row>{
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>;
 const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),90000);};
 touch();
 try{
  const response=await fetch((process.env.NEXT_PUBLIC_API_BASE??"")+"/api/v2/attempts/"+encodeURIComponent(aid)+"/messages/stream",{
   method:"POST",credentials:"include",headers:{"Content-Type":"application/json","X-Mirror-Request":"1"},body:JSON.stringify(body),signal:controller.signal,
  });
  if(!response.ok){if(response.status===401)window.dispatchEvent(new Event("mirror:signed-out"));const data=await response.json().catch(()=>({}));throw new Error(typeof data.detail==="string"?data.detail:"暂时无法获取回答，请稍后重试。");}
  if(!response.body||!response.headers.get("content-type")?.includes("text/event-stream"))throw new Error("回答连接格式异常，请重试。");
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";
  try{while(true){const {done,value}=await reader.read();if(done)break;touch();buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,"\n");
   if(buffer.length>200000)throw new Error("回答长度异常，请缩小问题范围后重试。");
   let boundary:number;
   while((boundary=buffer.indexOf("\n\n"))>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
    const event=frame.split("\n").find(line=>line.startsWith("event:"))?.slice(6).trim();
    const raw=frame.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");
    if(!raw)continue;let data:Row;try{data=JSON.parse(raw);}catch{throw new Error("回答数据不完整，请重试。");}
    if(event==="progress")onProgress(data.stage);
    if(event==="error")throw new Error(data.detail||"回答未完成，请重试。");
    if(event==="done"){if(typeof data.answer!=="string")throw new Error("回答数据不完整，请重试。");return data;}
   }
  }}finally{await reader.cancel().catch(()=>{});}
  throw new Error("连接中断，请重试以恢复本次回答。");
 }catch(e){if(e instanceof Error&&e.name==="AbortError")throw new Error("连接长时间没有响应，请重试以恢复本次回答。");throw e;}
 finally{clearTimeout(timer!);}
}
