# -*- coding: utf-8 -*-
"""R2 Step3: 插入复习提纲页 p3 和 TA审校页 p6"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

# ===== 复习提纲页 p3 =====
review_page = '''<!-- ===== 复习提纲 p3 ===== -->
<div class="page" id="p3">
  <div class="page-head">
    <div class="page-title">复习提纲</div>
    <div class="page-sub">按考试范围逐考点核对资料覆盖，不预测必考</div>
  </div>

  <div class="course-picker">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
    数学分析（上） · 期末考试复习
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-left:auto"><path d="M6 9l6 6 6-6"/></svg>
  </div>

  <!-- 步骤条 -->
  <div class="stepper">
    <div class="step done"><div class="step-num">1</div><span class="step-label">填写范围</span></div>
    <div class="step-line"></div>
    <div class="step done"><div class="step-num">2</div><span class="step-label">选择教材</span></div>
    <div class="step-line"></div>
    <div class="step done"><div class="step-num">3</div><span class="step-label">确认考点</span></div>
    <div class="step-line"></div>
    <div class="step active"><div class="step-num">4</div><span class="step-label">核对编辑</span></div>
    <div class="step-line"></div>
    <div class="step todo"><div class="step-num">5</div><span class="step-label">导出</span></div>
  </div>

  <!-- 覆盖率 -->
  <div class="coverage-bar">
    <div class="coverage-head">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text)">已确认考试范围的资料覆盖</div>
        <div style="font-size:11.5px;color:var(--dim);margin-top:2px">仅表示资料检索范围，不代表已掌握程度</div>
      </div>
      <div class="coverage-pct">78%</div>
    </div>
    <div class="coverage-track"><div class="coverage-fill" style="width:78%"></div></div>
    <div class="coverage-note">已定位 14 / 18 个考点的教材与课件出处 · 3 个考点缺资料 · 1 个考点资料存在冲突</div>
  </div>

  <!-- 考点列表 -->
  <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--text)">考点核对（18）</div>

  <div class="kp-card">
    <div class="kp-head">
      <div class="kp-name">数列极限的定义与性质</div>
      <span class="kp-status kp-full">已有资料支持</span>
    </div>
    <div class="kp-meta">
      <span class="kp-source">主教材 · 第一章 §1.1–1.3</span>
      <span class="kp-source">课件 · 第2讲</span>
      <div style="margin-top:4px">重点：ε–N 定义、唯一性、有界性、保号性 · 配套练习 6 题</div>
    </div>
  </div>

  <div class="kp-card">
    <div class="kp-head">
      <div class="kp-name">函数极限与无穷小量</div>
      <span class="kp-status kp-full">已有资料支持</span>
    </div>
    <div class="kp-meta">
      <span class="kp-source">主教材 · 第二章 §2.1–2.3</span>
      <span class="kp-source">辅教材 · 习题详解 §2</span>
      <div style="margin-top:4px">重点：ε–δ 定义、极限运算法则、两个重要极限 · 配套练习 8 题</div>
    </div>
  </div>

  <div class="kp-card">
    <div class="kp-head">
      <div class="kp-name">连续函数与一致连续</div>
      <span class="kp-status kp-partial">部分支持</span>
    </div>
    <div class="kp-meta">
      <span class="kp-source">主教材 · 第三章 §3.1–3.2</span>
      <span style="color:#b45309">缺：一致连续的判别例题</span>
      <div style="margin-top:4px">建议上传课程 PPT 或补充辅教材相关章节</div>
    </div>
  </div>

  <div class="kp-card">
    <div class="kp-head">
      <div class="kp-name">实数完备性定理</div>
      <span class="kp-status kp-missing">缺资料</span>
    </div>
    <div class="kp-meta">
      <span style="color:#dc2626">教材与课件中均未找到本章完整内容</span>
      <div style="margin-top:4px">请上传老师指定的参考资料，或在考试范围中确认是否包含</div>
    </div>
  </div>

  <div class="kp-card">
    <div class="kp-head">
      <div class="kp-name">闭区间上连续函数的性质</div>
      <span class="kp-status kp-conflict">资料冲突</span>
    </div>
    <div class="kp-meta">
      <span class="kp-source">主教材 · 第三章 §3.3</span>
      <span class="kp-source">课件 · 第5讲</span>
      <div style="margin-top:4px;color:#7c3aed">主教材要求证明介值定理，课件仅要求会用。请确认考试范围按哪个版本</div>
    </div>
  </div>

  <div style="display:flex;gap:10px;margin-top:18px">
    <button class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:15px;height:15px"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      导出为 PDF
    </button>
    <button class="btn" style="display:inline-flex;align-items:center;gap:6px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:15px;height:15px"><path d="M12 5v14M5 12h14"/></svg>
      上传补充资料
    </button>
    <button class="btn">修订考试范围</button>
  </div>
</div>

'''

# ===== TA 审校页 p6 =====
ta_page = '''<!-- ===== TA 审校 p6 ===== -->
<div class="page" id="p6">
  <div class="page-head">
    <div class="page-title">TA 审校</div>
    <div class="page-sub">AI 候选结论需人工确认后才计入学生反馈</div>
  </div>

  <!-- 状态流 -->
  <div class="ta-flow">
    <div class="ta-step"><div class="ta-dot done"></div><span class="ta-step-label">已提交</span></div>
    <div class="ta-arrow"></div>
    <div class="ta-step"><div class="ta-dot done"></div><span class="ta-step-label">分析完成</span></div>
    <div class="ta-arrow"></div>
    <div class="ta-step"><div class="ta-dot active"></div><span class="ta-step-label">候选待审</span></div>
    <div class="ta-arrow"></div>
    <div class="ta-step"><div class="ta-dot todo"></div><span class="ta-step-label">TA 确认</span></div>
    <div class="ta-arrow"></div>
    <div class="ta-step"><div class="ta-dot todo"></div><span class="ta-step-label">教师审批</span></div>
    <div class="ta-arrow"></div>
    <div class="ta-step"><div class="ta-dot todo"></div><span class="ta-step-label">完成</span></div>
  </div>

  <!-- 审校项头部 -->
  <div class="gcard" style="margin-bottom:14px;padding:14px 16px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:14px;font-weight:600;color:var(--text)">数分习题三 · 第 4 题</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">学生：张同学 · 提交于昨天 22:14 · AI 已定位 2 处疑似错误</div>
      </div>
      <div style="display:flex;gap:6px">
        <span class="badge badge-rose">需确认</span>
        <span class="badge badge-amber">第 2 版</span>
      </div>
    </div>
  </div>

  <!-- 并排对比 -->
  <div class="ta-compare">
    <div class="ta-pane ta-pane-student">
      <div class="ta-pane-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:14px;height:14px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
        学生作答原文
      </div>
      <div class="ta-pane-body">
        <div style="margin-bottom:8px;color:var(--muted);font-size:12px">题目：证明 lim<sub>n→∞</sub> x<sub>n</sub> = a，则 lim |x<sub>n</sub>| = |a|</div>
        <p>学生：由极限定义，对任意 ε > 0，存在 N，当 n > N 时 |x<sub>n</sub> - a| < ε。</p>
        <p style="background:rgba(239,68,68,.08);padding:6px 8px;border-radius:6px;margin-top:6px">所以 ||x<sub>n</sub>| - |a|| = |x<sub>n</sub> - a| < ε。<span style="color:#dc2626;font-size:11px;margin-left:6px">AI 标注：此处误用绝对值等式</span></p>
      </div>
    </div>
    <div class="ta-pane ta-pane-ai">
      <div class="ta-pane-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:14px;height:14px"><path d="M12 2a4 4 0 014 4v1h1a3 3 0 013 3v1H4v-1a3 3 0 013-3h1V6a4 4 0 014-4z"/><path d="M5 15h14M5 19h14"/></svg>
        AI 候选依据
      </div>
      <div class="ta-pane-body">
        <p style="color:#dc2626;font-weight:600;margin-bottom:6px">疑似错误：绝对值不等式方向</p>
        <p>学生写 ||x<sub>n</sub>| - |a|| = |x<sub>n</sub> - a|，但由反向三角不等式应为：</p>
        <p style="font-family:serif;text-align:center;padding:8px;background:var(--bg);border-radius:6px;margin:8px 0">||x<sub>n</sub>| - |a|| ≤ |x<sub>n</sub> - a|</p>
        <p>结论方向正确，但推导中写成了等号，应改为 ≤。</p>
        <div class="ta-evidence">
          <strong>出处：</strong>主教材 §1.3 定理 1.2（三角不等式及其反向形式）· 第 11 页
        </div>
      </div>
    </div>
  </div>

  <!-- 操作区 -->
  <div class="gcard" style="padding:14px 16px">
    <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--text)">审校操作</div>
    <div class="ta-actions">
      <button class="ta-btn ta-btn-approve">确认 AI 结论</button>
      <button class="ta-btn ta-btn-edit">修改批注</button>
      <button class="ta-btn ta-btn-reject">否决并提交重审</button>
      <span style="font-size:11.5px;color:var(--dim);margin-left:auto">确认后将提交教师审批，学生不可见中间过程</span>
    </div>
  </div>

  <!-- 其他待审 -->
  <div style="font-size:13px;font-weight:600;margin:20px 0 10px;color:var(--text)">其他待审（3）</div>
  <div class="result-item">
    <div class="result-icon" style="background:rgba(245,158,11,.1);color:#b45309">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>
    </div>
    <div class="result-body">
      <div class="result-title">高代作业二 · 第 3 题 · 矩阵求秩</div>
      <div class="result-meta"><span>学生：李同学</span><span>AI 标注 1 处疑似跳步</span><span style="color:#b45309">待 TA 确认</span></div>
    </div>
  </div>
  <div class="result-item">
    <div class="result-icon" style="background:rgba(239,68,68,.1);color:#dc2626">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
    </div>
    <div class="result-body">
      <div class="result-title">数分习题三 · 第 7 题 · 一致连续证明</div>
      <div class="result-meta"><span>学生：王同学</span><span>AI 分析超时，待重新分析</span><span style="color:#dc2626">待处理</span></div>
    </div>
  </div>
</div>

'''

# 插入复习提纲 p3（在 p4 前）
marker_p4 = '<div class="page" id="p4">'
assert marker_p4 in text, "p4 marker not found"
text = text.replace(marker_p4, review_page + marker_p4)
print("1. 复习提纲页 p3 已插入")

# 插入 TA审校 p6（在 p7 前）
marker_p7 = '<div class="page" id="p7">'
assert marker_p7 in text, "p7 marker not found"
text = text.replace(marker_p7, ta_page + marker_p7)
print("2. TA审校页 p6 已插入")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("两个新页面插入完成")
