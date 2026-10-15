# -*- coding: utf-8 -*-
import io
path = r"C:\Users\19900\Projects\mathmirror\landing\设计交接文档.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

old = '<p style="margin-top:30px;color:var(--dim);font-size:12px">— R5 由 UI/UX 设计负责人输出 ｜ 不替代真实代码实现 ｜ 测试未跑写"未验证" —</p>'
add = '''

<h2 style="margin-top:48px;border-color:#64748b">九、R5B 审阅结论同步（2026-10-05）</h2>

<div class="note">
<strong>关键取舍（已在原站冻结实施）：</strong>
反馈不是第二套历史；删除动作未冻结，不画成已上线；没有确认目标及可比较核验依据，不生成课程进展、章节或百分比；自报与候选观察均不升级为掌握。
</div>

<h3>9.1 聊天页同步项</h3>
<table>
<tr><th>项目</th><th>R5 原稿</th><th>R5B 冻结</th></tr>
<tr><td>历史项删除按钮</td><td>画了垃圾桶</td><td><strong>去掉</strong>（单会话删除是独立后续事项，不画成已上线）</td></tr>
<tr><td>折叠栏宽度</td><td>14px 窄轨</td><td><strong>44px</strong>，保留 <strong>36px 按钮</strong>（不照搬 12px）</td></tr>
<tr><td>创建时间</td><td>仅 hover 显示</td><td>触屏常显、键盘聚焦可见；桌面 hover 显示</td></tr>
<tr><td>课程入口</td><td>左栏唯一</td><td>保持，不恢复重复入口</td></tr>
</table>

<h3>9.2 学习反馈页实际结构（R5 活动时间线不照搬）</h3>
<table>
<tr><th>区块</th><th>内容</th></tr>
<tr><td>说明条</td><td>候选观察不是成绩/掌握结论；普通问答在原会话保存，不在此逐条列出</td></tr>
<tr><td>候选观察（最多 3 项）</td><td>每项含证据类型（真实检索/主题分类/学生自报）、课程、时间、中性描述、来源链接；标注"未核验，不计为掌握"；<strong>查看更多</strong>按钮</td></tr>
<tr><td>学习目标与待复习</td><td>目标关联/核验流程未上线，显示空态说明；<strong>不以提问次数或提示层级生成复习清单</strong></td></tr>
<tr><td>学习统计（默认折叠）</td><td>仅活动计数，不换算掌握度</td></tr>
<tr><td>原始反馈记录（默认折叠）</td><td>完整活动在原会话/导出查看；对应 include_activities=false 精简查询</td></tr>
</table>

<h3>9.3 证据标签三态</h3>
<ul>
<li><strong>真实检索</strong>（蓝标签）：可附教材出处/来源跳转</li>
<li><strong>主题分类</strong>（灰标签）：模型提取的主题归类，非教材出处，不编造页码</li>
<li><strong>学生自报</strong>（灰标签）：弱证据，需练习核验，不升级为掌握</li>
</ul>

<h3>9.4 仍属独立后续事项（不在设计稿画成已完成）</h3>
<ul>
<li>单会话删除、目标关联/核验流程、失败轮次原文恢复、观察明细分页</li>
<li>真机软键盘适配；真实多轮数学教学质量评测（需先报调用计划）</li>
</ul>

<p style="margin-top:30px;color:var(--dim);font-size:12px">— R5B 同步由 UI/UX 设计负责人输出 ｜ 静态示例不是真实学习证据 —</p>
'''
assert old in text
text = text.replace(old, old + add)
with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("R5B 章节已追加")
