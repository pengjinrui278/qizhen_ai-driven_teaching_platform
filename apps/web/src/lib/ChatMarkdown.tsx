"use client";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {normalizeMath} from "./math-markdown.mjs";
import {annotateQuoteBlocks} from "./chat-quote.mjs";

// 与 CourseChat/AILearning 的 MessageText 同一渲染管线，额外用 annotateQuoteBlocks
// 给块级元素打 data-quote-* 标记（剪刀引用用）。关掉标记不影响任何既有样式。
export function messageSource(text:string){return normalizeMath(text||"");}

export default function ChatMarkdown({text}:{text:string}){
 return <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex,{throwOnError:false}],annotateQuoteBlocks]}>{messageSource(text)}</ReactMarkdown>;
}
