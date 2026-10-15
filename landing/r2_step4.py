# -*- coding: utf-8 -*-
"""R2 Step4: 课程学习页加子导航 + 工作状态指示"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. 课程子导航
old = '''<div class="chat-layout">
    <div class="chat-main">
      <div class="chat-toolbar">'''
new = '''<div class="chat-layout">
    <div class="chat-main">
      <div class="subtabs">
        <button class="subtab active">对话</button>
        <button class="subtab">教材与资源</button>
        <button class="subtab">例题习题</button>
        <button class="subtab">真题卷</button>
        <button class="subtab">我的笔记</button>
        <button class="subtab">复习提纲</button>
      </div>
      <div class="chat-toolbar">'''
assert old in text
text = text.replace(old, new)
print("1. 子导航已加")

# 2. 工作状态：在 </button> （toggle 结束）后、related-chunk 前插入
old2 = '''关联教材段落
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-left:auto"><path d="M9 18l6-6-6-6"/></svg>
      </button>
      <div class="related-chunk">'''
new2 = '''关联教材段落
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-left:auto"><path d="M9 18l6-6-6-6"/></svg>
      </button>
      <div class="work-status"><span class="dot"></span>查找主教材 · 华东师大《数学分析》第五版</div>
      <div class="related-chunk">'''
assert old2 in text, "marker2 not found"
text = text.replace(old2, new2, 1)
print("2. 工作状态已加")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("完成")
