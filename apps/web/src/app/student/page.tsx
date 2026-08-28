"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
const COURSE_ID = "mathematical_analysis";
const PROFILE_ID = "chen-jixiu-3e";

const ANSWER_TYPE_LABELS: Record<string, string> = {
  first_hint: "渐进提示",
  next_hint: "渐进提示",
  full_solution: "完整解答",
  concept_explanation: "知识点解释",
  solution_review: "解答自查",
  fallback_guidance: "通用引导",
};

const HARNESS_STATUS_LABELS: Record<string, string> = {
  passed: "通过",
  failed: "未通过",
  uncertain: "存疑",
  not_run: "未执行",
};

const ANSWER_TYPE_NAMES: Record<string, string> = {
  proof: "证明题",
  computation: "计算题",
};

type ProblemSummary = {
  problem_id: string;
  statement: string;
  answer_type: string;
  max_hint_level: number;
};

type HarnessCheck = { name: string; status: string; detail: string };

type MirrorResponse = {
  request_id: string;
  answer: string;
  answer_type: string;
  hint_level: number | null;
  citations: { source_id: string; knowledge_id: string | null; locator: string | null }[];
  harness: { status: string; checks: HarnessCheck[]; warnings: string[] };
  evidence: { event_type: string; observation: string; strength: string }[];
  uncertainty: string[];
};

type ChatItem =
  | { kind: "user"; label: string }
  | { kind: "agent"; response: MirrorResponse };

