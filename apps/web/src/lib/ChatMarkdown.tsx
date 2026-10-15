"use client";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {normalizeMath} from "./math-markdown.mjs";
import {annotateQuoteBlocks} from "./chat-quote.mjs";
import Mermaid from "./Mermaid";
import "./mermaid.css";

// 与 CourseChat/AILearning 的 MessageText 同一渲染管线，额外用 annotateQuoteBlocks
// 给块级元素打 data-quote-* 标记（摘录引用用）。关掉标记不影响任何既有样式。
export function messageSource(text:string){return normalizeMath(text||"");}

// ```mermaid 代码块交给 Mermaid 画图，其余代码块保持原样。
// react-markdown v10 把语言放在 className（language-mermaid）里。
function Code({className,children,...rest}:{className?:string;children?:React.ReactNode}){
 const language=/language-(\w+)/.exec(className||"")?.[1];
 if(language==="mermaid")return <Mermaid code={String(children??"")}/>;
 return <code className={className} {...rest}>{children}</code>;
}

export default function ChatMarkdown({text}:{text:string}){
 return <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex,{throwOnError:false}],annotateQuoteBlocks]}
  components={{code:Code}}>{messageSource(text)}</ReactMarkdown>;
}
