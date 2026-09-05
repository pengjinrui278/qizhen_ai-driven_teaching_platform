"use client";

import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { useEffect, useMemo, useRef, useState } from "react";

import { randomId } from "./id";
import StudentNav from "./StudentNav";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

type CourseProfile = {
  course_id: string;
  display_name: string;
  mirror_name: string;
  profile_id: string;
};

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

type UploadedProblem = {
  request_id: string;
  problem_id: string;
  coursepack_id: string;
  recognized: boolean;
  quality_status: "approved" | "pending" | "rejected";
  max_hint_level: number;
  first_hint: MirrorResponse;
  similar_problems: ProblemSummary[];
};

type JoinedWorkspace = {
  workspace_id: string;
  title: string;
  join_code: string;
  status: string;
};

const PARTICIPANT_CODE_KEY = "mirror.participantCode";
const ACTIVE_WORKSPACE_KEY = "mirror.activeWorkspace";

/** 模型输出的数学公式定界符不统一（\(...\) / \\(...\\) / \[...\]），
 *  统一归一成 remark-math 认得的 $...$ / $$...$$。 */
function normalizeMathDelimiters(text: string): string {
  return text
    .replace(/\\\\\(/g, "\\(")
    .replace(/\\\\\)/g, "\\)")
    .replace(/\\\\\[/g, "\\[")
    .replace(/\\\\\]/g, "\\]")
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, body: string) => `$$${body}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match, body: string) => `$${body}$`);
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      >
        {normalizeMathDelimiters(text)}
      </ReactMarkdown>
    </div>
  );
}

export type StudentTrack = "course" | "ai";

type StudentStudioProps = {
  track: StudentTrack;
};

export default function StudentStudio({ track }: StudentStudioProps) {
  const [courses, setCourses] = useState<CourseProfile[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [profileId, setProfileId] = useState<string>("");
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [participantCode, setParticipantCode] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinedWorkspace | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [uploadText, setUploadText] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadedProblem, setUploadedProblem] = useState<UploadedProblem | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.course_id === courseId) ?? null,
    [courses, courseId],
  );

  // 匿名参与码：浏览器随机生成、本地保存，不含姓名学号；
  // 教师端只允许对它做人数统计，看不到对话内容。
  useEffect(() => {
    let code = localStorage.getItem(PARTICIPANT_CODE_KEY);
    if (!code) {
      code = randomId();
      localStorage.setItem(PARTICIPANT_CODE_KEY, code);
    }
    setParticipantCode(code);
    const raw = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (raw) {
      try {
        setJoined(JSON.parse(raw) as JoinedWorkspace);
      } catch {
        localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      }
    }
  }, []);

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

  // 加载课程列表，默认选中数学分析（如果存在），否则选第一门
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/courses`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CourseProfile[]>;
      })
      .then((list) => {
        const filtered =
          track === "ai"
            ? list.filter((c) => c.course_id === "ai_literacy")
            : list.filter((c) => c.course_id !== "ai_literacy");
        setCourses(filtered);
        const defaultCourse =
          track === "ai"
            ? filtered[0] ?? null
            : filtered.find((c) => c.course_id === "mathematical_analysis") ?? filtered[0] ?? null;
        if (defaultCourse) {
          setCourseId(defaultCourse.course_id);
          setProfileId(defaultCourse.profile_id);
        }
      })
      .catch((cause) =>
        setLoadError(
          `无法连接后端 API（${API_BASE}）。请先按 README 启动 PostgreSQL 与 uvicorn。原因：${cause instanceof Error ? cause.message : String(cause)}`,
        ),
      );
  }, [track]);

  // 课程切换时重新加载题目
  useEffect(() => {
    if (!courseId || !profileId) return;
    setSelectedId(null);
    setItems([]);
    const url = `${API_BASE}/api/v1/problems?course_id=${courseId}&course_profile_id=${profileId}`;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ProblemSummary[]>;
      })
      .then(setProblems)
      .catch((cause) =>
        setLoadError(
          `无法加载题目（${courseId}）。原因：${cause instanceof Error ? cause.message : String(cause)}`,
        ),
      );
  }, [courseId, profileId]);

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
          request_id: randomId(),
          course_id: courseId,
          course_profile_id: profileId,
          problem,
          interaction_mode: mode,
          // 已加入作业时：带上匿名参与码与工作区归属，供教师端做班级聚合
          ...(participantCode ? { participant_code: participantCode } : {}),
          ...(joined ? { assignment_workspace_id: joined.workspace_id } : {}),
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

  async function joinAssignment(event: React.FormEvent) {
    event.preventDefault();
    const code = joinCodeInput.trim();
    if (!code || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/v1/workspaces/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ join_code: code }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? `HTTP ${response.status}`);
      }
      const workspace = (await response.json()) as JoinedWorkspace;
      const active = {
        workspace_id: workspace.workspace_id,
        title: workspace.title,
        join_code: workspace.join_code,
        status: workspace.status,
      };
      setJoined(active);
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(active));
      setJoinCodeInput("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function leaveAssignment() {
    setJoined(null);
    localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  }

  async function uploadWrongProblem(event: React.FormEvent) {
    event.preventDefault();
    const text = uploadText.trim();
    if (!text || uploadBusy || !courseId || !profileId) return;
    setUploadBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/v1/student-uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: randomId(),
          course_id: courseId,
          course_profile_id: profileId,
          problem: { text },
          ...(participantCode ? { participant_code: participantCode } : {}),
          ...(joined ? { assignment_workspace_id: joined.workspace_id } : {}),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? `HTTP ${response.status}`);
      }
      const data = (await response.json()) as UploadedProblem;
      setUploadedProblem(data);
      setUploadText("");
      // 将上传题加入左侧列表并选中，便于继续 next_hint / full_solution
      const summary: ProblemSummary = {
        problem_id: data.problem_id,
        statement: text,
        answer_type: "mixed",
        max_hint_level: data.max_hint_level,
      };
      setProblems((previous) => [summary, ...previous]);
      setSelectedId(data.problem_id);
      setItems((previous) => [
        ...previous,
        { kind: "user", label: `我上传了一道错题：${text.slice(0, 80)}${text.length > 80 ? "…" : ""}` },
        { kind: "agent", response: data.first_hint },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUploadBusy(false);
    }
  }

  const QUALITY_STATUS_LABELS: Record<string, string> = {
    approved: "已通过自动审核",
    pending: "等待审校",
    rejected: "未通过审核",
  };

  return (
    <main className="studentMain">
      <header className="studentTop">
        <StudentNav active={track === "ai" ? "ai" : "course"} />
        <p className="eyebrow">
          {track === "ai" ? "AI 教学 · Vibe Coding / Agent" : "课程教学 · 数理 Course Mirror"}
        </p>
        <h1>
          {track === "ai"
            ? "先想清楚再让 AI 动手"
            : (selectedCourse?.mirror_name ?? "课程智能体")}
        </h1>
        <p>
          {track === "ai"
            ? "Vibe coding 和 Agent 使用与数理课同一套规矩：卡住了先要提示，不直接要现成代码或现成工作流。"
            : "卡住了先要提示，不直接要答案——系统按提示阶梯一级一级地给，每一次求助都会留下一条学习证据。"}
        </p>
        {track === "course" && courses.length > 0 && (
          <div className="courseSelector">
            <label htmlFor="courseSelect">选择课程：</label>
            <select
              id="courseSelect"
              value={courseId}
              onChange={(event) => {
                const id = event.target.value;
                const course = courses.find((c) => c.course_id === id);
                if (course) {
                  setCourseId(course.course_id);
                  setProfileId(course.profile_id);
                }
              }}
              disabled={busy}
            >
              {courses.map((course) => (
                <option key={course.course_id} value={course.course_id}>
                  {course.display_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      <div className="studentShell">
        <aside className="problemPanel">
          <div className="assignmentCard">
            <small>
              你的匿名参与码：<code className="joinCode">{participantCode ?? "生成中…"}</code>
            </small>
            {joined ? (
              <>
                <div className="joinedRow">
                  ✅ 已加入作业：{joined.title}（{joined.join_code}）
                </div>
                <button type="button" className="btn btnSmall" onClick={leaveAssignment} disabled={busy || uploadBusy}>
                  退出这次作业
                </button>
              </>
            ) : (
              <form className="joinForm" onSubmit={joinAssignment}>
                <input
                  className="questionInput"
                  placeholder="输入老师发的加入码，挂到作业"
                  value={joinCodeInput}
                  onChange={(event) => setJoinCodeInput(event.target.value)}
                  disabled={busy || uploadBusy}
                />
                <button type="submit" className="btn" disabled={busy || uploadBusy || !joinCodeInput.trim()}>
                  加入作业
                </button>
              </form>
            )}
            <small className="privacyHint">
              参与码是随机生成的，不含姓名学号；加入作业后老师只能看到班级层面的统计，
              看不到你的对话内容。
            </small>
          </div>

          {track === "course" && (
          <div className="assignmentCard uploadPanel">
            <small>上传一道你做错的题，智能体帮你分析错因、推荐同类练习。</small>
            <form className="joinForm" onSubmit={uploadWrongProblem}>
              <textarea
                className="questionInput uploadTextarea"
                placeholder="把题目内容粘贴到这里（支持纯文本 / LaTeX）"
                value={uploadText}
                onChange={(event) => setUploadText(event.target.value)}
                disabled={uploadBusy}
                rows={4}
              />
              <button
                type="submit"
                className="btn btnPrimary"
                disabled={uploadBusy || !uploadText.trim()}
              >
                {uploadBusy ? "识别中…" : "上传错题"}
              </button>
            </form>
            <small className="privacyHint">
              上传即视为授权本平台用于当前课程答疑与题库建设。
            </small>

            {uploadedProblem && (
              <div className="uploadStatus">
                <span className={`chip ${uploadedProblem.quality_status}`}>
                  {QUALITY_STATUS_LABELS[uploadedProblem.quality_status] ?? uploadedProblem.quality_status}
                </span>
                {uploadedProblem.recognized ? (
                  <span className="chip">已匹配到题库中的相似题</span>
                ) : (
                  <span className="chip">已作为新题收录</span>
                )}
              </div>
            )}
          </div>
          )}

          <h2>{track === "ai" ? `练习题（${problems.length}）` : `第一章题库（${problems.length}）`}</h2>
          <small>
            {track === "ai"
              ? "自编情景题：Vibe coding 与 Agent 使用。先写清目标，再要提示。"
              : "全为团队自编题，不含教材原书习题"}
          </small>
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
                  {track === "ai" ? "情景题" : (ANSWER_TYPE_NAMES[problem.answer_type] ?? problem.answer_type)} ·{" "}
                  {problem.max_hint_level} 级提示
                </small>
              </button>
            ))}
          </div>
        </aside>

        <section className="workspace">
          {!selected ? (
            <div className="emptyTip">
              {track === "ai"
                ? "从左侧选一道情景题，练习怎么用 AI，而不是让 AI 替你做完。"
                : "从左侧挑一道题，开始和课程智能体对话。"}
            </div>
          ) : (
            <>
              <article className="statementCard">
                <small>题目 · {selected.problem_id}</small>
                <div className="statement">
                  <Markdown text={selected.statement} />
                </div>
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
                      <div className="agentAnswer">
                        <Markdown text={item.response.answer} />
                      </div>
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
                    placeholder={
                      track === "ai"
                        ? "问一个用法，例如：什么叫可验收的意图？"
                        : "问一个知识点，例如：什么是柯西准则？"
                    }
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    disabled={busy}
                  />
                  <button type="submit" className="btn" disabled={busy || !question.trim()}>
                    提问
                  </button>
                </form>
              </div>

              {uploadedProblem && selectedId === uploadedProblem.problem_id && uploadedProblem.similar_problems.length > 0 && (
                <div className="similarPanel">
                  <strong>同类练习（可选）</strong>
                  <div className="similarList">
                    {uploadedProblem.similar_problems.map((problem) => (
                      <button
                        key={problem.problem_id}
                        type="button"
                        className="problemCard"
                        onClick={() => selectProblem(problem)}
                        disabled={busy || uploadBusy}
                      >
                        <span className="problemStatement">{problem.statement}</span>
                        <small>
                          {ANSWER_TYPE_NAMES[problem.answer_type] ?? problem.answer_type} ·{" "}
                          {problem.max_hint_level} 级提示
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
