# -*- coding: utf-8 -*-
"""第二批修复：全局加粗 SVG + 白色卡片补阴影"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. 全局加粗 SVG 线条（插在 .app 规则前）
global_svg = ".app{position:relative;z-index:1;display:flex;min-height:100vh}"
svg_rule = ("/* 全局图标线条统一加粗 */\n"
            "svg{stroke-width:2}\n"
            "svg *{stroke-width:inherit}\n\n"
            ".app{position:relative;z-index:1;display:flex;min-height:100vh}")
assert global_svg in text, "未找到 .app 规则"
text = text.replace(global_svg, svg_rule, 1)

# 2. 白色卡片统一阴影（插在 source-tag 规则后）
anchor = ".source-tag{font-size:10px;color:var(--dim);font-family:monospace;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}"
shadow_rule = anchor + """

/* 浅色卡片统一阴影层次 */
.sched-day,.related-toggle,.related-chunk,.book-card,.exam-row,.sr-item,.diag-card,.hw-card,.privacy-item{box-shadow:var(--shadow)}
.related-chunk:hover,.book-card:hover,.exam-row:hover,.sr-item:hover,.diag-card:hover,.hw-card:hover,.privacy-item:hover{box-shadow:var(--shadow-hover)}
.book-card:hover,.exam-row:hover,.sr-item:hover,.hw-card:hover,.privacy-item:hover{transform:translateY(-2px)}"""
assert anchor in text, "未找到 source-tag 规则"
text = text.replace(anchor, shadow_rule, 1)

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)

print("完成：全局 SVG 加粗 + 卡片阴影已添加")
