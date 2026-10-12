"use client";
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from "react";
import katex from "katex";
import type {MathfieldElement} from "mathlive";
import "mathlive/fonts.css";
import "./formula-composer.css";

const groups:[string,[string,string][]][]=[
 ["结构",[["分式",String.raw`\frac{#?}{#?}`],["上标",String.raw`#?^{#?}`],["下标",String.raw`#?_{#?}`],["平方根",String.raw`\sqrt{#?}`],["n次根",String.raw`\sqrt[#?]{#?}`],["括号",String.raw`\left(#?\right)`],["绝对值",String.raw`\left|#?\right|`],["分段函数",String.raw`\begin{cases}#?&#?\\#?&#?\end{cases}`],["二阶矩阵",String.raw`\begin{pmatrix}#?&#?\\#?&#?\end{pmatrix}`]]],
 ["数字与字母",Array.from("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",c=>[c,c] as [string,string])],
 ["微积分",[["极限",String.raw`\lim_{#?\to#?}#?`],["求和",String.raw`\sum_{#?}^{#?}#?`],["积分",String.raw`\int_{#?}^{#?}#?\,\mathrm{d}x`],["导数",String.raw`\frac{\mathrm{d}#?}{\mathrm{d}x}`],["偏导",String.raw`\frac{\partial #?}{\partial x}`],["无穷",String.raw`\infty`],["趋向",String.raw`\to`]]],
 ["运算与关系",[["加","+"],["减","-"],["乘",String.raw`\times`],["除",String.raw`\div`],["等于","="],["不等于",String.raw`\ne`],["小于","<"],["大于",">"],["小于等于",String.raw`\le`],["大于等于",String.raw`\ge`],["约等于",String.raw`\approx`],["正负",String.raw`\pm`],["点乘",String.raw`\cdot`]]],
 ["集合与逻辑",[["属于",String.raw`\in`],["不属于",String.raw`\notin`],["子集",String.raw`\subseteq`],["并集",String.raw`\cup`],["交集",String.raw`\cap`],["任意",String.raw`\forall`],["存在",String.raw`\exists`],["推出",String.raw`\Rightarrow`],["等价",String.raw`\Leftrightarrow`],["实数",String.raw`\mathbb{R}`],["自然数",String.raw`\mathbb{N}`],["空集",String.raw`\varnothing`]]],
 ["字母与函数",[["α",String.raw`\alpha`],["β",String.raw`\beta`],["γ",String.raw`\gamma`],["δ",String.raw`\delta`],["ε",String.raw`\varepsilon`],["θ",String.raw`\theta`],["λ",String.raw`\lambda`],["μ",String.raw`\mu`],["π",String.raw`\pi`],["σ",String.raw`\sigma`],["ω",String.raw`\omega`],["sin",String.raw`\sin`],["cos",String.raw`\cos`],["ln",String.raw`\ln`],["log",String.raw`\log`],["向量",String.raw`\vec{#?}`]]],
];
function read(node:Node):string {
 if(node.nodeType===Node.TEXT_NODE)return node.textContent||"";
 if(node instanceof HTMLElement){if(node.dataset.latex!==undefined)return "\\("+node.dataset.latex+"\\)";if(node.tagName==="BR")return "\n";}
 return Array.from(node.childNodes).map(n=>read(n)+(n instanceof HTMLElement&&/^(DIV|P)$/.test(n.tagName)?"\n":"")).join("");
}
function formula(latex:string){const chip=document.createElement("span");chip.className="formulaChip";chip.contentEditable="false";chip.dataset.latex=latex;chip.tabIndex=0;chip.setAttribute("role","button");chip.setAttribute("aria-label","编辑公式");chip.title="点击修改公式";chip.innerHTML=katex.renderToString(latex,{throwOnError:false,trust:false,strict:"ignore",maxExpand:200});return chip;}
function render(root:HTMLElement,value:string){root.replaceChildren();const pattern=/\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g;let start=0;for(const match of value.matchAll(pattern)){root.append(document.createTextNode(value.slice(start,match.index)));root.append(formula(match[1]??match[2]??match[3]));start=match.index!+match[0].length;}root.append(document.createTextNode(value.slice(start)));}
type Props={value:string;onChange:(value:string)=>void;onSend:()=>void;disabled:boolean};
export default forwardRef<HTMLDivElement,Props>(function FormulaComposer({value,onChange,onSend,disabled},ref){
 const editor=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null),host=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null),field=useRef<MathfieldElement|null>(null);
 const saved=useRef<Range|null>(null),last=useRef(""),composing=useRef(false),editing=useRef<HTMLElement|null>(null),frozen=useRef(false);
 const [open,setOpen]=useState(false),[ready,setReady]=useState(false),[latex,setLatex]=useState(""),[error,setError]=useState(""),[source,setSource]=useState(false);
 const latexRef=useRef(latex);latexRef.current=latex;
 useImperativeHandle(ref,()=>editor.current!);
 function end(){const r=document.createRange();r.selectNodeContents(editor.current!);r.collapse(false);return r;}
 // 视口尺寸变化等瞬时重排之后，直接 focus() 有时不生效（焦点落回 body，用户打的字会丢），
 // 因此下一帧再确认一次焦点。
 function focusField(){const el=field.current;if(!el)return;el.focus();requestAnimationFrame(()=>{if(field.current&&document.activeElement!==field.current)field.current.focus();});}
 function remember(){if(frozen.current)return;const s=window.getSelection();if(s?.rangeCount&&editor.current?.contains(s.getRangeAt(0).commonAncestorContainer))saved.current=s.getRangeAt(0).cloneRange();}
 function restore(){editor.current?.focus();const r=saved.current&&editor.current?.contains(saved.current.commonAncestorContainer)?saved.current:end();const s=window.getSelection();s?.removeAllRanges();s?.addRange(r);return r;}
 function changed(){const text=read(editor.current!);if(text.length>6000){setError("消息最多6000个字符，请缩短后再发送。");render(editor.current!,last.current);saved.current=end();restore();return;}last.current=text;onChange(text);remember();}
 useEffect(()=>{if(value!==last.current){render(editor.current!,value);last.current=value;saved.current=null;}},[value]);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 useEffect(()=>{if(!open)frozen.current=false;},[open]);
 useEffect(()=>{if(!open)return;let live=true;setReady(false);setError("");import("mathlive").then(({MathfieldElement})=>{if(!live||!host.current)return;MathfieldElement.soundsDirectory=null;const mf=new MathfieldElement();mf.mathVirtualKeyboardPolicy="manual";mf.value=latexRef.current;mf.setAttribute("aria-label","公式编辑区");mf.addEventListener("input",()=>setLatex(mf.value));mf.addEventListener("keydown",e=>{if(e.key==="Enter")e.preventDefault();});host.current.replaceChildren(mf);field.current=mf;setReady(true);mf.focus();}).catch(()=>{if(live)setError("公式编辑器加载失败，请关闭后重试。原消息未改变。");});return()=>{live=false;field.current?.remove();field.current=null;};},[open]);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node)&&!toggle.current?.contains(e.target as Node))setOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();setOpen(false);toggle.current?.focus();}};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};},[open]);
 function launch(chip?:HTMLElement){remember();frozen.current=true;editing.current=chip||null;if(chip){const r=document.createRange();r.selectNode(chip);saved.current=r;setLatex(chip.dataset.latex||"");}setSource(false);setOpen(true);}
 function insert(){const text=field.current?.value.trim()||"";if(!text){setError("请先输入公式。");return;}if(/\\placeholder|#\?/.test(text)){setError("请先填写公式中的空格。");return;}const r=restore();const selected=read(r.cloneContents());if(read(editor.current!).length-selected.length+text.length+4>6000){setError("公式过长，消息最多6000个字符。");return;}document.execCommand("insertHTML",false,formula(text).outerHTML);changed();setOpen(false);setLatex("");editing.current=null;remember();}
 return <><div className="formulaInputWrap">
 {open&&<div className="formulaPanel" ref={panel} role="dialog" aria-label="公式输入面板"><div className="formulaPanelHead"><strong>编辑公式</strong><button type="button" onClick={()=>{setOpen(false);toggle.current?.focus();}} aria-label="关闭公式面板">×</button></div><div className="formulaField" ref={host}/>{!ready&&<p role="status">正在加载公式编辑器…</p>}
 <div className="formulaTools" onMouseDown={e=>e.preventDefault()}><button type="button" disabled={!ready} onClick={()=>{field.current?.executeCommand("moveToPreviousPlaceholder");focusField();}}>上一格</button><button type="button" disabled={!ready} onClick={()=>{field.current?.executeCommand("moveToNextPlaceholder");focusField();}}>下一格</button><button type="button" disabled={!ready} onClick={()=>{field.current?.executeCommand("deleteBackward");focusField();}}>退格</button><button type="button" onClick={()=>{if(field.current)field.current.value="";setLatex("");}}>清空</button><button type="button" aria-pressed={source} onClick={()=>setSource(!source)}>LaTeX</button></div>
 {source&&<textarea aria-label="LaTeX公式源码" value={latex} onChange={e=>{setLatex(e.target.value);if(field.current)field.current.value=e.target.value;}}/>}
 <div className="formulaSymbols">{groups.map(([name,items])=><section key={name}><h3>{name}</h3><div>{items.map(([label,code])=><button type="button" key={label} title={label} aria-label={label} disabled={!ready} onMouseDown={e=>e.preventDefault()} onClick={()=>{field.current?.insert(code,{selectionMode:"placeholder"});focusField();setLatex(field.current?.value||"");}}><span dangerouslySetInnerHTML={{__html:katex.renderToString(code.replaceAll("#?","\\square"),{throwOnError:false,trust:false,strict:"ignore"})}}/></button>)}</div></section>)}</div>
 {error&&<p role="alert">{error}</p>}<div className="formulaPanelFoot"><span>点击空格填写，方向键移动</span><button type="button" disabled={!ready||!latex.trim()} onClick={insert}>完成</button></div></div>}
 <div ref={editor} className="formulaMessageInput" contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-label="发送消息" aria-multiline="true" aria-disabled={disabled} data-placeholder="输入消息，或添加图片与公式…" onInput={()=>{if(!composing.current)changed();}} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;changed();}} onKeyUp={remember} onMouseUp={remember} onBlur={remember}
 onClick={e=>{const chip=(e.target as HTMLElement).closest<HTMLElement>(".formulaChip");if(chip&&!disabled)launch(chip);}}
 onKeyDown={e=>{if(disabled)return;if(e.nativeEvent.isComposing||composing.current)return;if(e.key==="Enter"&&(e.target as HTMLElement).closest(".formulaChip")){e.preventDefault();launch((e.target as HTMLElement).closest<HTMLElement>(".formulaChip")!);return;}if(e.key==="Enter"){e.preventDefault();if(e.shiftKey){document.execCommand("insertText",false,"\n");changed();}else if(!disabled)onSend();}}}
 onPaste={e=>{e.preventDefault();if(!disabled){const text=e.clipboardData.getData("text/plain");if(text.length+read(editor.current!).length>6000){setError("粘贴内容过长。");return;}document.execCommand("insertText",false,text);changed();}}}
 onCopy={e=>{const s=window.getSelection();if(s?.rangeCount){e.preventDefault();e.clipboardData.setData("text/plain",read(s.getRangeAt(0).cloneContents()));}}}/>
 {!open&&error&&<p className="formulaInputError" role="alert">{error}</p>}</div>
 <button ref={toggle} className="formulaToggle" type="button" title="插入公式" aria-label="插入公式" aria-expanded={open} disabled={disabled} onMouseDown={e=>{e.preventDefault();remember();}} onClick={()=>open?setOpen(false):launch()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M19 4H6l7 8-7 8h13M19 4v3M19 20v-3"/></svg></button></>;
});
