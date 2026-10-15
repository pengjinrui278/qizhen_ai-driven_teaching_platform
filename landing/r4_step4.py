# -*- coding: utf-8 -*-
"""R4 Step4: 修复手机端聊天布局"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 在 R4 CSS 的 @media 块中补充主对话区和关联教材的手机端处理
old_media = '''@media(max-width:768px){
  .chat-history{position:fixed;left:0;top:0;bottom:0;width:280px;z-index:60;transform:translateX(-100%);transition:transform .25s ease;box-shadow:4px 0 24px rgba(15,23,42,.15)}
  .chat-history.open{transform:translateX(0)}
  .chat-history.collapsed{width:280px;transform:translateX(-100%);border-right:1px solid var(--border)}
  .history-reopen{display:flex!important;position:static;margin:0 0 12px}
}'''

new_media = '''@media(max-width:768px){
  .chat-history{position:fixed;left:0;top:0;bottom:0;width:280px;z-index:60;transform:translateX(-100%);transition:transform .25s ease;box-shadow:4px 0 24px rgba(15,23,42,.15)}
  .chat-history.open{transform:translateX(0)}
  .chat-history.collapsed{width:280px;transform:translateX(-100%);border-right:1px solid var(--border)}
  .history-reopen{display:flex!important;position:static;margin:0 0 12px}
  .chat-main{width:100%;max-width:100%;padding:12px}
  .related-panel{display:none}
  .chat-layout{height:auto;min-height:100vh}
  .chat-messages{max-height:none}
  .subtabs{overflow-x:auto;flex-wrap:nowrap}
  .subtab{white-space:nowrap;flex-shrink:0}
  .hint-levels{overflow-x:auto;flex-wrap:nowrap}
  .hint-level{white-space:nowrap;flex-shrink:0}
  .chat-welcome{padding:16px 12px}
  .chat-welcome h3{font-size:17px}
  .welcome-suggest{flex-direction:column;align-items:stretch}
  .welcome-suggest-btn{width:100%}
}'''

assert old_media in text, "media block not found"
text = text.replace(old_media, new_media)
print("手机端聊天布局已修复")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
