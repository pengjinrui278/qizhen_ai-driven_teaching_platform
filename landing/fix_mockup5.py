# -*- coding: utf-8 -*-
import io
path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

old = ".nav-badge{position:absolute;top:0;left:17px;font-size:9px;background:#f43f5e;color:#fff;padding:0 5px;border-radius:99px;font-weight:600;line-height:1.5;box-shadow:0 1px 4px rgba(244,63,94,.4)}"
new = ".nav-badge{position:absolute;top:2px;left:9px;font-size:9px;background:#f43f5e;color:#fff;padding:0 5px;border-radius:99px;font-weight:600;line-height:1.5;box-shadow:0 1px 4px rgba(244,63,94,.4)}"
assert old in text
text = text.replace(old, new)
with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("角标位置已微调")
