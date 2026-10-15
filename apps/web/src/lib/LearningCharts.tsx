"use client";
import {useState} from "react";

// 手写 SVG 图表：不引图表库。配色取自产品自己的品牌色，并跑过 dataviz 校验脚本
// （lightness band / chroma / CVD / normal-vision 全 PASS；对比度 WARN → 因此每张图
// 都同时给可见标签与数据表，值不依赖颜色或悬浮才能读到）。
export const SERIES = ["#6366f1", "#10b981", "#f59e0b", "#06b6d4", "#f43f5e"]; // 固定顺序，不循环
export const OTHER_COLOR = "#94a3b8";   // 「其他」用中性灰，不占分类槽位

function pct(value: number, total: number) {return total > 0 ? Math.round(value / total * 100) : 0;}

/** 科目占比：横向堆叠条。part-to-whole 用堆叠条而不是饼——课程名很长，
 *  横向排得下；而且任意两段都能直接比长度，不用靠角度估。 */
export function ShareBar({rows}: {rows: {key: string; label: string; value: number; color: string}[]}) {
 const [hover, setHover] = useState<string>("");
 const total = rows.reduce((sum, row) => sum + row.value, 0);
 if (!total) return null;
 return <div className="lcShare">
  <div className="lcStack" role="img" aria-label={`科目占比：${rows.map(r => `${r.label} ${r.value} 条`).join("，")}`}>
   {rows.map(row => {
    const share = pct(row.value, total);
    return <span key={row.key} className="lcSeg" style={{flexGrow: row.value, background: row.color}}
      onMouseEnter={() => setHover(row.key)} onMouseLeave={() => setHover("")}
      title={`${row.label}：${row.value} 条（${share}%）`}>
     {/* 只在段内放得下时才内嵌标签，放不下就留给图例与数据表 */}
     {share >= 12 && <span className="lcSegLabel">{share}%</span>}
    </span>;
   })}
  </div>
  <ul className="lcLegend">{rows.map(row =>
   <li key={row.key} data-hover={hover === row.key ? "true" : undefined}>
    <span className="lcSwatch" style={{background: row.color}} aria-hidden="true"/>
    <span className="lcLegendLabel">{row.label}</span>
    <strong>{row.value}</strong><span className="lcMuted">条 · {pct(row.value, total)}%</span>
   </li>)}
  </ul>
 </div>;
}

/** 活动趋势：两张小倍数柱图共用一套刻度。刻意不做双 Y 轴——
 *  两条不同量纲的线叠在一张图上会凭空造出相关性。 */
export function TrendColumns({weeks, series}: {
 weeks: {label: string; full: string}[];
 series: {key: string; title: string; color: string; values: number[]}[];
}) {
 const [hover, setHover] = useState<{key: string; index: number} | null>(null);
 if (!weeks.length || !series.length) return null;
 const peak = Math.max(1, ...series.flatMap(s => s.values));   // 两图共用，才可比
 const W = 320, H = 170, PAD_L = 30, PAD_B = 26, PAD_T = 14;
 const plotW = W - PAD_L - 12, plotH = H - PAD_B - PAD_T;
 const step = plotW / weeks.length, barW = Math.max(6, Math.min(26, step - 6));
 const ticks = [0, Math.round(peak / 2), peak];
 const hovered = hover ? series.find(s => s.key === hover.key)?.values[hover.index] : null;

 return <div className="lcTrend">
  {series.map(item => <figure className="lcTrendFigure" key={item.key}>
   <figcaption>{item.title}</figcaption>
   <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${item.title}：${weeks.map((w, i) => `${w.label} ${item.values[i]}`).join("，")}`}>
    {/* 网格：实线细发丝，绝不用虚线 */}
    {ticks.map(tick => <g key={tick}>
     <line x1={PAD_L} x2={W - 12} y1={PAD_T + plotH - tick / peak * plotH} y2={PAD_T + plotH - tick / peak * plotH}
      stroke="#e2e8f0" strokeWidth="1"/>
     <text x={PAD_L - 6} y={PAD_T + plotH - tick / peak * plotH + 4} textAnchor="end" className="lcTick">{tick}</text>
    </g>)}
    {weeks.map((week, index) => {
     const value = item.values[index] || 0;
     const height = value / peak * plotH;
     const x = PAD_L + index * step + (step - barW) / 2;
     const y = PAD_T + plotH - height;
     const active = hover?.key === item.key && hover.index === index;
     return <g key={week.label}>
      {/* 命中区域比柱子宽，别让人对准 6px 的柱子点 */}
      <rect x={PAD_L + index * step} y={PAD_T} width={step} height={plotH} fill="transparent"
        onMouseEnter={() => setHover({key: item.key, index})} onMouseLeave={() => setHover(null)}/>
      {value > 0 && <rect x={x} y={y} width={barW} height={Math.max(2, height)} rx="4"
        fill={item.color} opacity={hover && !active ? 0.45 : 1}/>}
      <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="lcTick">{week.label}</text>
     </g>;
    })}
    <line x1={PAD_L} x2={W - 12} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke="#cbd5e1" strokeWidth="1"/>
   </svg>
  </figure>)}
  <p className="lcTip" role="status">
   {hover&&hovered!=null ? `${series.find(s=>s.key===hover.key)?.title} · ${weeks[hover.index].full}：${hovered}` : "把指针停在柱子上可以看具体数值；下方数据表里有全部数字。"}
  </p>
 </div>;
}

/** 每张图都配一份数据表，值不靠颜色也不靠悬浮才能读到。 */
export function ChartTable({caption, head, rows}: {caption: string; head: string[]; rows: (string | number)[][]}) {
 return <details className="lcTable">
  <summary>{caption}（数据表）</summary>
  <table><thead><tr>{head.map(cell => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
   <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, i) =>
    i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>)}</tr>)}</tbody></table>
 </details>;
}
