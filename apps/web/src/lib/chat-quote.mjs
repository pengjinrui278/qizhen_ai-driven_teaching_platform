// 剪刀（引用片段 → 拼接 → 并行子页面追问）的单一真源：
// 1) 追问消息的序列化/解析协议；2) 给渲染后的 Markdown 打 data-quote-* 标记的 rehype 插件；
// 3) 从 DOM 读出一条引用片段。浏览器与 node --test 共用（同 math-markdown.mjs 的约定）。

export const QUOTE_HEADER = "【引用追问】";
const FENCE_RE = /^⟦引用 (\d+)(?: · (.*))?⟧$/;
const FENCE_CLOSE_RE = /^⟦\/引用 (\d+)⟧$/;
const QUESTION_RE = /^⟦问题⟧$/;
const ZWSP = "⁠"; // 内容里出现的 ⟦ 一律加不可见连接符转义，解析时还原

function escapeContent(value) {
  return String(value ?? "").replaceAll("⟦", "⟦" + ZWSP);
}
function unescapeContent(value) {
  return String(value ?? "").replaceAll("⟦" + ZWSP, "⟦");
}

export function isFollowUpText(text) {
  return typeof text === "string" && text.trimStart().startsWith(QUOTE_HEADER);
}

// 追问消息是否来自本地记录的「子页面」会话（历史归组用；标题由服务端 summarize 生成）
export function isFollowUpTitle(title) {
  return typeof title === "string" && title.includes(QUOTE_HEADER);
}

export function serializeFollowUp(fragments, question) {
  const lines = [QUOTE_HEADER];
  fragments.forEach((frag, i) => {
    const label = String(frag.label ?? "").replaceAll("⟧", "】").trim();
    lines.push(`⟦引用 ${i + 1}${label ? " · " + label : ""}⟧`);
    lines.push(escapeContent(frag.source ?? frag.text ?? ""));
    lines.push(`⟦/引用 ${i + 1}⟧`);
  });
  lines.push("⟦问题⟧");
  lines.push(escapeContent(question));
  return lines.join("\n");
}

export function parseFollowUp(text) {
  if (!isFollowUpText(text)) return null;
  const lines = String(text).split("\n");
  const fragments = [];
  let question = "";
  let i = 1;
  while (i < lines.length) {
    const line = lines[i];
    const open = FENCE_RE.exec(line);
    if (open) {
      const index = Number(open[1]);
      const label = open[2] ?? "";
      const buf = [];
      i += 1;
      while (i < lines.length && !FENCE_CLOSE_RE.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过闭合行（缺失也容忍）
      fragments.push({ index, label: unescapeContent(label), source: unescapeContent(buf.join("\n")) });
      continue;
    }
    if (QUESTION_RE.test(line)) {
      question = unescapeContent(lines.slice(i + 1).join("\n")).trim();
      break;
    }
    i += 1;
  }
  return { fragments, question };
}

// 卡片折叠态与无障碍文案用的纯文本预览（源 markdown 仍原样保留、渲染时再还原）
export function plainFromSource(source) {
  return String(source ?? "")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$1")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$1")
    .replace(/[#>*`_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTurnLabel(paneTitle, turnIndex) {
  return `${paneTitle} · 第 ${turnIndex} 轮回答`;
}

// ---------- rehype 标注 ----------
// 必须在 rehype-katex **之后**运行：katex 之前的属性会被它重建元素时丢弃（实测）。
// 产出契约：块级 text 单元带 data-quote-start/end（相对 normalizeMath 后的源串偏移），
// 公式单元（.katex / .katex-display）带 data-quote-tex（从 annotation 反取，katex 输出无 position）。
const BLOCK_TAGS = new Set([
  "p", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "pre", "table", "tr", "td", "th",
]);

function classList(node) {
  const cls = node.properties?.className;
  return (Array.isArray(cls) ? cls : [cls]).filter(Boolean).map(String);
}

function annotationTex(node) {
  if (node.tagName === "annotation" && node.properties?.encoding === "application/x-tex") {
    return (node.children || []).map((c) => c.value || "").join("");
  }
  for (const child of node.children || []) {
    const found = annotationTex(child);
    if (found) return found;
  }
  return "";
}

function nodeText(node) {
  if (typeof node.value === "string") return node.value;
  return (node.children || []).map(nodeText).join("");
}

// 用法：rehypePlugins: [[rehypeKatex, opts], annotateQuoteBlocks]（传工厂本身，由 unified 以 attacher 调用）
export function annotateQuoteBlocks() {
  return (tree) => {
    const walk = (node) => {
      const cls = classList(node);
      const isDisplay = cls.includes("katex-display");
      const isKatex = !isDisplay && cls.includes("katex");
      if (isDisplay || isKatex || cls.includes("language-math")) {
        // 公式整体是原子单元；display 不下钻，避免内外两层都被命中
        node.properties ||= {};
        node.properties.dataQuoteUnit = isDisplay || cls.includes("math-display") ? "mathBlock" : "mathInline";
        node.properties.dataQuoteTex = cls.includes("language-math") && !annotationTex(node)
          ? nodeText(node)
          : annotationTex(node);
        return;
      }
      if (BLOCK_TAGS.has(node.tagName) && node.position) {
        node.properties ||= {};
        node.properties.dataQuoteUnit = "text";
        node.properties.dataQuoteStart = String(node.position.start.offset);
        node.properties.dataQuoteEnd = String(node.position.end.offset);
      }
      (node.children || []).forEach(walk);
    };
    walk(tree);
  };
}

// ---------- 从 DOM 读取引用片段 ----------
function katexTex(el) {
  const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
  return annotation?.textContent ?? "";
}

// 自由框选：按文档顺序遍历 Range 内容，文字精确到字、公式还原为 LaTeX 定界符（原子）。
// 注意 range.cloneContents() 给的是 DocumentFragment —— 它不是元素节点，必须继续下钻，
// 否则整段拖选会取到空串（历史缺陷：自由框选一直退化成整块选中）。
function rangeSource(range) {
  const parts = [];
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || "");
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList.contains("katex-display") || node.classList.contains("katex")) {
        const tex = katexTex(node);
        if (tex) parts.push(node.classList.contains("katex-display") ? `\\[${tex}\\]` : `\\(${tex}\\)`);
        return;
      }
      if (node.tagName === "BR") {
        parts.push("\n");
        return;
      }
    }
    node.childNodes?.forEach(visit);
  };
  visit(range.cloneContents());
  return parts.join("").replace(/[ \t]+\n/g, "\n").trim();
}

