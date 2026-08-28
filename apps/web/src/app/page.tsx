const courses = ["数学分析", "高等代数与解析几何", "大学物理", "点集拓扑", "常微分方程"];

export default function Home() {
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">比赛版 · 阶段 0</p>
        <h1>跨课程个性化学习智能体平台</h1>
        <p>Student Mirror 越学越懂人，Course Mirror 越教越懂课，Assignment Workspace 完成阶段任务后退出。</p>
        <a className="cta" href="/student">进入学生端演示 →</a>{" "}
        <a className="cta ghost" href="/teacher">进入教师 / TA 端演示 →</a>
      </header>

      <section className="grid roles">
        <article><span>学生端</span><h2>Student Mirror</h2><p>拍题、渐进提示、学习证据、长期观察与跨课程入口。</p></article>
        <article><span>课程建设端</span><h2>Course Mirror</h2><p>CoursePack、知识结构、题目解法、Hint、Harness 与 Eval。</p></article>
        <article><span>教师 / TA 端</span><h2>Assignment Workspace</h2><p>作业预分析、人工确认、班级现象和可行动教学建议。</p></article>
      </section>

      <section>
        <div className="sectionTitle"><p className="eyebrow">Course Mirrors</p><h2>一门深做，四门同步可展示</h2></div>
        <div className="courseGrid">
          {courses.map((course, index) => (
            <article className={index === 0 ? "course flagship" : "course"} key={course}>
              <strong>{course}</strong>
              <small>{index === 0 ? "旗舰完整闭环" : "扩展 Course Mirror"}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="flow">
        <p className="eyebrow">统一证据闭环</p>
        <div>自然学习 → Course Mirror 专业处理 → Learning Evidence → Student Mirror 更新 → 个性化帮助</div>
      </section>
    </main>
  );
}

