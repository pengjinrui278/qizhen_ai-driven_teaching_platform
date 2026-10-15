# -*- coding: utf-8 -*-
"""R2 Step2: 添加新组件 CSS"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

new_css = """
/* ===== R2 新增组件 ===== */

/* 课程子导航 */
.subtabs{display:flex;gap:4px;background:var(--bg);padding:4px;border-radius:10px;border:1px solid var(--border);margin-bottom:16px;flex-wrap:wrap}
.subtab{padding:6px 14px;border-radius:7px;font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .18s;border:none;background:none;font-family:inherit;white-space:nowrap}
.subtab:hover{color:var(--text)}
.subtab.active{background:var(--glass);color:#4f46e5;font-weight:600;box-shadow:var(--shadow)}

/* 工作状态指示 */
.work-status{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);padding:8px 12px;background:var(--bg);border-radius:8px;margin-bottom:12px}
.work-status .dot{width:6px;height:6px;border-radius:50%;background:var(--cyan);animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* 筛选条 */
.filter-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.filter-group{display:flex;gap:6px;align-items:center}
.filter-label{font-size:12px;color:var(--dim);margin-right:2px}

/* 结果列表项 */
.result-item{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;background:var(--glass);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;transition:all .18s;cursor:pointer}
.result-item:hover{box-shadow:var(--shadow-hover);border-color:#c7d2fe}
.result-icon{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:rgba(99,102,241,.1);color:#6366f1}
.result-icon svg{width:18px;height:18px;stroke-width:2}
.result-body{flex:1;min-width:0}
.result-title{font-size:14px;font-weight:600;color:var(--text);margin-bottom:3px}
.result-meta{font-size:12px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap}
.result-snippet{font-size:12.5px;color:var(--muted);margin-top:5px;line-height:1.55}
.result-snippet mark{background:rgba(99,102,241,.2);color:#4338ca;border-radius:3px;padding:0 2px;font-weight:600}
.result-tag{font-size:10.5px;padding:2px 8px;border-radius:99px;font-weight:600}
.tag-title{background:rgba(99,102,241,.12);color:#4f46e5}
.tag-body{background:rgba(6,182,212,.12);color:#0e7490}

/* 试卷详情分区 */
.paper-sections{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
@media(max-width:900px){.paper-sections{grid-template-columns:1fr}}
.paper-section{background:var(--bg);border-radius:10px;padding:14px}
.paper-section h4{font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text);display:flex;align-items:center;gap:6px}

/* 复习提纲：步骤条 */
.stepper{display:flex;align-items:center;margin-bottom:24px;padding:16px 20px;background:var(--glass);border-radius:12px;border:1px solid var(--border)}
.step{display:flex;align-items:center;gap:8px;flex:1}
.step-num{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
.step.done .step-num{background:var(--primary);color:#fff}
.step.active .step-num{background:var(--grad);color:#fff;box-shadow:0 0 0 4px rgba(99,102,241,.15)}
.step.todo .step-num{background:var(--bg);color:var(--dim);border:1.5px solid var(--border)}
.step-label{font-size:12.5px;font-weight:500;white-space:nowrap}
.step.done .step-label{color:var(--muted)}
.step.active .step-label{color:#4f46e5;font-weight:600}
.step.todo .step-label{color:var(--dim)}
.step-line{flex:1;height:2px;background:var(--border);margin:0 8px;border-radius:1px}
.step.done+.step-line{background:var(--primary)}

/* 考点卡片 */
.kp-card{background:var(--glass);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px;transition:all .18s}
.kp-card:hover{box-shadow:var(--shadow-hover)}
.kp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.kp-name{font-size:14px;font-weight:600;color:var(--text)}
.kp-status{font-size:11px;padding:3px 10px;border-radius:99px;font-weight:600}
.kp-full{background:rgba(16,185,129,.12);color:#059669}
.kp-partial{background:rgba(245,158,11,.12);color:#b45309}
.kp-missing{background:rgba(239,68,68,.1);color:#dc2626}
.kp-conflict{background:rgba(139,92,246,.12);color:#7c3aed}
.kp-meta{font-size:12px;color:var(--muted);line-height:1.6}
.kp-meta strong{color:var(--text);font-weight:600}
.kp-source{display:inline-block;margin-right:10px;font-size:11.5px;color:#6366f1}

/* 覆盖率 */
.coverage-bar{background:var(--glass);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:16px}
.coverage-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.coverage-pct{font-size:24px;font-weight:700;color:#4f46e5}
.coverage-track{height:8px;background:var(--bg);border-radius:4px;overflow:hidden}
.coverage-fill{height:100%;background:var(--grad);border-radius:4px}
.coverage-note{font-size:11.5px;color:var(--dim);margin-top:8px}

/* TA 审校：状态流 */
.ta-flow{display:flex;align-items:center;gap:0;margin-bottom:20px;padding:14px 18px;background:var(--glass);border-radius:10px;border:1px solid var(--border);overflow-x:auto}
.ta-step{display:flex;align-items:center;gap:6px;white-space:nowrap}
.ta-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.ta-dot.done{background:var(--primary)}
.ta-dot.active{background:var(--cyan);box-shadow:0 0 0 4px rgba(6,182,212,.15)}
.ta-dot.todo{background:var(--border)}
.ta-step-label{font-size:12px;font-weight:500;color:var(--muted)}
.ta-step.active .ta-step-label{color:var(--text);font-weight:600}
.ta-arrow{width:24px;height:2px;background:var(--border);margin:0 8px}

/* TA 并排对比 */
.ta-compare{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
@media(max-width:900px){.ta-compare{grid-template-columns:1fr}}
.ta-pane{background:var(--glass);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.ta-pane-head{padding:10px 14px;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px}
.ta-pane-student .ta-pane-head{background:rgba(100,116,139,.06);color:var(--text)}
.ta-pane-ai .ta-pane-head{background:rgba(99,102,241,.08);color:#4f46e5}
.ta-pane-body{padding:14px;font-size:13px;line-height:1.7;color:var(--text)}
.ta-evidence{margin-top:10px;padding:10px 12px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--muted);border-left:3px solid var(--cyan)}

/* TA 操作按钮 */
.ta-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ta-btn{padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all .18s;border:none;font-family:inherit}
.ta-btn-approve{background:var(--primary);color:#fff}
.ta-btn-approve:hover{background:#4f46e5;box-shadow:var(--shadow-hover)}
.ta-btn-edit{background:var(--glass);color:var(--text);border:1px solid var(--border)}
.ta-btn-edit:hover{border-color:var(--primary);color:var(--primary)}
.ta-btn-reject{background:var(--glass);color:#dc2626;border:1px solid #fecaca}
.ta-btn-reject:hover{background:#fef2f2}

/* 空态 */
.empty-state{text-align:center;padding:40px 20px;color:var(--dim)}
.empty-state svg{width:40px;height:40px;margin-bottom:12px;stroke-width:1.5;opacity:.5}
.empty-state h4{font-size:14px;color:var(--muted);margin-bottom:4px}
.empty-state p{font-size:12.5px}

/* 教材待补充标签 */
.tbd{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#b45309;background:rgba(245,158,11,.1);padding:2px 8px;border-radius:99px;font-weight:600}

/* 课程选择器 */
.course-picker{display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--glass);border:1px solid var(--border);border-radius:10px;margin-bottom:16px;cursor:pointer;font-size:13.5px;font-weight:600;color:var(--text)}
.course-picker:hover{border-color:#c7d2fe}
.course-picker svg{width:16px;height:16px;color:var(--muted)}

/* 代码块（Python） */
.code-block{background:#0f172a;color:#e2e8f0;border-radius:10px;padding:14px 16px;font-family:'Cascadia Code',Consolas,monospace;font-size:12.5px;line-height:1.6;overflow-x:auto;margin:10px 0}
.code-block .ln{color:#64748b;display:inline-block;width:2em;user-select:none}
.code-err{background:rgba(239,68,68,.15);border-radius:4px;padding:1px 4px;color:#fca5a5}
"""

assert "</style>" in text
text = text.replace("</style>", new_css + "\n</style>")
print("CSS 新组件样式已添加")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
