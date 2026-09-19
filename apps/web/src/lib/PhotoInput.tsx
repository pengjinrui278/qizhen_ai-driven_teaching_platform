"use client";
import {useState} from "react";
export default function PhotoInput({recognize,onText,disabled=false}:{recognize:(data:string)=>Promise<{text:string}>;onText:(text:string)=>void;disabled?:boolean}){
 const [preview,setPreview]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);

 async function select(file?:File){
  if(!file)return;setError("");
  if(!file.type.startsWith("image/")||file.size>20*1024*1024){setError("请选择20MB以内的图片");return;}
  setBusy(true);
  const url=URL.createObjectURL(file);
  try{
   const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error("无法读取图片，请改用JPG或PNG"));image.src=url;});
   const scale=Math.min(1,1800/Math.max(img.width,img.height));
   const canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
   const context=canvas.getContext("2d");if(!context)throw Error("无法处理图片");
   context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);
   const data=canvas.toDataURL("image/jpeg",.85);if(data.length>5500000)throw Error("图片过大，请裁剪后重试");
   setPreview(data);
  }catch(e){setError(e instanceof Error?e.message:"无法读取图片");}finally{URL.revokeObjectURL(url);setBusy(false);}
 }
 return <div className="photoInput"><div className="photoActions">
 <label className="photoButton">拍照<input aria-label="拍照" type="file" accept="image/*" capture="environment" disabled={disabled||busy} onChange={e=>{void select(e.target.files?.[0]);e.target.value="";}}/></label>
 <label className="photoButton">上传图片<input aria-label="上传图片" type="file" accept="image/*" disabled={disabled||busy} onChange={e=>{void select(e.target.files?.[0]);e.target.value="";}}/></label>
 </div>{preview&&<div className="photoPreview"><img src={preview} alt="待识别图片"/><div><button type="button" disabled={busy||disabled} onClick={async()=>{setBusy(true);setError("");try{const v=await recognize(preview);onText(v.text);}catch{setError("暂时无法识别，请稍后重试或手动输入");}finally{setBusy(false);}}}>{busy?"处理中…":"识别文字"}</button><button type="button" onClick={()=>setPreview("")} disabled={busy}>移除图片</button></div></div>}{error&&<p role="alert">{error}</p>}</div>;
}
