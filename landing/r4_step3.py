# -*- coding: utf-8 -*-
"""R4 Step3: 更新首页课程状态 + 资源中心状态"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. 更新首页课程卡片状态
# Python：课程可进入，教材暂缓
old_py = '''    <div class="course-card c5">
      <div class="course-icon">&lt;/&gt;</div>
      <div class="course-name">Python 程序设计</div>
      <div class="course-topic">第四章 · 函数与调试</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:35%"></div></div>
      <div class="course-meta"><span>进度 35%</span><span>2 个薄弱点</span></div>
    </div>'''
new_py = '''    <div class="course-card c5">
      <div class="course-icon">&lt;/&gt;</div>
      <div class="course-name">Python 程序设计</div>
      <div class="course-topic">第四章 · 函数与调试</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:35%"></div></div>
      <div class="course-meta"><span>进度 35%</span><span class="course-status pending">教材暂缓</span></div>
    </div>'''
assert old_py in text
text = text.replace(old_py, new_py)
print("1. Python 卡片状态已更新")

# 电子电路：教材导入中
old_circuit = '''    <div class="course-card c6">
      <div class="course-icon">⏚</div>
      <div class="course-name">电子电路基础</div>
      <div class="course-topic">教材待补充</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:0%"></div></div>
      <div class="course-meta"><span class="tbd">教材待补充</span><span>—</span></div>
    </div>'''
new_circuit = '''    <div class="course-card c6">
      <div class="course-icon">⏚</div>
      <div class="course-name">电子电路基础</div>
      <div class="course-topic">第一章 · 电路基本定律</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:12%"></div></div>
      <div class="course-meta"><span>进度 12%</span><span class="course-status importing">教材导入中</span></div>
    </div>'''
assert old_circuit in text
text = text.replace(old_circuit, new_circuit)
print("2. 电子电路卡片状态已更新")

# 心理学：教材暂缓
old_psych = '''    <div class="course-card c7">
      <div class="course-icon">♡</div>
      <div class="course-name">心理学及应用</div>
      <div class="course-topic">教材待补充</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:0%"></div></div>
      <div class="course-meta"><span class="tbd">教材待补充</span><span>—</span></div>
    </div>'''
new_psych = '''    <div class="course-card c7">
      <div class="course-icon">♡</div>
      <div class="course-name">心理学及应用</div>
      <div class="course-topic">课程可进入 · 教材暂缓收录</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:0%"></div></div>
      <div class="course-meta"><span>进度 0%</span><span class="course-status pending">教材暂缓</span></div>
    </div>'''
assert old_psych in text
text = text.replace(old_psych, new_psych)
print("3. 心理学卡片状态已更新")

# 大学英语：教材暂缓
old_eng = '''    <div class="course-card c8">
      <div class="course-icon">Aa</div>
      <div class="course-name">大学英语</div>
      <div class="course-topic">教材待补充</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:0%"></div></div>
      <div class="course-meta"><span class="tbd">教材待补充</span><span>—</span></div>
    </div>'''
new_eng = '''    <div class="course-card c8">
      <div class="course-icon">Aa</div>
      <div class="course-name">大学英语</div>
      <div class="course-topic">课程可进入 · 教材暂缓收录</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:0%"></div></div>
      <div class="course-meta"><span>进度 0%</span><span class="course-status pending">教材暂缓</span></div>
    </div>'''
assert old_eng in text
text = text.replace(old_eng, new_eng)
print("4. 大学英语卡片状态已更新")

# 2. 资源中心：在教材库 grid 前加状态说明（书目搜索+原PDF入口）
# 在 book-grid 前插入资源类型说明
old_grid = '''  <div class="book-grid">'''
new_grid = '''  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:12px;color:var(--muted)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:14px;height:14px;color:#6366f1"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
    书目检索 · 点击封面查看原 PDF 入口 · 未授权资源需教师开通
  </div>
  <div class="book-grid">'''
assert old_grid in text
text = text.replace(old_grid, new_grid, 1)
print("5. 资源中心书目说明已添加")

# 在真题卷列表前加一个加载失败/无资源的状态示例（演示态）
old_exam = '''  <div style="margin-top:28px">
    <div class="gcard-title" style="margin-bottom:12px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
      历年期末真题卷
    </div>
    <div class="exam-list">'''
new_exam = '''  <div style="margin-top:28px">
    <div class="gcard-title" style="margin-bottom:12px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
      历年期末真题卷
    </div>
    <div class="res-status noauth">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      部分试卷需课程授权后查看原卷 · 当前账号已授权 3 份，其余仅可见题录
    </div>
    <div class="exam-list">'''
assert old_exam in text
text = text.replace(old_exam, new_exam)
print("6. 资源中心授权状态提示已添加")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("首页和资源中心更新完成")
