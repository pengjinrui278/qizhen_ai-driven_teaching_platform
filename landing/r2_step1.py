# -*- coding: utf-8 -*-
"""R2 更新：侧边栏导航 + 页面编号调整"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. 替换侧边栏导航
old_nav = '''  <nav class="nav">
    <button class="nav-item active" onclick="go(0)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
      <span>学习首页</span>
    </button>
    <button class="nav-item" onclick="go(1)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      <span>课程学习</span>
    </button>
    <button class="nav-item" onclick="go(2)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
      <span>资源中心</span>
      <span class="nav-badge">新</span>
    </button>
    <button class="nav-item" onclick="go(3)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
      <span>我的作业</span>
    </button>
    <button class="nav-item" onclick="go(4)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      <span>学习档案</span>
    </button>
    <button class="nav-item" onclick="go(5)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span>档案与隐私</span>
    </button>
  </nav>'''

new_nav = '''  <nav class="nav">
    <button class="nav-item active" onclick="go(0)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
      <span>学习首页</span>
    </button>
    <button class="nav-item" onclick="go(1)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      <span>课程学习</span>
    </button>
    <button class="nav-item" onclick="go(2)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
      <span>资源中心</span>
    </button>
    <button class="nav-item" onclick="go(3)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
      <span>复习提纲</span>
      <span class="nav-badge">新</span>
    </button>
    <button class="nav-item" onclick="go(4)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
      <span>我的作业</span>
    </button>
    <button class="nav-item" onclick="go(5)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      <span>学习档案</span>
    </button>
    <button class="nav-item" onclick="go(6)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"/></svg>
      <span>TA 审校</span>
      <span class="nav-badge">新</span>
    </button>
    <button class="nav-item" onclick="go(7)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span>档案与隐私</span>
    </button>
  </nav>'''

assert old_nav in text, "旧导航未找到"
text = text.replace(old_nav, new_nav)
print("1. 侧边栏导航已更新")

# 2. 页面 id 重编号（倒序避免冲突）
# p5 -> p7
text = text.replace('<div class="page" id="p5">', '<div class="page" id="p7">')
# p4 -> p5
text = text.replace('<div class="page" id="p4">', '<div class="page" id="p5">')
# p3 -> p4
text = text.replace('<div class="page" id="p3">', '<div class="page" id="p4">')
print("2. 页面编号已调整（旧p3→p4, p4→p5, p5→p7）")

# 3. 更新 go() 函数注释不需要改（它用索引循环），但确认页面数
# go() 自动适配，无需改

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("侧边栏与编号调整完成")
