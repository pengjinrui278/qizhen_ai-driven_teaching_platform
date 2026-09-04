"use client";

import { useState } from "react";

type ModalData = {
  title: string;
  subtitle: string;
  content: string;
  action?: { label: string; href: string };
} | null;

const courses = [
  {
    name: "数学分析",
    tag: "旗舰完整闭环",
    intro:
      "数分 Mirror 以极限与连续性为核心，已覆盖数列极限、函数极限与连续性等第一章知识节点，配套 10 道全自编题与 2–3 级提示阶梯。学生可体验“卡住了 → 渐进提示 → 完整解答 → 知识点答疑”的完整学习证据闭环。",
  },
  {
    name: "高等代数与解析几何",
    tag: "扩展 Course Mirror",
    intro:
      "高代 Mirror 聚焦向量、线性组合、线性方程组与矩阵基础。提供 n 维向量、线性组合、生成子空间、初等行变换保解等知识节点，以及方程组解的类型判断、生成子空间归属等全自编题目。",
  },
  {
    name: "大学物理",
    tag: "扩展 Course Mirror",
    intro:
      "大物 Mirror 从质点运动学入手，覆盖位置矢量、速度、加速度、抛体运动、圆周运动与伽利略速度变换。题目侧重矢量运算与物理情景建模，帮助学生建立“先画矢量图、再列分量式”的解题习惯。",
  },
  {
    name: "点集拓扑",
    tag: "扩展 Course Mirror",
    intro:
      "拓扑 Mirror 介绍拓扑空间、开集、闭集、拓扑基、连续映射、内部/闭包/边界等基础概念。题目以定义验证与反例构造为主，强调抽象定义的正确使用。",
  },
  {
    name: "常微分方程",
    tag: "扩展 Course Mirror",
    intro:
      "常微分方程 Mirror 覆盖一阶 ODE 的分离变量法、一阶线性方程与积分因子、恰当方程，以及 Picard-Lindelöf 存在唯一性定理。题目从可分离变量初值问题到非利普希茨多解性分析，帮助学生区分“能算”与“能证”。",
  },
];

const roles = [
  {
    title: "Student Mirror",
    subtitle: "学生端",
    intro:
      "为每位学生建立长期学习画像：记录求助历史、提示阶梯使用、完整解答请求与知识点提问。系统只观察、不打分，强调“帮助此刻卡住的我”，而不是排名或标签。匿名参与码保护隐私，教师端只能看到班级聚合统计。",
  },
  {
    title: "Course Mirror",
    subtitle: "课程建设端",
    intro:
      "承载课程知识、题目、提示阶梯、Harness 质检规则与 Eval 数据集。每门课程由多个 CoursePack 组成，知识节点与题目均带授权门控。课程建设端未来可支持教师/TA 导入、审校与迭代课程语料。",
  },
  {
    title: "Assignment Workspace",
    subtitle: "教师 / TA 端",
    intro:
      "面向一次作业或一次测验的临时协作空间：学生通过加入码挂载求助，系统自动聚合并生成 AI 候选班级现象；TA 三选一校准，教师最终决定；周报只呈现教师接受的现象，且绝不返回学生对话原文。",
  },
];

function Modal({ data, onClose }: { data: ModalData; onClose: () => void }) {
  if (!data) return null;
  return (
    <div className="modalBackdrop" onClick={onClose} role="presentation">
      <div className="modalCard" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="modalClose" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <span className="modalSubtitle">{data.subtitle}</span>
        <h2 className="modalTitle">{data.title}</h2>
        <p className="modalBody">{data.content}</p>
        {data.action && (
          <a href={data.action.href} className="cta modalCta">
            {data.action.label} →
          </a>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [modal, setModal] = useState<ModalData>(null);

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">学镜 · Learning Mirror · 比赛版</p>
        <h1>跨课程个性化学习智能体平台</h1>
        <p>
          Student Mirror 越学越懂人，Course Mirror 越教越懂课，Assignment Workspace 完成阶段任务后退出。
        </p>
        <a className="cta" href="/student">进入学生端演示 →</a>{" "}
        <a className="cta ghost" href="/teacher">进入教师 / TA 端演示 →</a>
      </header>

      <section className="grid roles">
        {roles.map((role) => (
          <article
            key={role.title}
            className="interactiveCard"
            onClick={() =>
              setModal({
                title: role.title,
                subtitle: role.subtitle,
                content: role.intro,
                action:
                  role.title === "Student Mirror"
                    ? { label: "去学生端体验", href: "/student" }
                    : role.title === "Assignment Workspace"
                      ? { label: "去教师 / TA 端体验", href: "/teacher" }
                      : undefined,
              })
            }
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setModal({
                  title: role.title,
                  subtitle: role.subtitle,
                  content: role.intro,
                  action:
                    role.title === "Student Mirror"
                      ? { label: "去学生端体验", href: "/student" }
                      : role.title === "Assignment Workspace"
                        ? { label: "去教师 / TA 端体验", href: "/teacher" }
                        : undefined,
                });
              }
            }}
          >
            <span>{role.subtitle}</span>
            <h2>{role.title}</h2>
            <p>{role.intro.slice(0, 72)}…</p>
            <div className="cardHint">点击查看详细介绍</div>
          </article>
        ))}
      </section>

      <section>
        <div className="sectionTitle">
          <p className="eyebrow">Course Mirrors</p>
          <h2>一门深做，四门同步可展示</h2>
        </div>
        <div className="courseGrid">
          {courses.map((course, index) => (
            <article
              className={index === 0 ? "course flagship interactiveCard" : "course interactiveCard"}
              key={course.name}
              onClick={() =>
                setModal({
                  title: course.name,
                  subtitle: index === 0 ? "旗舰完整闭环" : "扩展 Course Mirror",
                  content: course.intro,
                  action: { label: "去学生端选择本课程", href: "/student" },
                })
              }
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setModal({
                    title: course.name,
                    subtitle: index === 0 ? "旗舰完整闭环" : "扩展 Course Mirror",
                    content: course.intro,
                    action: { label: "去学生端选择本课程", href: "/student" },
                  });
                }
              }}
            >
              <strong>{course.name}</strong>
              <small>{course.tag}</small>
              <div className="cardHint">点击查看课程介绍</div>
            </article>
          ))}
        </div>
      </section>

      <section className="flow interactiveCard" role="button" tabIndex={0}>
        <p className="eyebrow">统一证据闭环</p>
        <div>自然学习 → Course Mirror 专业处理 → Learning Evidence → Student Mirror 更新 → 个性化帮助</div>
      </section>

      <Modal data={modal} onClose={() => setModal(null)} />
    </main>
  );
}