// 自由框选：任意拖选（跨块也行）都按 Range 精确取文——文字到字、公式还原为 LaTeX 原子
export function readRangePiece(selection, container) {
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const startEl = range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement;
  const endEl = range.endContainer instanceof HTMLElement ? range.endContainer : range.endContainer.parentElement;
  if (!startEl || !endEl) return null;
  if (container && (!container.contains(startEl) || !container.contains(endEl))) return null;
  if (startEl.closest(QUOTE_SKIP) || endEl.closest(QUOTE_SKIP)) return null;
  const source = rangeSource(range);
  if (!source) return null;
  return { source, host: startEl.closest("[data-quote-src]") };
}

// 这些容器里的内容不参与引用（引用卡片自身、托盘、操作条、输入区）
export const QUOTE_SKIP = ".quoteCard,.quoteTray,.quoteHud,.quoteToolbar,.chatComposer";

// 顶层可引用单元：排除被其它单元包裹的（li 之于 ul、公式之于段落），保证区间选择不重复
export function topUnitsWithin(root) {
  const all = [...root.querySelectorAll("[data-quote-unit]")].filter((el) => !el.closest(QUOTE_SKIP));
  return all.filter((el) => !el.parentElement?.closest("[data-quote-unit]"));
}

// 整条回答引用：收集容器内全部顶层单元（调用方补 id 并做长度限制）
export function collectUnitsWithin(root, sources) {
  return topUnitsWithin(root).map((el) => readQuoteUnit(el, sources)).filter(Boolean);
}

// 选中态回贴用的稳定键：来源消息 + 单元类型 + 源偏移（或公式 TeX）
export function quoteKeyOf(el) {
  const host = el.closest("[data-quote-src]");
  return [
    host?.dataset.quoteSrc ?? "",
    el.dataset.quoteUnit ?? "",
    el.dataset.quoteStart ?? el.dataset.quoteTex ?? "",
  ].join("|");
}

export function readQuoteUnit(el, sources) {
  const unit = el.dataset.quoteUnit;
  const host = el.closest("[data-quote-src]");
  const meta = host ? sources?.[host.dataset.quoteSrc] : null;
  if (!meta) return null;
  let source = "";
  if (unit === "text") {
    const start = Number(el.dataset.quoteStart);
    const end = Number(el.dataset.quoteEnd);
    source = Number.isFinite(start) && Number.isFinite(end) ? meta.source.slice(start, end) : el.textContent || "";
  } else if (unit === "mathInline" || unit === "mathBlock") {
    const tex = el.dataset.quoteTex || katexTex(el);
    if (!tex) return null;
    source = unit === "mathBlock" ? `\\[${tex}\\]` : `\\(${tex}\\)`;
  } else {
    return null;
  }
  const trimmed = source.trim();
  if (!trimmed) return null;
  return {
    unit,
    key: quoteKeyOf(el),
    source: trimmed,
    text: plainFromSource(trimmed),
    label: meta.label,
    paneId: meta.paneId,
    attemptId: meta.attemptId ?? null,
    requestId: meta.requestId,
  };
}
