# -*- coding: utf-8 -*-
import io
path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

old = ".fb-select option{background:#1e293b}"
new = ".fb-select option{background:#fff;color:#0f172a}"
assert old in text
text = text.replace(old, new)

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("下拉选项背景已修复为浅色")
