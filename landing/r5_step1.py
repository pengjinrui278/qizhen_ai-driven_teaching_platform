# -*- coding: utf-8 -*-
"""R5 Step1: 添加活动时间线/课程阶段/待复习/窄轨 CSS"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

new_css = """
/* ===== R5 侧栏与反馈样式 ===== */

/* 会话列表新样式：透明无描边、悬停浅蓝、选中略深 */
.history-item{background:transparent;border:none;font-size:13px;padding:7px 10px}
.history-item:hover{background:#f0f5ff}
.history-item.active{background:#e6eeff}
.history-item.active .history-item-title{color:#1d4ed8;font-weight:600}
.history-item.active .history-item-icon{color:#3b82f6}
.history-item-time{display:none}
.history-item:hover .history-item-time{display:block}
.history-group-label{padding:12px 8px 6px}

/* 折叠后窄轨 */
.chat-history.rail{width:14px;padding:0;border-right:1px solid var(--border);background:#fff;display:flex;align-items:flex-start;justify-content:center;padding-top:14px;cursor:pointer}
.chat-history.rail .rail-btn{width:12px;height:36px;border-radius:6px;background:var(--bg);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;color:var(--muted)}
.chat-history.rail .rail-btn:hover{background:#e0eaff;color:#3b82f6}
.chat-history.rail .rail-btn svg{width:10px;height:10px}
.chat-history.rail > *:not(.rail-btn){display:none}

/* 左栏课程选择器（唯一入口） */
.history-course{margin:10px 12px 4px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:6px;cursor:pointer;background:#fff;color:var(--text)}
.history-course:hover{border-color:#93c5fd;background:#f8fbff}
.history-course svg{width:14px;height:14px;color:#3b82f6}
.history-course .chev{margin-left:auto;color:var(--dim)}

/* 课程阶段概览 */
.stage-overview{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:20px}
.stage-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow)}
.stage-card-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.stage-card-icon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center}
.stage-card-icon svg{width:15px;height:15px}
.stage-card-name{font-size:13.5px;font-weight:600;color:var(--text)}
.stage-card-chapter{font-size:12px;color:#3b82f6;font-weight:500;margin-bottom:4px}
.stage-card-note{font-size:11px;color:var(--dim)}

/* 活动时间线 */
.activity-timeline{position:relative;padding-left:28px}
.activity-timeline::before{content:"";position:absolute;left:9px;top:8px;bottom:8px;width:2px;background:linear-gradient(180deg,#93c5fd,#dbeafe)}
.activity-item{position:relative;padding:12px 14px;background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:10px;box-shadow:var(--shadow);transition:all .18s}
.activity-item:hover{box-shadow:var(--shadow-hover);border-color:#bfdbfe}
.activity-item::before{content:"";position:absolute;left:-23px;top:18px;width:10px;height:10px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 0 2px #bfdbfe}
.activity-item.pending::before{background:#cbd5e1;box-shadow:0 0 0 2px #e2e8f0}
.activity-item.failed::before{background:#f87171;box-shadow:0 0 0 2px #fecaca}
.activity-head{display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap}
.activity-type{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#1d4ed8;background:#eff6ff;padding:2px 8px;border-radius:6px}
.activity-type svg{width:11px;height:11px}
.activity-course{font-size:11px;color:var(--dim)}
.activity-time{font-size:10.5px;color:var(--dim);margin-left:auto}
.activity-title{font-size:13px;font-weight:500;color:var(--text);line-height:1.5}
.activity-title .src{color:#3b82f6;font-size:11.5px;margin-left:6px;cursor:pointer;text-decoration:none}
.activity-title .src:hover{text-decoration:underline}
.activity-title .classified{font-size:10.5px;color:var(--dim);background:var(--bg);padding:1px 6px;border-radius:4px;margin-left:6px}

/* 待复习事项 */
.review-item{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;box-shadow:var(--shadow)}
.review-item-icon{width:30px;height:30px;border-radius:8px;background:#eff6ff;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.review-item-icon svg{width:15px;height:15px;color:#3b82f6}
.review-item-body{flex:1;min-width:0}
.review-item-name{font-size:13.5px;font-weight:600;color:var(--text);margin-bottom:3px}
.review-item-evidence{font-size:12px;color:var(--muted);line-height:1.5}
.review-item-evidence .weak{color:#94a3b8;font-style:italic}
.review-item-link{font-size:11.5px;color:#3b82f6;cursor:pointer;margin-top:4px;display:inline-flex;align-items:center;gap:4px}
.review-item-link:hover{text-decoration:underline}

/* 资源封面 cover */
.book-cover{overflow:hidden}
.book-cover img,.book-cover .cover-img{width:100%;height:100%;object-fit:cover}
"""

assert "</style>" in text
text = text.replace("</style>", new_css + "\n</style>")
print("R5 CSS 已添加")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
