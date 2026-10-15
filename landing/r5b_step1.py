# -*- coding: utf-8 -*-
"""R5B Step1: 聊天页同步——去删除按钮、折叠栏44px/按钮36px、触屏时间常显"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. 去掉所有历史项删除按钮
import re
del_pattern = re.compile(r'\s*<button class="history-item-del">.*?</button>', re.S)
n = len(del_pattern.findall(text))
text = del_pattern.sub("", text)
print("1. 已删除 %d 个删除按钮（删除动作未冻结）" % n)

# 2. 折叠栏 14px -> 44px，按钮 36px
text = text.replace(
    ".chat-history.rail{width:14px;padding:0;border-right:1px solid var(--border);background:#fff;display:flex;align-items:flex-start;justify-content:center;padding-top:14px;cursor:pointer}",
    ".chat-history.rail{width:44px;padding:0;border-right:1px solid var(--border);background:#fff;display:flex;align-items:flex-start;justify-content:center;padding-top:14px;cursor:pointer;flex-shrink:0}"
)
text = text.replace(
    ".chat-history.rail .rail-btn{width:12px;height:36px;border-radius:6px;background:var(--bg);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;color:var(--muted)}",
    ".chat-history.rail .rail-btn{width:36px;height:36px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;color:var(--muted)}"
)
text = text.replace(
    ".chat-history.rail .rail-btn svg{width:10px;height:10px}",
    ".chat-history.rail .rail-btn svg{width:16px;height:16px}"
)
print("2. 折叠栏改为 44px，按钮 36px")

# 3. 触屏时间常显（hover 显示改为：触屏/键盘聚焦常显，桌面 hover 显示）
text = text.replace(
    ".history-item-time{display:none}\n.history-item:hover .history-item-time{display:block}",
    ".history-item-time{display:inline}\n@media(hover:hover) and (pointer:fine){.history-item-time{display:none}.history-item:hover .history-item-time,.history-item:focus-within .history-item-time{display:inline}}"
)
print("3. 触屏时间常显，桌面 hover/聚焦显示")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("聊天页 R5B 同步完成")
