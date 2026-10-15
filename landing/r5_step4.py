# -*- coding: utf-8 -*-
import io
path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

old = "/* 折叠后窄轨 */"
new = """/* 窄轨按钮默认隐藏，仅 rail 模式显示 */
.chat-history .rail-btn{display:none}
.chat-history.rail .rail-btn{display:flex}
/* 折叠后窄轨 */"""
assert old in text
text = text.replace(old, new, 1)

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("rail-btn 显示逻辑已修复")
