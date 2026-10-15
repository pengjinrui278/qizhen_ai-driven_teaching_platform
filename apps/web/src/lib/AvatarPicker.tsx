"use client";
import {useEffect,useRef,useState} from "react";
import StudentIcon from "./StudentIcon";

// 头像：选一张图 → 拖一拖、缩放，框里看着满意了再存。
// 裁剪在浏览器里做完再上传（正方形 256×256 的 data URL），服务端只校验类型与体积。
const SIZE = 256;          // 存下来的边长
const VIEW = 208;          // 编辑框的显示边长
const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_SOURCE = 12 * 1024 * 1024;
const MAX_OUTPUT = 380000;  // 与服务端 max_length 对齐，留点余量

export function AvatarButton({src,nickname,onSaved,api}:{
 src?:string;nickname:string;
 onSaved:(avatar:string)=>void;
 api:(path:string,method?:string,body?:unknown)=>Promise<unknown>;
}){
 const [open,setOpen]=useState(false);
 const initial=(nickname||"同学").trim().slice(0,1);
 return <>
  <button type="button" className="lmAvatarButton" onClick={()=>setOpen(true)}
   aria-label={src?"修改头像":"设置头像"} title={src?"修改头像":"设置头像"}>
   {src?<img src={src} alt=""/>:<span aria-hidden="true">{initial}</span>}
   <span className="lmAvatarHint"><StudentIcon name="camera"/></span>
  </button>
  {open&&<AvatarEditor src={src} api={api}
   onClose={()=>setOpen(false)}
   onSaved={next=>{setOpen(false);onSaved(next);}}/>}
 </>;
}

function AvatarEditor({src,onClose,onSaved,api}:{
 src?:string;onClose:()=>void;onSaved:(avatar:string)=>void;
 api:(path:string,method?:string,body?:unknown)=>Promise<unknown>;
}){
 const [image,setImage]=useState<HTMLImageElement|null>(null);
 const [name,setName]=useState("");
 const [zoom,setZoom]=useState(1);
 const [offset,setOffset]=useState({x:0,y:0});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const drag=useRef<{x:number;y:number;ox:number;oy:number}|null>(null);
 const file=useRef<HTMLInputElement>(null);
 const canvas=useRef<HTMLCanvasElement>(null);

 // 打开时先把现有头像装进编辑框，方便微调
 useEffect(()=>{
  if(!src)return;
  const img=new Image();
  img.onload=()=>{setImage(img);setName("当前头像");setZoom(1);setOffset({x:0,y:0});};
  img.src=src;
 },[]); // 只在挂载时跑一次

 function pick(f?:File){
  if(!f)return;
  setError("");
  if(!ACCEPT.split(",").includes(f.type)){setError("请选择 PNG、JPEG 或 WebP 图片");return;}
  if(f.size>MAX_SOURCE){setError("图片请小于 12MB");return;}
  const reader=new FileReader();
  reader.onload=()=>{
   const img=new Image();
   img.onload=()=>{setImage(img);setName(f.name);setZoom(1);setOffset({x:0,y:0});};
   img.onerror=()=>setError("这张图片读不出来，换一张试试");
   img.src=String(reader.result);
  };
  reader.onerror=()=>setError("读取文件失败");
  reader.readAsDataURL(f);
 }

 // 画到 256×256：取原图中心的正方形区域，按缩放与拖动位移裁
 function render(){
  const el=canvas.current,img=image;
  if(!el||!img)return "";
  const side=Math.min(img.naturalWidth,img.naturalHeight)/zoom;
  const cx=img.naturalWidth/2-offset.x*(img.naturalWidth/VIEW)/zoom;
  const cy=img.naturalHeight/2-offset.y*(img.naturalHeight/VIEW)/zoom;
  // 别让画布取到图外面去，否则边缘会出现透明条
  const sx=Math.max(0,Math.min(img.naturalWidth-side,cx-side/2));
  const sy=Math.max(0,Math.min(img.naturalHeight-side,cy-side/2));
  el.width=SIZE;el.height=SIZE;
  const ctx=el.getContext("2d");
  if(!ctx)return "";
  ctx.clearRect(0,0,SIZE,SIZE);
  ctx.drawImage(img,sx,sy,side,side,0,0,SIZE,SIZE);
  return el.toDataURL("image/jpeg",0.86);
 }

 const preview=image?(()=>{
  const side=Math.min(image.naturalWidth,image.naturalHeight)/zoom;
  const scale=VIEW/side;
  return {width:image.naturalWidth*scale,height:image.naturalHeight*scale,
          left:(VIEW-image.naturalWidth*scale)/2+offset.x,
          top:(VIEW-image.naturalHeight*scale)/2+offset.y,src:image.src};
 })():null;

 async function save(){
  const data=render();
  if(!data){setError("先选一张图片");return;}
  if(data.length>MAX_OUTPUT){setError("这张图压不小，换一张分辨率低一点的");return;}
  setBusy(true);setError("");
  try{
   await api("/me/avatar","PATCH",{avatar:data});
   onSaved(data);
  }catch(e){setError(e instanceof Error?e.message:"头像保存失败");}
  finally{setBusy(false);}
 }

 async function clear(){
  setBusy(true);setError("");
  try{await api("/me/avatar","PATCH",{avatar:""});onSaved("");}
  catch(e){setError(e instanceof Error?e.message:"清除失败");}
  finally{setBusy(false);}
 }

 return <div className="lmAvatarBackdrop" role="presentation" onClick={onClose}>
  <section className="lmAvatarDialog" role="dialog" aria-label="编辑头像" onClick={e=>e.stopPropagation()}>
   <h3>编辑头像</h3>
   <div className="lmAvatarStage">
    <div className="lmAvatarFrame"
     onPointerDown={e=>{if(!image)return;e.currentTarget.setPointerCapture(e.pointerId);
       drag.current={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y};}}
     onPointerMove={e=>{if(!drag.current)return;
       setOffset({x:drag.current.ox+(e.clientX-drag.current.x),y:drag.current.oy+(e.clientY-drag.current.y)});}}
     onPointerUp={()=>{drag.current=null;}}
     onPointerCancel={()=>{drag.current=null;}}>
     {preview?<img src={preview.src} alt="" draggable={false}
       style={{width:preview.width,height:preview.height,left:preview.left,top:preview.top}}/>
      :<p className="lmAvatarEmpty">还没有选图片</p>}
    </div>
    <canvas ref={canvas} hidden/>
   </div>
   <label className="lmAvatarZoom">缩放
    <input type="range" min={1} max={4} step={0.02} value={zoom} disabled={!image}
     onChange={e=>setZoom(Number(e.target.value))}/>
   </label>
   <p className="lmAvatarTip">{image?"按住图片拖动位置，用滑块缩放。":"选一张图片，可以拖动和缩放。"}</p>
   {error&&<p className="lmAvatarError" role="alert">{error}</p>}
   <div className="lmAvatarActions">
    <button type="button" disabled={busy} onClick={()=>file.current?.click()}>{image?"换一张":"选择图片"}</button>
    {src&&<button type="button" disabled={busy} onClick={()=>void clear()}>清除头像</button>}
    <button type="button" className="lmAvatarSave" disabled={busy||!image} onClick={()=>void save()}>
     {busy?"保存中…":"保存"}</button>
    <button type="button" disabled={busy} onClick={onClose}>取消</button>
   </div>
   <input ref={file} type="file" accept={ACCEPT} hidden aria-label="选择头像图片"
    onChange={e=>{pick(e.target.files?.[0]);e.target.value="";}}/>
  </section>
 </div>;
}
