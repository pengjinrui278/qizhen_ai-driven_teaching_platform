"use client";
import {apiBase} from "./note-store";

// 对话里的文档上传：抽文本交给后端，前端只留 {id, name, kind} 作为一个高亮块。
export type UploadedDoc={id:string;filename:string;kind:string;kind_label:string;size:number;chars:number;readable:boolean;note?:string};

const ACCEPT=".pdf,.docx,.pptx,.txt,.md,.markdown,.csv,.json,.tex,.log,.py,.ipynb,.c,.cpp,.h,.java,.js,.ts,.tsx,.r,.m,.sql,.sh";
export const DOC_ACCEPT=ACCEPT;

export function isDocFile(file:File){
 const dot=file.name.lastIndexOf(".");
 if(dot<0)return false;
 return ACCEPT.split(",").includes(file.name.slice(dot).toLowerCase());
}

export function formatSize(bytes:number){
 if(bytes<1024)return bytes+" B";
 if(bytes<1024*1024)return (bytes/1024).toFixed(0)+" KB";
 return (bytes/1024/1024).toFixed(1)+" MB";
}

export async function uploadDocument(file:File):Promise<UploadedDoc>{
 const form=new FormData();
 form.append("file",file);
 const response=await fetch(`${apiBase}/api/v2/uploads`,{method:"POST",credentials:"include",
  headers:{"X-Mirror-Request":"1"},body:form});
 const payload=await response.json().catch(()=>({detail:"服务没有返回有效数据"}));
 if(!response.ok)throw new Error(payload?.detail||"上传失败");
 return payload as UploadedDoc;
}
