"use client";

import StudentNav from "../../lib/StudentNav";

const tracks = [
  {
    href: "/student/course",
    kicker: "课程教学",
    title: "数理课卡住了，先要提示",
    body: "数学分析、高等代数与解析几何、大学物理、点集拓扑、常微分方程。同一道题按你的过程给不同层级的提示，不直接给答案。",
    action: "进入课程练习",
    courses: ["数学分析", "高等代数", "大学物理", "点集拓扑", "常微分方程"],
  },
  {
    href: "/student/ai",
    kicker: "AI 教学",
    title: "先想清楚，再让 AI 动手",
    body: "Vibe coding 与 Agent 使用和数理课同一套规矩：先写清目标与验收，再要最小有效提示。不把生成代码或现成工作流直接当作业交。",
    action: "进入 AI 练习",
    courses: ["Vibe coding", "Agent 使用", "提示与验收", "人机交接"],
  },
];

export default function StudentHome() {
  return (
    <main className="studentMain studentHome">
      <header className="studentTop">
        <StudentNav active="home" />
        <p className="eyebrow">Student Mirror · 学生首页</p>
        <h1>两件事并重：把课学懂，把 AI 用对</h1>
        <p>
          学镜不只带你过数理作业，也教你怎么用生成式 AI 写代码、调度智能体。
          两边都是「卡住了给提示」，都不当代写工具。
        </p>
      </header>

      <section className="trackGrid">
        {tracks.map((track) => (
          <a key={track.href} href={track.href} className="trackCard">
            <span className="trackKicker">{track.kicker}</span>
            <h2>{track.title}</h2>
            <p>{track.body}</p>
            <ul className="trackTags">
              {track.courses.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <span className="trackAction">{track.action} →</span>
          </a>
        ))}
      </section>

      <section className="homeNote">
        <strong>同一条学习证据。</strong>
        课程求助和 AI 练习都会留下过程记录：你在哪一级提示继续、有没有直接要完整解答。
        教师端只看班级聚合，看不到对话原文。
      </section>
    </main>
  );
}
