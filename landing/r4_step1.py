# -*- coding: utf-8 -*-
"""R4 Step1: 添加聊天新组件 CSS"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

new_css = """
/* ===== R4 聊天布局修订 ===== */

/* 聊天三栏布局：历史栏 | 主对话 | 关联教材 */
.chat-layout{display:flex;gap:0;height:calc(100vh - 0px);overflow:hidden}
.chat-history{width:240px;flex-shrink:0;background:#ffffff;border-right:1px solid var(--border);display:flex;flex-direction:column;transition:width .25s ease,margin .25s ease;overflow:hidden}
.chat-history.collapsed{width:0;margin-left:0;border-right:none}
.chat-history-head{padding:14px 14px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}
.chat-history-title{font-size:13px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:6px}
.chat-history-title svg{width:15px;height:15px;color:#6366f1}
.chat-history-toggle{width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;background:none;color:var(--muted);transition:all .15s}
.chat-history-toggle:hover{background:var(--bg);color:var(--text)}
.chat-history-toggle svg{width:15px;height:15px}
.new-chat-btn{margin:10px 12px;padding:8px 12px;background:var(--grad);color:#fff;border:none;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .18s;font-family:inherit;flex-shrink:0}
.new-chat-btn:hover{box-shadow:0 2px 12px rgba(99,102,241,.35);transform:translateY(-1px)}
.new-chat-btn svg{width:14px;height:14px}
.history-list{flex:1;overflow-y:auto;padding:4px 8px 12px}
.history-group-label{font-size:10.5px;font-weight:600;color:var(--dim);padding:10px 8px 4px;text-transform:uppercase;letter-spacing:.04em}
.history-item{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer;transition:all .15s;margin-bottom:2px;position:relative}
.history-item:hover{background:var(--bg)}
.history-item.active{background:rgba(99,102,241,.1);color:#4f46e5}
.history-item.active .history-item-title{color:#4f46e5;font-weight:600}
.history-item-icon{width:16px;height:16px;flex-shrink:0;color:var(--dim);margin-top:1px}
.history-item.active .history-item-icon{color:#6366f1}
.history-item-body{flex:1;min-width:0}
.history-item-title{font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4}
.history-item-time{font-size:10.5px;color:var(--dim);margin-top:2px}
.history-item-del{opacity:0;width:18px;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;border:none;background:none;color:var(--dim);cursor:pointer;transition:all .15s;flex-shrink:0}
.history-item:hover .history-item-del{opacity:1}
.history-item-del:hover{background:rgba(244,63,94,.1);color:#f43f5e}
.history-item-del svg{width:12px;height:12px}
.history-empty{text-align:center;padding:30px 16px;color:var(--dim);font-size:12px}
.history-empty svg{width:28px;height:28px;margin-bottom:8px;opacity:.4}
.history-loading{display:flex;align-items:center;gap:8px;padding:12px 16px;color:var(--dim);font-size:12px}
.history-loading .dot{width:6px;height:6px;border-radius:50%;background:var(--primary);animation:pulse 1.2s infinite}

/* 历史栏收起后的入口按钮 */
.history-reopen{position:absolute;top:16px;left:16px;z-index:10;width:32px;height:32px;border-radius:8px;background:var(--glass);border:1px solid var(--border);display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:var(--shadow);color:var(--muted)}
.history-reopen svg{width:16px;height:16px}
.chat-history.collapsed ~ .chat-main .history-reopen{display:flex}

/* 回复后操作组（替代常驻顶部 hint-pill） */
.reply-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);opacity:0;transform:translateY(4px);transition:all .3s ease;pointer-events:none}
.reply-actions.show{opacity:1;transform:translateY(0);pointer-events:auto}
.reply-action-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;background:var(--bg);border:1px solid var(--border);border-radius:7px;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .15s;font-family:inherit}
.reply-action-btn:hover{border-color:var(--primary);color:#4f46e5;background:#eef2ff}
.reply-action-btn svg{width:13px;height:13px}
.reply-action-btn:disabled{opacity:.4;cursor:not-allowed}
.reply-action-btn:disabled:hover{border-color:var(--border);color:var(--muted);background:var(--bg)}

/* 三级课程提示（替代七级） */
.hint-levels{display:flex;gap:6px;margin-bottom:12px}
.hint-level{padding:5px 12px;border-radius:7px;font-size:12px;font-weight:500;border:1px solid var(--border);background:var(--glass);color:var(--muted);cursor:pointer;transition:all .15s;font-family:inherit;display:flex;align-items:center;gap:5px}
.hint-level svg{width:13px;height:13px}
.hint-level:hover{border-color:var(--primary);color:#4f46e5}
.hint-level.active{background:rgba(99,102,241,.12);border-color:var(--primary);color:#4f46e5;font-weight:600}
.hint-level.done{background:rgba(16,185,129,.1);border-color:#10b981;color:#059669}

/* 欢迎区（按课程变化） */
.chat-welcome{padding:24px 28px;text-align:center;color:var(--muted)}
.chat-welcome h3{font-family:"Noto Serif SC",serif;font-size:20px;font-weight:700;color:var(--text);margin-bottom:6px}
.chat-welcome p{font-size:13.5px;color:var(--muted);max-width:420px;margin:0 auto}
.chat-welcome .welcome-suggest{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px}
.welcome-suggest-btn{padding:7px 14px;background:var(--glass);border:1px solid var(--border);border-radius:8px;font-size:12.5px;color:var(--text);cursor:pointer;transition:all .15s;font-family:inherit}
.welcome-suggest-btn:hover{border-color:var(--primary);color:#4f46e5;box-shadow:var(--shadow)}

/* 资源中心状态卡 */
.res-status{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:10px;margin-bottom:12px;font-size:13px}
.res-status svg{width:18px;height:18px;flex-shrink:0}
.res-status.loading{background:rgba(99,102,241,.06);color:#4f46e5;border:1px solid rgba(99,102,241,.2)}
.res-status.empty{background:rgba(100,116,139,.05);color:var(--muted);border:1px solid var(--border)}
.res-status.error{background:rgba(244,63,94,.06);color:#dc2626;border:1px solid rgba(244,63,94,.2)}
.res-status.noauth{background:rgba(245,158,11,.06);color:#b45309;border:1px solid rgba(245,158,11,.2)}

/* 课程教材状态标签 */
.course-status{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:99px}
.course-status.ready{background:rgba(16,185,129,.12);color:#059669}
.course-status.importing{background:rgba(245,158,11,.12);color:#b45309}
.course-status.pending{background:rgba(100,116,139,.1);color:#64748b}

/* 手机端历史抽屉遮罩 */
.drawer-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.4);z-index:50}
.drawer-overlay.open{display:block}
@media(max-width:768px){
  .chat-history{position:fixed;left:0;top:0;bottom:0;width:280px;z-index:60;transform:translateX(-100%);transition:transform .25s ease;box-shadow:4px 0 24px rgba(15,23,42,.15)}
  .chat-history.open{transform:translateX(0)}
  .chat-history.collapsed{width:280px;transform:translateX(-100%);border-right:1px solid var(--border)}
  .history-reopen{display:flex!important;position:static;margin:0 0 12px}
}
"""

assert "</style>" in text
text = text.replace("</style>", new_css + "\n</style>")
print("R4 新组件 CSS 已添加")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
