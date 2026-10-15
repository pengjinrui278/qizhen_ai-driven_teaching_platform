# -*- coding: utf-8 -*-
"""R4 Step2: 重构课程聊天页 p1"""
import io

path = r"C:\Users\19900\Projects\mathmirror\landing\ui-mockup-b.html"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 找到 p1 开始和 p2 开始
start_marker = '<div class="page" id="p1">'
end_marker = '<div class="page" id="p2">'

start_idx = text.find(start_marker)
end_idx = text.find(end_marker)
assert start_idx != -1 and end_idx != -1, "p1/p2 marker not found"

new_p1 = '''<div class="page" id="p1">
  <div class="chat-layout">

    <!-- ===== 左侧历史会话栏 ===== -->
    <div class="chat-history" id="chatHistory">
      <div class="chat-history-head">
        <div class="chat-history-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          历史会话
        </div>
        <button class="chat-history-toggle" onclick="document.getElementById('chatHistory').classList.toggle('collapsed')" title="收起">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <button class="new-chat-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14"/></svg>
        新对话
      </button>
      <div class="history-list">
        <div class="history-group-label">今天</div>
        <div class="history-item active">
          <svg class="history-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <div class="history-item-body">
            <div class="history-item-title">数列极限的证明思路</div>
            <div class="history-item-time">14:32</div>
          </div>
          <button class="history-item-del"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
        </div>
        <div class="history-item">
          <svg class="history-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <div class="history-item-body">
            <div class="history-item-title">一致连续的判别方法总结</div>
            <div class="history-item-time">10:15</div>
          </div>
          <button class="history-item-del"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
        </div>
        <div class="history-group-label">昨天</div>
        <div class="history-item">
          <svg class="history-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <div class="history-item-body">
            <div class="history-item-title">函数极限 ε-δ 定义理解</div>
            <div class="history-item-time">昨天 21:40</div>
          </div>
          <button class="history-item-del"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
        </div>
        <div class="history-item">
          <svg class="history-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <div class="history-item-body">
            <div class="history-item-title">三角不等式的反向形式及应用</div>
            <div class="history-item-time">昨天 19:22</div>
          </div>
          <button class="history-item-del"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
        </div>
        <div class="history-group-label">更早</div>
        <div class="history-item">
          <svg class="history-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <div class="history-item-body">
            <div class="history-item-title">实数完备性六大定理的关系梳理</div>
            <div class="history-item-time">3 天前</div>
          </div>
          <button class="history-item-del"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
        </div>
      </div>
    </div>

    <!-- ===== 主对话区 ===== -->
    <div class="chat-main">
      <div class="subtabs">
        <button class="subtab active">对话</button>
        <button class="subtab">教材与资源</button>
        <button class="subtab">例题习题</button>
        <button class="subtab">真题卷</button>
        <button class="subtab">我的笔记</button>
        <button class="subtab">复习提纲</button>
      </div>

      <div class="chat-toolbar">
        <div class="course-select">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
          数学分析
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <!-- 三级课程提示：方向 / 关键步骤 / 整体解题流程 -->
        <div class="hint-levels">
          <button class="hint-level active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/></svg>
            方向
          </button>
          <button class="hint-level">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            关键步骤
          </button>
          <button class="hint-level">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
            整体流程
          </button>
        </div>
      </div>

      <!-- 唯一纵向滚动区 -->
      <div class="chat-messages">

        <!-- 欢迎区（按课程变化，数分示例） -->
        <div class="chat-welcome">
          <h3>数学分析</h3>
          <p>理解定义、定理与证明思路。从一道题开始，我会一步步引导你思考。</p>
          <div class="welcome-suggest">
            <button class="welcome-suggest-btn">数列极限的 ε-N 定义</button>
            <button class="welcome-suggest-btn">一致连续怎么判别</button>
            <button class="welcome-suggest-btn">上传一道题目</button>
          </div>
        </div>

        <!-- 用户消息 -->
        <div class="msg me">
          <div class="msg-avatar me"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
          <div class="msg-body">
            <div class="msg-name">我</div>
            <div class="msg-bubble">证明：若 <span class="formula">lim x<sub>n</sub> = a</span>，则 <span class="formula">lim |x<sub>n</sub>| = |a|</span>，反之成立吗？</div>
          </div>
        </div>

        <!-- AI 第一轮回复（历史轮，无操作组） -->
        <div class="msg ai">
          <div class="msg-avatar ai"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 10v6M4.22 4.22l4.24 4.24m7.07 7.07l4.24 4.24M1 12h6m10 0h6"/></svg></div>
          <div class="msg-body">
            <div class="msg-name">Course Mirror · 数学分析</div>
            <div class="msg-bubble">
              好问题。先回忆一个关键不等式——你能想到哪个不等式联系了 <span class="formula">||x| − |a||</span> 和 <span class="formula">|x − a|</span>？
              <ol><li>想想绝对值的<strong>三角不等式</strong></li><li>它的反向形式是什么？</li></ol>
              试着写一下，我再帮你往下推。
            </div>
          </div>
        </div>

        <!-- 用户追问 -->
        <div class="msg me">
          <div class="msg-avatar me"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
          <div class="msg-body">
            <div class="msg-name">我</div>
            <div class="msg-bubble">是 <span class="formula">||x| − |a|| ≤ |x − a|</span> 吗？</div>
          </div>
        </div>

        <!-- AI 最新回复（成功后3秒显示操作组） -->
        <div class="msg ai">
          <div class="msg-avatar ai"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 10v6"/></svg></div>
          <div class="msg-body">
            <div class="msg-name">Course Mirror · 数学分析</div>
            <div class="msg-bubble">
              <strong>没错，就是它。</strong>这就是三角不等式的反向形式。现在用极限的 <span class="formula">ε-N</span> 定义来完成证明：
              <ol>
                <li>任给 <span class="formula">ε &gt; 0</span>，由 <span class="formula">lim x<sub>n</sub> = a</span>，存在 N，当 n &gt; N 时 <span class="formula">|x<sub>n</sub> − a| &lt; ε</span></li>
                <li>代入反向不等式：<span class="formula">||x<sub>n</sub>| − |a|| ≤ |x<sub>n</sub> − a| &lt; ε</span></li>
              </ol>
              所以 <span class="formula">lim |x<sub>n</sub>| = |a|</span>。
              <br><br>
              <strong>反过来成立吗？</strong>考虑在 a 和 −a 之间振荡的数列，比如 <span class="formula">x<sub>n</sub> = (−1)<sup>n</sup></span>，你发现了什么？

              <!-- 回复后操作组：回答成功3秒后显示，仅最新一轮 -->
              <div class="reply-actions show">
                <button class="reply-action-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>
                  我卡住了
                </button>
                <button class="reply-action-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  再深入一点
                </button>
                <button class="reply-action-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
                  梳理解题框架
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- 输入区固定底部 -->
      <div class="chat-input-area">
        <div class="chat-input-row">
          <div class="chat-input-tools">
            <button class="chat-tool-btn" title="拍照搜题">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
            <button class="chat-tool-btn" title="上传图片">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            </button>
          </div>
          <div class="chat-input-wrap">
            <textarea class="chat-input" placeholder="输入题目、思路或疑问…（Enter 发送，Shift+Enter 换行）" rows="1"></textarea>
            <button class="chat-send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg></button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 右侧关联教材 ===== -->
    <div class="related-panel">
      <button class="related-toggle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        关联教材段落
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-left:auto"><path d="M9 18l6-6-6-6"/></svg>
      </button>
      <div class="work-status"><span class="dot"></span>查找主教材 · 华东师大《数学分析》第五版</div>
      <div class="related-chunk">
        <div class="related-chunk-loc">数学分析 · 第一章 §1.3</div>
        <div class="related-chunk-text">定理（三角不等式）：对任意实数 x, y，有 |x + y| ≤ |x| + |y|。由此可推出反向形式：||x| − |y|| ≤ |x − y|。</div>
        <div class="related-score">相关度 96%</div>
      </div>
      <div class="related-chunk">
        <div class="related-chunk-loc">数学分析 · 第二章 §2.1</div>
        <div class="related-chunk-text">数列极限的定义：设 {x<sub>n</sub>} 为数列，a 为定数。若对任意 ε &gt; 0，总存在正整数 N，使得当 n &gt; N 时有 |x<sub>n</sub> − a| &lt; ε…</div>
        <div class="related-score">相关度 89%</div>
      </div>
      <div class="related-chunk">
        <div class="related-chunk-loc">数学分析 · 第二章 §2.2</div>
        <div class="related-chunk-text">定理：若 lim x<sub>n</sub> = a，则 lim |x<sub>n</sub>| = |a|。但反之不真，例如 x<sub>n</sub> = (−1)<sup>n</sup>…</div>
        <div class="related-score">相关度 85%</div>
      </div>
    </div>

  </div>
</div>

'''

text = text[:start_idx] + new_p1 + text[end_idx:]
print("p1 课程聊天页已重构")

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
