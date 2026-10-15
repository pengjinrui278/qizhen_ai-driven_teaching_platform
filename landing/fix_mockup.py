# -*- coding: utf-8 -*-
"""修复学镜概念稿：浅色化 + icon加粗 + 发送按钮对齐"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

pairs = [
    # 1. icon 线条加粗
    ("stroke-width:1.8", "stroke-width:2.2"),
    # 2. 学生头像背景
    (".msg-avatar.me{background:rgba(255,255,255,.1)}",
     ".msg-avatar.me{background:#e2e8f0}"),
    # 3. 聊天工具按钮
    (".chat-tool-btn{width:36px;height:36px;border-radius:9px;background:var(--glass);border:1px solid var(--border);",
     ".chat-tool-btn{width:38px;height:38px;border-radius:10px;background:#fff;border:1px solid var(--border);box-shadow:var(--shadow);"),
    (".chat-tool-btn svg{width:17px;height:17px}",
     ".chat-tool-btn svg{width:18px;height:18px}"),
    (".chat-tool-btn:hover{color:#a5b4fc;border-color:var(--primary)}",
     ".chat-tool-btn:hover{color:#6366f1;border-color:var(--primary);background:#f5f3ff}"),
    # 4. 聊天输入框
    (".chat-input{width:100%;padding:11px 44px 11px 14px;background:rgba(11,17,32,.5);",
     ".chat-input{width:100%;padding:10px 44px 10px 14px;background:#fff;line-height:1.5;"),
    # 5. 发送按钮：垂直居中，修正下移
    (".chat-send{position:absolute;right:5px;bottom:5px;width:32px;height:32px;border-radius:8px;\n  background:var(--grad);border:none;cursor:pointer;display:grid;place-items:center}",
     ".chat-send{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:32px;height:32px;border-radius:9px;\n  background:var(--grad);border:none;cursor:pointer;display:grid;place-items:center;box-shadow:0 2px 8px rgba(99,102,241,.3)}"),
    # 6. 资源中心搜索框
    (".rc-search{width:100%;padding:11px 14px 11px 38px;background:rgba(11,17,32,.5);border:1.5px solid var(--border);",
     ".rc-search{width:100%;padding:11px 14px 11px 38px;background:#fff;border:1.5px solid var(--border);"),
    # 7. 快捷键标签
    ("  background:rgba(255,255,255,.08);padding:2px 7px;border-radius:5px;color:var(--dim)}",
     "  background:#f1f5f9;padding:2px 7px;border-radius:5px;color:var(--dim)}"),
    # 8. 资源中心 tabs 容器
    (".rc-tabs{display:flex;gap:4px;margin-bottom:16px;background:rgba(11,17,32,.4);padding:4px;border-radius:10px;width:fit-content}",
     ".rc-tabs{display:flex;gap:4px;margin-bottom:16px;background:#f1f5f9;padding:4px;border-radius:10px;width:fit-content}"),
    # 9. 资源计数
    (".rc-count{font-size:10px;background:rgba(255,255,255,.1);padding:1px 7px;border-radius:99px}",
     ".rc-count{font-size:10px;background:#e2e8f0;padding:1px 7px;border-radius:99px}"),
    # 10. 反馈分布条背景
    (".outcome-bar-wrap{flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden}",
     ".outcome-bar-wrap{flex:1;height:8px;background:#eef2f7;border-radius:4px;overflow:hidden}"),
    # 11. 开关
    (".toggle{width:42px;height:24px;border-radius:99px;background:rgba(255,255,255,.12);",
     ".toggle{width:42px;height:24px;border-radius:99px;background:#cbd5e1;"),
]

count = 0
for old, new in pairs:
    if old in text:
        text = text.replace(old, new)
        count += 1
    else:
        print("NOT FOUND:", old[:50].replace("\n", " "))

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)

print("\n完成：%d / %d 处替换" % (count, len(pairs)))
