# -*- coding: utf-8 -*-
"""R2 Step6: 首页新增四门课"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. 添加 c5-c8 渐变色 CSS
old_css = ".c4 .course-icon{background:linear-gradient(135deg,#10b981,#06b6d4)}"
new_css = """.c4 .course-icon{background:linear-gradient(135deg,#10b981,#06b6d4)}
.course-card.c5::before{background:linear-gradient(90deg,#f97316,#ef4444)}
.course-card.c6::before{background:linear-gradient(90deg,#f59e0b,#f97316)}
.course-card.c7::before{background:linear-gradient(90deg,#ec4899,#8b5cf6)}
.course-card.c8::before{background:linear-gradient(90deg,#3b82f6,#8b5cf6)}
.c5 .course-icon{background:linear-gradient(135deg,#f97316,#ef4444)}
.c6 .course-icon{background:linear-gradient(135deg,#f59e0b,#f97316)}
.c7 .course-icon{background:linear-gradient(135deg,#ec4899,#8b5cf6)}
.c8 .course-icon{background:linear-gradient(135deg,#3b82f6,#8b5cf6)}"""
assert old_css in text
text = text.replace(old_css, new_css)
print("1. 新课渐变色 CSS 已添加")

# 2. 新增四张课程卡片（在常微分方程卡片后）
old_card = '''    <div class="course-card c4">
      <div class="course-icon">∫</div>
      <div class="course-name">常微分方程</div>
      <div class="course-topic">未开始</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:0%"></div></div>
      <div class="course-meta"><span>进度 0%</span><span>—</span></div>
    </div>
  </div>'''

new_cards = '''    <div class="course-card c4">
      <div class="course-icon">∫</div>
      <div class="course-name">常微分方程</div>
      <div class="course-topic">未开始</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:0%"></div></div>
      <div class="course-meta"><span>进度 0%</span><span>—</span></div>
    </div>
    <div class="course-card c5">
      <div class="course-icon">&lt;/&gt;</div>
      <div class="course-name">Python 程序设计</div>
      <div class="course-topic">第四章 · 函数与调试</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:35%"></div></div>
      <div class="course-meta"><span>进度 35%</span><span>2 个薄弱点</span></div>
    </div>
    <div class="course-card c6">
      <div class="course-icon">⏚</div>
      <div class="course-name">电子电路基础</div>
      <div class="course-topic">教材待补充</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:0%"></div></div>
      <div class="course-meta"><span class="tbd">教材待补充</span><span>—</span></div>
    </div>
    <div class="course-card c7">
      <div class="course-icon">♡</div>
      <div class="course-name">心理学及应用</div>
      <div class="course-topic">教材待补充</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:0%"></div></div>
      <div class="course-meta"><span class="tbd">教材待补充</span><span>—</span></div>
    </div>
    <div class="course-card c8">
      <div class="course-icon">Aa</div>
      <div class="course-name">大学英语</div>
      <div class="course-topic">教材待补充</div>
      <div class="course-progress"><div class="course-progress-bar" style="width:0%"></div></div>
      <div class="course-meta"><span class="tbd">教材待补充</span><span>—</span></div>
    </div>
  </div>'''

assert old_card in text
text = text.replace(old_card, new_cards)
print("2. 四门新课卡片已添加")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("首页课程卡片更新完成")
