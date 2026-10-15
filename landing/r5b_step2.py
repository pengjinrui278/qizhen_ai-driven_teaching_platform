# -*- coding: utf-8 -*-
"""R5B Step2: 重构学习反馈页——候选观察(最多3项)+查看更多+统计/原始反馈折叠"""
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
      <div class="page-sub">基于真实学习活动的候选观察 · 未经核验不生成进展结论</div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" style="padding:7px 14px;font-size:12.5px">近 14 天</button>
    </div>
  </div>

  <!-- 说明条 -->
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:11px 15px;font-size:12.5px;color:#0369a1;line-height:1.6;margin-bottom:22px;display:flex;gap:9px;align-items:flex-start">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:16px;height:16px;flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
    <div>这里显示的是系统从真实学习活动中整理的<strong>候选观察</strong>，不是成绩或掌握结论；普通问答仍保存在原会话中，不在此页逐条列出。设定学习目标并完成核验前，不生成课程进展、章节或百分比。</div>
  </div>

  <!-- 候选观察（最多三项） -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div style="font-size:14px;font-weight:600;color:var(--text)">候选观察</div>
    <div style="font-size:11.5px;color:var(--dim)">最多显示 3 项，需你确认后才会用于后续建议</div>
  </div>

  <div class="obs-card" style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;box-shadow:var(--shadow)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;flex-wrap:wrap">
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#1d4ed8;background:#eff6ff;padding:2px 8px;border-radius:6px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:11px;height:11px"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        真实检索
      </span>
      <span style="font-size:11.5px;color:var(--muted)">数学分析</span>
      <span style="font-size:10.5px;color:var(--dim);margin-left:auto">今天 14:32</span>
    </div>
    <div style="font-size:13px;color:var(--text);line-height:1.6;margin-bottom:9px">你在“数列极限证明”中主动调用了三角不等式的反向形式，并完成了 |x<sub>n</sub>|-|a| 一步的推导；该步骤与教材第一章 §1.3 内容对应。</div>
    <div style="display:flex;gap:8px;align-items:center">
      <a style="font-size:11.5px;color:#3b82f6;cursor:pointer;display:inline-flex;align-items:center;gap:4px">查看来源
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:11px;height:11px"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </a>
      <span style="font-size:10.5px;color:#94a3b8;margin-left:auto">候选观察 · 未核验，不计为掌握</span>
    </div>
  </div>

  <div class="obs-card" style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;box-shadow:var(--shadow)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;flex-wrap:wrap">
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#475569;background:#f1f5f9;padding:2px 8px;border-radius:6px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:11px;height:11px"><path d="M3 7h18M3 12h18M3 17h18"/></svg>
        主题分类
      </span>
      <span style="font-size:11.5px;color:var(--muted)">数学分析</span>
      <span style="font-size:10.5px;color:var(--dim);margin-left:auto">今天 10:15</span>
    </div>
    <div style="font-size:13px;color:var(--text);line-height:1.6;margin-bottom:9px">你围绕“一致连续判别”进行了提问与例题尝试；该活动被归类到“函数连续性”主题，<strong>未检索到可直接引用的教材依据</strong>。</div>
    <div style="display:flex;gap:8px;align-items:center">
      <a style="font-size:11.5px;color:#3b82f6;cursor:pointer;display:inline-flex;align-items:center;gap:4px">在原会话中查看
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:11px;height:11px"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </a>
      <span style="font-size:10.5px;color:#94a3b8;margin-left:auto">候选观察 · 主题分类，非教材出处</span>
    </div>
  </div>

  <div class="obs-card" style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;box-shadow:var(--shadow)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;flex-wrap:wrap">
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#475569;background:#f1f5f9;padding:2px 8px;border-radius:6px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:11px;height:11px"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        学生自报
      </span>
      <span style="font-size:11.5px;color:var(--muted)">高等代数</span>
      <span style="font-size:10.5px;color:var(--dim);margin-left:auto">昨天 16:20</span>
    </div>
    <div style="font-size:13px;color:var(--text);line-height:1.6;margin-bottom:9px">你表示“矩阵初等变换与秩的关系已经理解”；该记录来自本人反馈，<strong>属于弱证据</strong>，需配合练习核验。</div>
    <div style="display:flex;gap:8px;align-items:center">
      <a style="font-size:11.5px;color:#3b82f6;cursor:pointer;display:inline-flex;align-items:center;gap:4px">去核验
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:11px;height:11px"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </a>
      <span style="font-size:10.5px;color:#94a3b8;margin-left:auto">候选观察 · 自报不升级为掌握</span>
    </div>
  </div>

  <button class="btn btn-ghost" style="width:100%;padding:9px;font-size:12.5px;margin-bottom:28px;justify-content:center;display:flex">查看更多观察</button>

  <!-- 学习目标与待复习（核验流程未上线，空态说明） -->
  <div style="font-size:14px;font-weight:600;margin-bottom:12px;color:var(--text)">学习目标与待复习</div>
  <div style="background:#fff;border:1px dashed var(--border);border-radius:12px;padding:26px 20px;text-align:center">
    <div style="width:42px;height:42px;border-radius:10px;background:var(--bg);display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:20px;height:20px;color:var(--dim)"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
    </div>
    <div style="font-size:13.5px;font-weight:600;color:var(--text);margin-bottom:5px">暂无可核验的待复习事项</div>
    <div style="font-size:12px;color:var(--muted);line-height:1.7;max-width:460px;margin:0 auto">设定学习目标并完成对应练习核验后，这里会基于真实证据显示待复习事项；系统不会仅根据提问次数或提示层级生成复习清单。</div>
  </div>

  <!-- 折叠区：统计 / 原始反馈（默认折叠） -->
  <details style="margin-top:24px;background:#fff;border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow)">
    <summary style="padding:12px 16px;font-size:13px;font-weight:600;color:var(--text);cursor:pointer;display:flex;align-items:center;gap:8px;list-style:none">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:15px;height:15px;color:var(--muted)"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>
      学习统计
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:13px;height:13px;color:var(--dim);margin-left:auto"><path d="M6 9l6 6 6-6"/></svg>
    </summary>
    <div style="padding:4px 16px 16px;font-size:12.5px;color:var(--muted);line-height:2;border-top:1px solid var(--border);padding-top:14px">
      统计仅作活动计数（如近 14 天对话数、练习尝试数），不换算为掌握度或能力分数；目标关联与核验流程上线后补充。
    </div>
  </details>

  <details style="margin-top:10px;background:#fff;border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow)">
    <summary style="padding:12px 16px;font-size:13px;font-weight:600;color:var(--text);cursor:pointer;display:flex;align-items:center;gap:8px;list-style:none">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:15px;height:15px;color:var(--muted)"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
      原始反馈记录
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:13px;height:13px;color:var(--dim);margin-left:auto"><path d="M6 9l6 6 6-6"/></svg>
    </summary>
    <div style="padding:4px 16px 16px;font-size:12.5px;color:var(--muted);line-height:2;border-top:1px solid var(--border);padding-top:14px">
      完整问答活动可在对应课程会话及数据导出中查看；本页默认不逐条展开，普通活动查询可通过 include_activities=false 跳过。
    </div>
  </details>

</div>

'''

text = text[:start_idx] + new_p5 + text[end_idx:]
print("p5 学习反馈页已按 R5B 重构")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
