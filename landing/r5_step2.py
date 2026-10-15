# -*- coding: utf-8 -*-
"""R5 Step2: 重构学习反馈页 p5"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

start_marker = '<div class="page" id="p5">'
end_marker = '<div class="page" id="p6">'
start_idx = text.find(start_marker)
end_idx = text.find(end_marker)
assert start_idx != -1 and end_idx != -1

new_p5 = '''<div class="page" id="p5">
  <div class="page-head">
    <div>
      <div class="page-title">学习反馈</div>
      <div class="page-sub">课程活动记录与待复习事项 · 活动不等于已掌握</div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" style="padding:7px 14px;font-size:12.5px">近 14 天</button>
    </div>
  </div>

  <!-- 课程阶段概览（不显示百分比/分数） -->
  <div style="font-size:14px;font-weight:600;margin-bottom:10px;color:var(--text)">课程阶段</div>
  <div class="stage-overview">
    <div class="stage-card">
      <div class="stage-card-head">
        <div class="stage-card-icon" style="background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(99,102,241,.05))">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:#6366f1"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        </div>
        <div class="stage-card-name">数学分析</div>
      </div>
      <div class="stage-card-chapter">第三章 · 函数极限</div>
      <div class="stage-card-note">最近活动：今天 14:32</div>
    </div>
    <div class="stage-card">
      <div class="stage-card-head">
        <div class="stage-card-icon" style="background:rgba(6,182,212,.12)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:#0891b2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        </div>
        <div class="stage-card-name">高等代数</div>
      </div>
      <div class="stage-card-chapter">第二章 · 矩阵运算</div>
      <div class="stage-card-note">最近活动：昨天 16:20</div>
    </div>
    <div class="stage-card">
      <div class="stage-card-head">
        <div class="stage-card-icon" style="background:rgba(139,92,246,.12)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:#7c3aed"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        </div>
        <div class="stage-card-name">大学物理</div>
      </div>
      <div class="stage-card-chapter">第一章 · 质点运动学</div>
      <div class="stage-card-note">最近活动：3 天前</div>
    </div>
    <div class="stage-card">
      <div class="stage-card-head">
        <div class="stage-card-icon" style="background:rgba(249,115,22,.12)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:#ea580c"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        </div>
        <div class="stage-card-name">Python</div>
      </div>
      <div class="stage-card-chapter">第四章 · 函数与调试</div>
      <div class="stage-card-note">最近活动：4 天前</div>
    </div>
  </div>

  <!-- 活动时间线 -->
  <div style="font-size:14px;font-weight:600;margin:24px 0 12px;color:var(--text)">活动时间线</div>
  <div class="activity-timeline">

    <div class="activity-item">
      <div class="activity-head">
        <span class="activity-type">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          提问
        </span>
        <span class="activity-course">数学分析</span>
        <span class="activity-time">今天 14:32</span>
      </div>
      <div class="activity-title">
        数列极限证明思路：三角不等式反向形式的应用
        <a class="src">查看来源</a>
      </div>
    </div>

    <div class="activity-item">
      <div class="activity-head">
        <span class="activity-type">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
          查看教材
        </span>
        <span class="activity-course">数学分析</span>
        <span class="activity-time">今天 14:18</span>
      </div>
      <div class="activity-title">
        第一章 §1.3 三角不等式
        <a class="src">教材出处</a>
      </div>
    </div>

    <div class="activity-item">
      <div class="activity-head">
        <span class="activity-type">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
          练习
        </span>
        <span class="activity-course">数学分析</span>
        <span class="activity-time">今天 10:15</span>
      </div>
      <div class="activity-title">
        一致连续判别方法：尝试完成例题
        <span class="classified">主题分类</span>
      </div>
    </div>

    <div class="activity-item pending">
      <div class="activity-head">
        <span class="activity-type" style="background:#f1f5f9;color:#64748b">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          等待中
        </span>
        <span class="activity-course">高等代数</span>
        <span class="activity-time">昨天 21:44</span>
      </div>
      <div class="activity-title" style="color:#94a3b8">
        矩阵秩的求法：请求未完成，仍可查看问题
      </div>
    </div>

    <div class="activity-item failed">
      <div class="activity-head">
        <span class="activity-type" style="background:#fef2f2;color:#dc2626">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
          未完成
        </span>
        <span class="activity-course">数学分析</span>
        <span class="activity-time">昨天 20:08</span>
      </div>
      <div class="activity-title" style="color:#94a3b8">
        实数完备性定理：请求失败，可重试
      </div>
    </div>

    <div class="activity-item">
      <div class="activity-head">
        <span class="activity-type">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          提问
        </span>
        <span class="activity-course">高等代数</span>
        <span class="activity-time">昨天 16:20</span>
      </div>
      <div class="activity-title">
        矩阵初等变换与秩的关系
        <span class="classified">主题分类</span>
      </div>
    </div>

  </div>

  <!-- 待复习事项（有证据才显示） -->
  <div style="font-size:14px;font-weight:600;margin:28px 0 12px;color:var(--text)">待复习事项</div>

  <div class="review-item">
    <div class="review-item-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
    </div>
    <div class="review-item-body">
      <div class="review-item-name">一致连续的判别</div>
      <div class="review-item-evidence">
        2 次请求提示后完成，未独立完成判别例题
        <span class="weak">· 学生自报理解为弱证据</span>
      </div>
      <a class="review-item-link">针对性练习</a>
    </div>
  </div>

  <div class="review-item">
    <div class="review-item-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
    </div>
    <div class="review-item-body">
      <div class="review-item-name">实数完备性定理</div>
      <div class="review-item-evidence">
        教材与课件中未找到完整内容，1 次请求失败
      </div>
      <a class="review-item-link">补充资料后复习</a>
    </div>
  </div>

  <div class="review-item">
    <div class="review-item-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
    </div>
    <div class="review-item-body">
      <div class="review-item-name">ε-N 定义的独立构造</div>
      <div class="review-item-evidence">
        能理解定义，但独立构造 N 时 2 次查看完整解答
      </div>
      <a class="review-item-link">针对性练习</a>
    </div>
  </div>

</div>

'''

text = text[:start_idx] + new_p5 + text[end_idx:]
print("p5 学习反馈页已重构")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
