// 素材页（拼图区）：把本地文件或网址作为「并列的阅读页面」停靠在对话页右侧。
// 边界：文件只在浏览器本地打开（object URL / FileReader），不上传服务器；
// 素材页是会话内的临时容器，刷新即清空，不写入任何账号数据。

export type MaterialKind = "pdf" | "image" | "text" | "url" | "unsupported";

export type MaterialPane = {
  id: string;
  kind: MaterialKind;
  title: string;          // 文件名或网址
  source: string;         // object URL / data URL / 文本内容 / 网址
  note?: string;          // 例如“浏览器无法预览此格式”
  size?: number;          // 字节数（本地文件）
  height: number;         // 瓷砖高度（px），可拖动调整
  order: number;
};

export type MaterialInput = { kind: MaterialKind; title: string; source: string; note?: string; size?: number };

const TEXT_EXT = /\.(md|markdown|txt|csv|json|tex|log)$/i;
const PDF_EXT = /\.pdf$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const OFFICE_EXT = /\.(docx?|pptx?|xlsx?|pages|key|numbers)$/i;

export function materialLimit(){return 6;}

export function formatSize(bytes?: number){
  if(!bytes&&bytes!==0)return "";
  if(bytes<1024)return bytes+" B";
  if(bytes<1024*1024)return (bytes/1024).toFixed(1)+" KB";
  return (bytes/1024/1024).toFixed(1)+" MB";
}

export function urlOf(value: string){
  const text=(value||"").trim();
  if(!/^https?:\/\//i.test(text))return null;
  try{return new URL(text).href;}catch{return null;}
}

// 浏览器能直接渲染的才算“看得见”；docx/pptx 等只做占位，不假装能预览
export function inputFromFile(file: File): MaterialInput {
  const name=file.name||"未命名文件";
  if(PDF_EXT.test(name)||file.type==="application/pdf")return {kind:"pdf",title:name,source:URL.createObjectURL(file),size:file.size};
  if(IMAGE_EXT.test(name)||file.type.startsWith("image/"))return {kind:"image",title:name,source:URL.createObjectURL(file),size:file.size};
  if(TEXT_EXT.test(name)||file.type.startsWith("text/"))return {kind:"text",title:name,source:"",size:file.size};
  if(OFFICE_EXT.test(name))return {kind:"unsupported",title:name,source:URL.createObjectURL(file),size:file.size,note:"浏览器无法在线渲染 Word/PPT/Excel，可在此打开或下载后查看"};
  return {kind:"unsupported",title:name,source:URL.createObjectURL(file),size:file.size,note:"暂不支持在线预览此格式，可在此打开或下载后查看"};
}

// 能否作为“提问附件”：文本类直接读入，图片走现有识别链路；PDF/Office 暂不支持（不假装支持）
export function isTextFile(file: File){
  return TEXT_EXT.test(file.name||"")||(file.type||"").startsWith("text/");
}
export function isImageFile(file: File){
  return IMAGE_EXT.test(file.name||"")||(file.type||"").startsWith("image/");
}
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取文件"));
    reader.readAsDataURL(file);
  });
}

export function newMaterialPane(input: MaterialInput, order: number): MaterialPane {
  return {id:"mat-"+Math.random().toString(36).slice(2,10),kind:input.kind,title:input.title,source:input.source,note:input.note,size:input.size,height:input.kind==="image"?280:360,order};
}

// 关闭时释放 object URL（文本与网址不需要）
export function releaseMaterial(pane: MaterialPane){
  if((pane.kind==="pdf"||pane.kind==="image"||pane.kind==="unsupported")&&pane.source.startsWith("blob:")){
    try{URL.revokeObjectURL(pane.source);}catch{/* 已被释放 */}
  }
}

export function kindLabel(kind: MaterialKind){
  return ({pdf:"PDF",image:"图片",text:"文本",url:"网页",unsupported:"文件"} as Record<MaterialKind,string>)[kind];
}