export default function StudentPage() {
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => problems.find((problem) => problem.problem_id === selectedId) ?? null,
    [problems, selectedId],
  );

  const lastHintLevel = useMemo(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.kind === "agent" && item.response.hint_level !== null) {
        return item.response.hint_level;
      }
    }
    return null;
  }, [items]);

  const hintsExhausted =
    selected !== null && lastHintLevel !== null && lastHintLevel >= selected.max_hint_level;

  useEffect(() => {
    const url = `${API_BASE}/api/v1/problems?course_id=${COURSE_ID}&course_profile_id=${PROFILE_ID}`;
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<ProblemSummary[]>;
      })
      .then(setProblems)
      .catch((cause) =>
        setLoadError(
          `无法连接后端 API（${API_BASE}）。请先按 README 启动 PostgreSQL 与 uvicorn，并已完成 CoursePack 导入。原因：${cause instanceof Error ? cause.message : String(cause)}`,
        ),
      );
  }, []);

  useEffect(() => {
    timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, busy]);

  function selectProblem(problem: ProblemSummary) {
    setSelectedId(problem.problem_id);
    setItems([]);
    setError(null);
    setQuestion("");
  }

  async function callMirror(label: string, mode: string, problem: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setItems((previous) => [...previous, { kind: "user", label }]);
    try {
      const response = await fetch(`${API_BASE}/api/v1/course-mirror/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: crypto.randomUUID(),
          course_id: COURSE_ID,
          course_profile_id: PROFILE_ID,
          problem,
          interaction_mode: mode,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}：${await response.text()}`);
      }
      const data = (await response.json()) as MirrorResponse;
      setItems((previous) => [...previous, { kind: "agent", response: data }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function askConcept(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) {
      return;
    }
    setQuestion("");
    void callMirror(`想弄懂一个知识点：${text}`, "concept_explanation", { text });
  }

  return (
    <main className="studentMain">
      <header className="studentTop">
        <a href="/" className="backLink">← 返回平台首页</a>
        <p className="eyebrow">Student Mirror · 学生端</p>
        <h1>数学分析课程智能体</h1>
        <p>
          卡住了先要提示，不直接要答案——系统按提示阶梯一级一级地给，
          每一次求助都会留下一条学习证据。
        </p>
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      <div className="studentShell">
        <aside className="problemPanel">
          <h2>第一章题库（{problems.length}）</h2>
          <small>全为团队自编题，不含教材原书习题</small>
          <div className="problemList">
            {problems.map((problem, index) => (
              <button
                key={problem.problem_id}
                type="button"
                className={problem.problem_id === selectedId ? "problemCard active" : "problemCard"}
                onClick={() => selectProblem(problem)}
              >
                <span className="problemIndex">{index + 1}</span>
                <span className="problemStatement">{problem.statement}</span>
                <small>
                  {ANSWER_TYPE_NAMES[problem.answer_type] ?? problem.answer_type} ·{" "}
                  {problem.max_hint_level} 级提示
                </small>
              </button>
            ))}
          </div>
        </aside>

        <section className="workspace">
          {!selected ? (
            <div className="emptyTip">从左侧挑一道题，开始和课程智能体对话。</div>
          ) : (
            <>
              <article className="statementCard">
                <small>题目 · {selected.problem_id}</small>
                <p className="statement">{selected.statement}</p>
              </article>

              <div className="timeline">
                {items.map((item, index) =>
                  item.kind === "user" ? (
                    <div key={index} className="msg user">{item.label}</div>
                  ) : (
                    <article key={index} className="msg agent">
                      <header className="agentHead">
                        <strong>
                          {ANSWER_TYPE_LABELS[item.response.answer_type] ?? item.response.answer_type}
                        </strong>
                        {item.response.hint_level !== null && (
                          <span className="levelBadge">第 {item.response.hint_level} 级提示</span>
                        )}
                        <span className={`chip ${item.response.harness.status}`}>
                          质检：{HARNESS_STATUS_LABELS[item.response.harness.status] ?? item.response.harness.status}
                        </span>
                      </header>
                      <p className="agentAnswer">{item.response.answer}</p>
                      {item.response.citations.length > 0 && (
                        <div className="chipRow">
                          {item.response.citations.map((citation) => (
                            <span key={citation.knowledge_id ?? citation.source_id} className="chip">
                              📎 {citation.locator ?? citation.knowledge_id ?? citation.source_id}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="harnessRows">
                        {item.response.harness.checks.map((check) => (
                          <div key={check.name} className="harnessRow">
                            <span className={`chip ${check.status}`}>
                              {check.name}·{HARNESS_STATUS_LABELS[check.status] ?? check.status}
                            </span>{" "}
                            {check.detail}
                          </div>
                        ))}
                      </div>
                      {item.response.uncertainty.length > 0 && (
                        <div className="harnessRows">
                          {item.response.uncertainty.map((note) => (
                            <div key={note} className="harnessRow">⚠️ {note}</div>
                          ))}
                        </div>
                      )}
                      {item.response.evidence.length > 0 && (
                        <footer className="evidenceNote">
                          已记录学习证据：{item.response.evidence.map((draft) => draft.event_type).join("、")}
                          （强度 {item.response.evidence[0].strength}，只观察不打分）
                        </footer>
                      )}
                    </article>
                  ),
                )}
                {busy && <div className="msg agent pending">课程智能体正在思考……</div>}
                <div ref={timelineRef} />
              </div>

              {error && <div className="banner">请求失败：{error}</div>}

              <div className="actionBar">
                <button
                  type="button"
                  className="btn btnPrimary"
                  disabled={busy}
                  onClick={() =>
                    void callMirror("我卡住了，给我第一级提示", "first_hint", {
                      problem_id: selected.problem_id,
                    })
                  }
                >
                  我卡住了，给个提示
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || hintsExhausted}
                  title={hintsExhausted ? "这道题的提示阶梯已经用完" : "提示级别会根据历史自动递增"}
                  onClick={() =>
                    void callMirror("再给我一级提示", "next_hint", {
                      problem_id: selected.problem_id,
                    })
                  }
                >
                  {hintsExhausted ? "提示阶梯已用完" : "再给我一级提示"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    void callMirror("我想看完整解答思路", "full_solution", {
                      problem_id: selected.problem_id,
                    })
                  }
                >
                  看完整解答思路
                </button>
                <form className="questionForm" onSubmit={askConcept}>
                  <input
                    className="questionInput"
                    placeholder="问一个知识点，例如：什么是柯西准则？"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    disabled={busy}
                  />
                  <button type="submit" className="btn" disabled={busy || !question.trim()}>
                    提问
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
