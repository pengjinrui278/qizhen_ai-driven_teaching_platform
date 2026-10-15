# -*- coding: utf-8 -*-
"""R5 Step3: 聊天页课程选择器移左栏 + 窄轨折叠"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. 折叠按钮改为 rail 模式
old_toggle = '''<button class="chat-history-toggle" onclick="document.getElementById('chatHistory').classList.toggle('collapsed')" title="收起">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <button class="new-chat-btn">'''
new_toggle = '''<button class="chat-history-toggle" onclick="var h=document.getElementById('chatHistory');h.className='chat-history rail'" title="收起为窄轨">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <button class="history-course">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        数学分析
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <button class="new-chat-btn">'''
assert old_toggle in text
text = text.replace(old_toggle, new_toggle)
print("1. 课程选择器已移左栏，折叠改为窄轨")

# 2. 在 chat-history 开头加窄轨展开按钮（rail 模式下可见）
old_hist = '''<div class="chat-history" id="chatHistory">
      <div class="chat-history-head">'''
new_hist = '''<div class="chat-history" id="chatHistory">
      <button class="rail-btn" onclick="document.getElementById('chatHistory').className='chat-history'">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 18l6-6-6-6"/></svg>
      </button>
      <div class="chat-history-head">'''
assert old_hist in text
text = text.replace(old_hist, new_hist)
print("2. 窄轨展开按钮已加")

# 3. 主对话区去掉 course-select（课程选择唯一入口在左栏）
old_cs = '''      <div class="chat-toolbar">
        <div class="course-select">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
          数学分析
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <!-- 三级课程提示：方向 / 关键步骤 / 整体解题流程 -->'''
new_cs = '''      <div class="chat-toolbar">
        <!-- 三级课程提示：方向 / 关键步骤 / 整体解题流程 -->'''
assert old_cs in text
text = text.replace(old_cs, new_cs)
print("3. 主对话区课程下拉已移除（唯一入口在左栏）")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("聊天页更新完成")
