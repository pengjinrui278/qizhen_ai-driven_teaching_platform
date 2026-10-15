# -*- coding: utf-8 -*-
"""修复：nav-badge 改角标 + 淡紫块文字加深"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

pairs = [
    # === 问题1：nav-item 加 position:relative，nav-badge 改角标 ===
    (".nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;\n  font-size:13.5px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .18s;border:none;background:none;text-align:left;width:100%;font-family:inherit}",
     ".nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;position:relative;\n  font-size:13.5px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .18s;border:none;background:none;text-align:left;width:100%;font-family:inherit}"),

    # nav-badge 改为 icon 左上角红色角标
    (".nav-badge{margin-left:auto;font-size:10px;background:rgba(99,102,241,.3);color:#c7d2fe;padding:1px 7px;border-radius:99px;font-weight:600}",
     ".nav-badge{position:absolute;top:0;left:17px;font-size:9px;background:#f43f5e;color:#fff;padding:0 5px;border-radius:99px;font-weight:600;line-height:1.5;box-shadow:0 1px 4px rgba(244,63,94,.4)}"),

    # === 问题2：淡紫块内文字加深（统一深紫 #4f46e5 / #6366f1）===
    # 导航 active
    (".nav-item.active{background:rgba(99,102,241,.15);color:#a5b4fc;font-weight:600}",
     ".nav-item.active{background:rgba(99,102,241,.14);color:#4f46e5;font-weight:600}"),
    (".nav-item.active svg{color:#818cf8}",
     ".nav-item.active svg{color:#4f46e5}"),

    # gcard 标题图标和链接
    (".gcard-title svg{width:17px;height:17px;color:#818cf8}",
     ".gcard-title svg{width:17px;height:17px;color:#6366f1}"),
    (".gcard-link{font-size:12px;color:#818cf8;cursor:pointer;text-decoration:none}",
     ".gcard-link{font-size:12px;color:#6366f1;cursor:pointer;text-decoration:none}"),
    (".gcard-link:hover{color:#a5b4fc}",
     ".gcard-link:hover{color:#4f46e5}"),

    # 徽章
    (".badge-indigo{background:rgba(99,102,241,.18);color:#a5b4fc}",
     ".badge-indigo{background:rgba(99,102,241,.15);color:#4f46e5}"),

    # 最近学习图标
    (".recent-icon svg{width:15px;height:15px;color:#818cf8}",
     ".recent-icon svg{width:15px;height:15px;color:#6366f1}"),

    # 课表数学课
    (".sched-class.math{background:rgba(99,102,241,.2);color:#c7d2fe}",
     ".sched-class.math{background:rgba(99,102,241,.15);color:#4f46e5}"),

    # 关联教材
    (".related-toggle:hover{color:#a5b4fc;border-color:var(--primary)}",
     ".related-toggle:hover{color:#4f46e5;border-color:var(--primary)}"),
    (".related-chunk-loc{font-size:11px;color:#818cf8;font-weight:600;margin-bottom:5px}",
     ".related-chunk-loc{font-size:11px;color:#6366f1;font-weight:600;margin-bottom:5px}"),

    # 资源中心 tab 和筛选
    (".rc-tab.active{background:rgba(99,102,241,.2);color:#c7d2fe;font-weight:600}",
     ".rc-tab.active{background:rgba(99,102,241,.15);color:#4f46e5;font-weight:600}"),
    (".rc-filter:hover{border-color:var(--primary);color:#a5b4fc}",
     ".rc-filter:hover{border-color:var(--primary);color:#4f46e5}"),
    (".rc-filter.active{background:rgba(99,102,241,.18);border-color:var(--primary);color:#c7d2fe}",
     ".rc-filter.active{background:rgba(99,102,241,.15);border-color:var(--primary);color:#4f46e5}"),

    # 搜索结果
    (".search-result-head strong{color:#a5b4fc}",
     ".search-result-head strong{color:#4f46e5}"),
    (".sr-loc{font-size:11px;color:#818cf8;font-weight:600;margin-bottom:6px}",
     ".sr-loc{font-size:11px;color:#6366f1;font-weight:600;margin-bottom:6px}"),
    (".sr-text mark{background:rgba(99,102,241,.3);color:#c7d2fe;border-radius:3px;padding:0 2px}",
     ".sr-text mark{background:rgba(99,102,241,.2);color:#4338ca;border-radius:3px;padding:0 2px;font-weight:600}"),

    # 薄弱点诊断
    (".diag-action{margin-top:8px;font-size:11px;color:#818cf8;cursor:pointer;display:flex;align-items:center;gap:4px}",
     ".diag-action{margin-top:8px;font-size:11px;color:#6366f1;cursor:pointer;display:flex;align-items:center;gap:4px}"),

    # 图表标题图标
    (".chart-title svg{width:16px;height:16px;color:#818cf8}",
     ".chart-title svg{width:16px;height:16px;color:#6366f1}"),

    # 作业 tab
    (".hw-tab.active{background:rgba(99,102,241,.2);color:#c7d2fe;font-weight:600}",
     ".hw-tab.active{background:rgba(99,102,241,.15);color:#4f46e5;font-weight:600}"),

    # 作业卡片数学图标
    (".hw-card-icon.math{background:rgba(99,102,241,.18);color:#a5b4fc}",
     ".hw-card-icon.math{background:rgba(99,102,241,.12);color:#6366f1}"),

    # 隐私图标
    (".privacy-icon svg{width:18px;height:18px;color:#818cf8}",
     ".privacy-icon svg{width:18px;height:18px;color:#6366f1}"),
]

count = 0
for old, new in pairs:
    if old in text:
        text = text.replace(old, new)
        count += 1
    else:
        print("NOT FOUND:", old[:60].replace("\n", " "))

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("\n完成：%d / %d 处替换" % (count, len(pairs)))
