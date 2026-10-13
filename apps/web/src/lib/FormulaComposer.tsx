"use client";
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from "react";
import katex from "katex";
import type {MathfieldElement} from "mathlive";
import "mathlive/fonts.css";
import "./formula-composer.css";

// 公式符号面板：按学科分类（参照 AxMath 的分类思路），覆盖清北数学系本科课程常见符号——
// 数学分析（极限/级数/多元微积分）、高等代数与解析几何（矩阵/行列式/内积）、
// 概率论与数理统计、点集拓扑、抽象代数（群环域/同态/理想）、常微分方程、复变函数等。
const groups:[string,[string,string][]][]=[
 ["结构",[
  ["分式",String.raw`\frac{#?}{#?}`],["上标",String.raw`#?^{#?}`],["下标",String.raw`#?_{#?}`],["上下标",String.raw`#?_{#?}^{#?}`],
  ["平方根",String.raw`\sqrt{#?}`],["n 次根",String.raw`\sqrt[#?]{#?}`],
  ["圆括号",String.raw`\left(#?\right)`],["方括号",String.raw`\left[#?\right]`],["花括号",String.raw`\left\{#?\right\}`],
  ["绝对值",String.raw`\left|#?\right|`],["范数",String.raw`\left\|#?\right\|`],["下取整",String.raw`\lfloor#?\rfloor`],["上取整",String.raw`\lceil#?\rceil`],
  ["分段函数",String.raw`\begin{cases}#?&#?\\#?&#?\end{cases}`],["对齐多行",String.raw`\begin{aligned}#?&=#?\\#?&=#?\end{aligned}`],
  ["2×2 矩阵",String.raw`\begin{pmatrix}#?&#?\\#?&#?\end{pmatrix}`],["3×3 矩阵",String.raw`\begin{pmatrix}#?&#?&#?\\#?&#?&#?\\#?&#?&#?\end{pmatrix}`],
  ["2×2 行列式",String.raw`\begin{vmatrix}#?&#?\\#?&#?\end{vmatrix}`],["二项式系数",String.raw`\binom{#?}{#?}`],
  ["居中省略号",String.raw`\cdots`],["竖直省略号",String.raw`\vdots`],["对角省略号",String.raw`\ddots`],
 ]],
 ["微积分",[
  ["极限",String.raw`\lim_{#?\to#?}#?`],["上极限",String.raw`\limsup_{#?}#?`],["下极限",String.raw`\liminf_{#?}#?`],
  ["导数",String.raw`\frac{\mathrm{d}#?}{\mathrm{d}x}`],["偏导",String.raw`\frac{\partial #?}{\partial x}`],["二阶偏导",String.raw`\frac{\partial^{2}#?}{\partial x\partial y}`],
  ["不定积分",String.raw`\int #?\,\mathrm{d}x`],["定积分",String.raw`\int_{#?}^{#?}#?\,\mathrm{d}x`],
  ["环路积分",String.raw`\oint_{#?}#?`],["二重积分",String.raw`\iint_{#?}#?`],["三重积分",String.raw`\iiint_{#?}#?`],
  ["求和",String.raw`\sum_{#?}^{#?}#?`],["连乘",String.raw`\prod_{#?}^{#?}#?`],
  ["上确界",String.raw`\sup_{#?}#?`],["下确界",String.raw`\inf_{#?}#?`],["最大值",String.raw`\max_{#?}#?`],["最小值",String.raw`\min_{#?}#?`],
  ["梯度",String.raw`\nabla #?`],["拉普拉斯算子",String.raw`\Delta #?`],["变分",String.raw`\delta #?`],
  ["无穷",String.raw`\infty`],["趋向",String.raw`\to`],["映射到",String.raw`\mapsto`],
  ["大 O",String.raw`O(#?)`],["小 o",String.raw`o(#?)`],["等价量",String.raw`\sim`],["同阶",String.raw`\asymp`],
 ]],
 ["运算",[
  ["加","+"],["减","-"],["乘",String.raw`\times`],["除",String.raw`\div`],
  ["正负",String.raw`\pm`],["负正",String.raw`\mp`],["点乘",String.raw`\cdot`],["星乘",String.raw`\ast`],
  ["复合",String.raw`\circ`],["卷积",String.raw`\ast`],["直和",String.raw`\oplus`],["直积/张量",String.raw`\otimes`],
  ["圈乘",String.raw`\odot`],["楔积",String.raw`\wedge`],["并/或",String.raw`\vee`],["点积(大)",String.raw`\bullet`],
  ["撇",String.raw`#?'`],["双撇",String.raw`#?''`],["阶乘",String.raw`#?!`],["百分号",String.raw`\%`],
 ]],
 ["关系",[
  ["等于","="],["不等于",String.raw`\ne`],["恒等",String.raw`\equiv`],["定义等于",String.raw`\triangleq`],
  ["约等于",String.raw`\approx`],["渐近等于",String.raw`\simeq`],["同构",String.raw`\cong`],["相似",String.raw`\sim`],
  ["小于","<"],["大于",">"],["小于等于",String.raw`\le`],["大于等于",String.raw`\ge`],["远小于",String.raw`\ll`],["远大于",String.raw`\gg`],
  ["正比",String.raw`\propto`],["先于",String.raw`\prec`],["后于",String.raw`\succ`],["先于或等于",String.raw`\preceq`],["后于或等于",String.raw`\succeq`],
  ["真子集",String.raw`\subset`],["真超集",String.raw`\supset`],["子集",String.raw`\subseteq`],["超集",String.raw`\supseteq`],
  ["属于",String.raw`\in`],["不属于",String.raw`\notin`],["包含元素",String.raw`\ni`],
  ["垂直",String.raw`\perp`],["平行",String.raw`\parallel`],["不平行",String.raw`\nparallel`],
 ]],
 ["集合与逻辑",[
  ["空集",String.raw`\varnothing`],["并集",String.raw`\cup`],["交集",String.raw`\cap`],["差集",String.raw`\setminus`],
  ["无交并",String.raw`\sqcup`],["余积",String.raw`\coprod`],["幂集",String.raw`\mathcal{P}(#?)`],["笛卡尔积",String.raw`#?\times#?`],
  ["自然数",String.raw`\mathbb{N}`],["整数",String.raw`\mathbb{Z}`],["有理数",String.raw`\mathbb{Q}`],["实数",String.raw`\mathbb{R}`],["复数",String.raw`\mathbb{C}`],["有限域",String.raw`\mathbb{F}_{#?}`],
  ["任意",String.raw`\forall`],["存在",String.raw`\exists`],["不存在",String.raw`\nexists`],["非",String.raw`\neg`],["且",String.raw`\land`],["或",String.raw`\lor`],
  ["推出",String.raw`\Rightarrow`],["等价",String.raw`\Leftrightarrow`],["因为",String.raw`\because`],["所以",String.raw`\therefore`],
  ["证毕",String.raw`\blacksquare`],["蕴含(元语言)",String.raw`\vdash`],["满足",String.raw`\models`],["必然",String.raw`\Box`],["可能",String.raw`\Diamond`],
 ]],
 ["箭头",[
  ["右箭头",String.raw`\to`],["左箭头",String.raw`\leftarrow`],["双向",String.raw`\leftrightarrow`],["上箭头",String.raw`\uparrow`],["下箭头",String.raw`\downarrow`],
  ["长右箭头",String.raw`\longrightarrow`],["双线右箭头",String.raw`\Longrightarrow`],["双线等价",String.raw`\Longleftrightarrow`],
  ["右推",String.raw`\Rightarrow`],["左推",String.raw`\Leftarrow`],["互相推出",String.raw`\Leftrightarrow`],
  ["映射到",String.raw`\mapsto`],["嵌入",String.raw`\hookrightarrow`],["满射",String.raw`\twoheadrightarrow`],["限制",String.raw`\upharpoonright`],
  ["带标签箭头",String.raw`\xrightarrow{#?}`],["带上标等号",String.raw`\overset{#?}{=}`],["带下标",String.raw`\underset{#?}{=}`],
 ]],
 ["希腊字母",[
  ["α",String.raw`\alpha`],["β",String.raw`\beta`],["γ",String.raw`\gamma`],["δ",String.raw`\delta`],["ε",String.raw`\varepsilon`],["ζ",String.raw`\zeta`],["η",String.raw`\eta`],["θ",String.raw`\theta`],
  ["ι",String.raw`\iota`],["κ",String.raw`\kappa`],["λ",String.raw`\lambda`],["μ",String.raw`\mu`],["ν",String.raw`\nu`],["ξ",String.raw`\xi`],["π",String.raw`\pi`],["ρ",String.raw`\rho`],
  ["σ",String.raw`\sigma`],["τ",String.raw`\tau`],["υ",String.raw`\upsilon`],["φ",String.raw`\varphi`],["χ",String.raw`\chi`],["ψ",String.raw`\psi`],["ω",String.raw`\omega`],
  ["Γ",String.raw`\Gamma`],["Δ",String.raw`\Delta`],["Θ",String.raw`\Theta`],["Λ",String.raw`\Lambda`],["Ξ",String.raw`\Xi`],["Π",String.raw`\Pi`],["Σ",String.raw`\Sigma`],["Φ",String.raw`\Phi`],["Ψ",String.raw`\Psi`],["Ω",String.raw`\Omega`],
 ]],
 ["函数与算子",[
  ["sin",String.raw`\sin`],["cos",String.raw`\cos`],["tan",String.raw`\tan`],["cot",String.raw`\cot`],["sec",String.raw`\sec`],["csc",String.raw`\csc`],
  ["arcsin",String.raw`\arcsin`],["arccos",String.raw`\arccos`],["arctan",String.raw`\arctan`],
  ["sinh",String.raw`\sinh`],["cosh",String.raw`\cosh`],["tanh",String.raw`\tanh`],
  ["exp",String.raw`\exp`],["ln",String.raw`\ln`],["log",String.raw`\log`],["以 a 为底对数",String.raw`\log_{#?}#?`],
  ["成分",String.raw`\deg`],["最大公约数",String.raw`\gcd`],["最小公倍数",String.raw`\operatorname{lcm}`],
  ["迹",String.raw`\operatorname{tr}`],["秩",String.raw`\operatorname{rank}`],["维数",String.raw`\dim`],["核",String.raw`\ker`],["像",String.raw`\operatorname{Im}`],
  ["行列式",String.raw`\det`],["上极限符号",String.raw`\limsup`],["内积",String.raw`\langle #?, #? \rangle`],["取模",String.raw`#? \bmod #?`],
 ]],
 ["概率与统计",[
  ["期望",String.raw`\mathbb{E}[#?]`],["方差",String.raw`\operatorname{Var}(#?)`],["协方差",String.raw`\operatorname{Cov}(#?,#?)`],["相关系数",String.raw`\rho_{#?,#?}`],
  ["概率",String.raw`\mathbb{P}(#?)`],["条件概率",String.raw`\mathbb{P}(#?\mid#?)`],
  ["服从分布",String.raw`\sim`],["独立",String.raw`\perp`],["正态分布",String.raw`\mathcal{N}(\mu,\sigma^{2})`],
  ["均匀分布",String.raw`U(#?,#?)`],["指数分布",String.raw`\operatorname{Exp}(#?)`],["泊松分布",String.raw`\operatorname{Poisson}(#?)`],
  ["卡方分布",String.raw`\chi^{2}_{#?}`],["t 分布",String.raw`t(#?)`],["F 分布",String.raw`F(#?,#?)`],
  ["组合数",String.raw`\binom{#?}{#?}`],["样本均值",String.raw`\bar{#?}`],["标准差",String.raw`\sigma_{#?}`],["估计量",String.raw`\hat{#?}`],
  ["依概率收敛",String.raw`\xrightarrow{P}`],["依分布收敛",String.raw`\xrightarrow{d}`],["几乎必然收敛",String.raw`\xrightarrow{a.s.}`],
 ]],
 ["代数与拓扑",[
  ["向量",String.raw`\vec{#?}`],["转置",String.raw`#?^{\mathsf{T}}`],["逆",String.raw`#?^{-1}`],["伴随",String.raw`#?^{*}`],["共轭",String.raw`\overline{#?}`],
  ["内积",String.raw`\langle #?, #? \rangle`],["直和",String.raw`\oplus`],["张量积",String.raw`\otimes`],
  ["正规子群",String.raw`\trianglelefteq`],["子群",String.raw`\le`],["商群",String.raw`#?/#?`],["理想",String.raw`\triangleleft`],
  ["同构",String.raw`\cong`],["同伦",String.raw`\simeq`],["群作用",String.raw`#?\curvearrowright#?`],
  ["闭包",String.raw`\operatorname{cl}(#?)`],["内部",String.raw`\operatorname{int}(#?)`],["边界",String.raw`\partial #?`],["邻域",String.raw`U(#?)`],
  ["基",String.raw`\{#?\}_{#?}`],["生成",String.raw`\langle #? \rangle`],["嵌入",String.raw`\hookrightarrow`],
 ]],
 ["装饰与字体",[
  ["上划线",String.raw`\overline{#?}`],["下划线",String.raw`\underline{#?}`],["帽",String.raw`\hat{#?}`],["宽帽",String.raw`\widehat{#?}`],
  ["波浪线",String.raw`\tilde{#?}`],["宽波浪线",String.raw`\widetilde{#?}`],["一阶导点",String.raw`\dot{#?}`],["二阶导点",String.raw`\ddot{#?}`],
  ["向量",String.raw`\vec{#?}`],["黑板体",String.raw`\mathbb{#?}`],["花体",String.raw`\mathcal{#?}`],["哥特体",String.raw`\mathfrak{#?}`],
  ["粗体",String.raw`\mathbf{#?}`],["正体",String.raw`\mathrm{#?}`],["文本",String.raw`\text{#?}`],["自定义算子",String.raw`\operatorname{#?}`],
  ["上括号",String.raw`\overbrace{#?}^{#?}`],["下括号",String.raw`\underbrace{#?}_{#?}`],["标注(上)",String.raw`\overset{#?}{#?}`],["标注(下)",String.raw`\underset{#?}{#?}`],
 ]],
 ["数字与字母",Array.from("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",c=>[c,c] as [string,string])],
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
