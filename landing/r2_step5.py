# -*- coding: utf-8 -*-
"""R2 Step5: 资源中心多维筛选"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

old = '''  <div class="rc-filters">
    <button class="rc-filter active">全部课程</button>
    <button class="rc-filter">数学分析</button>
    <button class="rc-filter">高等代数</button>
    <button class="rc-filter">大学物理</button>
  </div>'''

new = '''  <div class="filter-bar">
    <div class="filter-group">
      <span class="filter-label">课程</span>
      <button class="rc-filter active">全部</button>
      <button class="rc-filter">数学分析</button>
      <button class="rc-filter">高等代数</button>
      <button class="rc-filter">大学物理</button>
      <button class="rc-filter">Python</button>
    </div>
    <div class="filter-group">
      <span class="filter-label">类型</span>
      <button class="rc-filter active">全部</button>
      <button class="rc-filter">教材</button>
      <button class="rc-filter">讲义</button>
      <button class="rc-filter">PPT</button>
      <button class="rc-filter">试卷</button>
    </div>
    <div class="filter-group">
      <span class="filter-label">主辅</span>
      <button class="rc-filter active">全部</button>
      <button class="rc-filter">主教材</button>
      <button class="rc-filter">辅教材</button>
    </div>
    <div class="filter-group">
      <span class="filter-label">学年</span>
      <button class="rc-filter active">全部</button>
      <button class="rc-filter">2025-2026</button>
      <button class="rc-filter">2024-2025</button>
    </div>
  </div>'''

assert old in text, "rc-filters not found"
text = text.replace(old, new)
print("资源中心四维筛选条已添加")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
