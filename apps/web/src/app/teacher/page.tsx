"use client";

import { useCallback, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const COURSE_ID = "mathematical_analysis";
const PROFILE_ID = "chen-jixiu-3e";

type Workspace = {
  workspace_id: string;
  course_id: string;
  profile_id: string;
  title: string;
  class_label: string;
  join_code: string;
  status: string;
  participants: number;
  created_at: string | null;
  closed_at: string | null;
};

type Overview = {
  workspace_id: string;
  title: string;
  class_label: string;
  status: string;
  participants: number;
  requests: number;
  per_problem: {
    problem_ref: string | null;
    requests: number;
    participants: number;
    max_hint_level: number;
    full_solution_requests: number;
  }[];
  coverage_note: string;
};

type Finding = {
  finding_id: string;
  workspace_id: string;
  phenomenon: string;
  basis: Overview;
  generator: string;
  ta_status: string;
  ta_note: string | null;
  ta_decided_at: string | null;
  teacher_status: string;
  teacher_note: string | null;
  teacher_decided_at: string | null;
  created_at: string | null;
};

type ReportFinding = {
  finding_id: string;
  phenomenon: string;
  coverage_note: string;
  generator: string;
  ta_note: string | null;
  teacher_note: string | null;
};

type Report = {
  workspace_id: string;
  title: string;
  class_label: string;
  participants: number;
  coverage_note: string;
  channel_note: string;
  findings: ReportFinding[];
};

const TA_STATUS_LABELS: Record<string, string> = {
  candidate: "待 TA 校准",
  confirmed: "TA 已确认",
  rejected: "AI 判断有误",
  ignored: "TA 已忽略",
};

const TEACHER_STATUS_LABELS: Record<string, string> = {
  pending: "待教师决定",
  accepted: "教师已接受",
  ignored: "教师已忽略",
};

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      // 保留状态码文案
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

/** 候选现象卡片：TA 三选一（教师处理前可改判）+ 教师最终决定。现象文本纯文本渲染。 */
function FindingCard({
  finding,
  busy,
  onTa,
  onTeacher,
}: {
  finding: Finding;
  busy: boolean;
  onTa: (decision: string, note: string) => void;
  onTeacher: (decision: string, note: string) => void;
}) {
  const [note, setNote] = useState("");
  const taEditable = finding.teacher_status === "pending";
  const teacherCanDecide = finding.ta_status === "confirmed" && finding.teacher_status === "pending";
  return (
    <article className="findingCard">
      <div className="findingHead">
        <span className={`statusChip ta-${finding.ta_status}`}>{TA_STATUS_LABELS[finding.ta_status]}</span>
        <span className={`statusChip teacher-${finding.teacher_status}`}>
          {TEACHER_STATUS_LABELS[finding.teacher_status]}
        </span>
        <span className="chip">生成：{finding.generator}</span>
      </div>
      <p className="phenomenon">{finding.phenomenon}</p>
      <small className="basisNote">
        依据（生成时刻快照）：{finding.basis.participants} 名参与学生 · {finding.basis.requests} 次请求
        · {finding.basis.coverage_note}
      </small>
      {finding.ta_note && <div className="noteLine">TA 备注：{finding.ta_note}</div>}
      {finding.teacher_note && <div className="noteLine">教师备注：{finding.teacher_note}</div>}

      <div className="decisionRow">
        <input
          className="noteInput"
          placeholder="决策备注（可选，随决策留痕）"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={busy || (!taEditable && !teacherCanDecide)}
        />
      </div>
      {taEditable && (
        <div className="decisionRow">
          <span className="decisionLabel">TA 校准：</span>
          <button
            type="button"
            className={finding.ta_status === "confirmed" ? "btn btnPrimary" : "btn"}
            disabled={busy}
            onClick={() => onTa("confirmed", note)}
          >
            确认存在问题
          </button>
          <button
            type="button"
            className={finding.ta_status === "rejected" ? "btn btnDanger" : "btn"}
            disabled={busy}
            onClick={() => onTa("rejected", note)}
          >
            AI 判断有误
          </button>
          <button
            type="button"
            className={finding.ta_status === "ignored" ? "btn btnDanger" : "btn"}
            disabled={busy}
            onClick={() => onTa("ignored", note)}
          >
            忽略
          </button>
        </div>
      )}
      {teacherCanDecide && (
        <div className="decisionRow">
          <span className="decisionLabel">教师决定：</span>
          <button
            type="button"
            className="btn btnPrimary"
            disabled={busy}
            onClick={() => onTeacher("accepted", note)}
          >
            接受（进入周报）
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => onTeacher("ignored", note)}>
            忽略
          </button>
        </div>
      )}
    </article>
  );
}

export default function TeacherPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newClassLabel, setNewClassLabel] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    try {
      setWorkspaces(await apiJson<Workspace[]>("/api/v1/workspaces"));
    } catch (cause) {
      setError(`无法连接后端 API（${API_BASE}）：${messageOf(cause)}`);
    }
  }, []);

  const refreshDetail = useCallback(async (workspaceId: string) => {
    const [stats, items, weekly] = await Promise.all([
      apiJson<Overview>(`/api/v1/workspaces/${workspaceId}/overview`),
      apiJson<Finding[]>(`/api/v1/workspaces/${workspaceId}/findings`),
      apiJson<Report>(`/api/v1/workspaces/${workspaceId}/report`),
    ]);
    setOverview(stats);
    setFindings(items);
    setReport(weekly);
  }, []);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  async function selectWorkspace(workspaceId: string) {
    setSelectedId(workspaceId);
    setError(null);
    setNotice(null);
    try {
      await refreshDetail(workspaceId);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    if (!newTitle.trim() || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await apiJson<Workspace>("/api/v1/workspaces", {
        method: "POST",
        body: JSON.stringify({
          course_id: COURSE_ID,
          course_profile_id: PROFILE_ID,
          title: newTitle.trim(),
          class_label: newClassLabel.trim(),
        }),
      });
      setNewTitle("");
      setNewClassLabel("");
      await loadWorkspaces();
      await selectWorkspace(created.workspace_id);
      setNotice(`工作区已创建：把加入码 ${created.join_code} 发给学生（学生端输入即可挂载作业）。`);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function closeWorkspace(workspaceId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/workspaces/${workspaceId}/close`, { method: "POST" });
      await loadWorkspaces();
      if (workspaceId === selectedId) {
        await refreshDetail(workspaceId);
      }
      setNotice("工作区已关闭：不再接收新请求，聚合与决策仍可继续。");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function generateFindings() {
    if (!selectedId || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiJson<{ findings: Finding[] }>(
        `/api/v1/workspaces/${selectedId}/insights/generate`,
        { method: "POST" },
      );
      setNotice(`AI 产出 ${result.findings.length} 条候选现象，请 TA 逐条校准。`);
      await refreshDetail(selectedId);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function decideTa(findingId: string, decision: string, note: string) {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/findings/${findingId}/ta-decision`, {
        method: "POST",
        body: JSON.stringify({ decision, note: note.trim() || null }),
      });
      if (selectedId) {
        await refreshDetail(selectedId);
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function decideTeacher(findingId: string, decision: string, note: string) {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/findings/${findingId}/teacher-decision`, {
        method: "POST",
        body: JSON.stringify({ decision, note: note.trim() || null }),
      });
      setNotice(decision === "accepted" ? "已接受：该现象将出现在周报中。" : "已忽略：该现象不进入周报。");
      if (selectedId) {
        await refreshDetail(selectedId);
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  function copyJoinCode(code: string) {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  }

  return (
    <main className="teacherMain">
      <header className="studentTop">
        <a href="/" className="backLink">← 返回平台首页</a>
        <p className="eyebrow">Assignment Workspace · 教师 / TA 端</p>
        <h1>作业工作区与班级现象</h1>
        <p>
          学生求助 → 聚合证据 → AI 产出候选现象 → TA 三选一校准 → 教师最终决定 → 周报只呈现教师接受的现象。
        </p>
      </header>

      <div className="privacyNote">
        🔒 隐私边界：本页只展示班级层面的聚合统计与决策留痕；不展示任何学生对话内容、参与码取值，
        也不做学生个体拆分或活跃排行。
      </div>

      {error && <div className="banner">{error}</div>}
      {notice && <div className="noticeBar">{notice}</div>}

      <div className="teacherShell">
        <aside className="teacherPanel">
          <h2>作业工作区（{workspaces.length}）</h2>
          <form className="createForm" onSubmit={createWorkspace}>
            <input
              className="noteInput"
              placeholder="作业名称，例如：第一章作业"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              disabled={busy}
            />
            <input
              className="noteInput"
              placeholder="教学班（可选），例如：数分甲班"
              value={newClassLabel}
              onChange={(event) => setNewClassLabel(event.target.value)}
              disabled={busy}
            />
            <button type="submit" className="btn btnPrimary" disabled={busy || !newTitle.trim()}>
              创建工作区
            </button>
          </form>

          <div className="problemList">
            {workspaces.map((workspace) => (
              <div
                key={workspace.workspace_id}
                className={
                  workspace.workspace_id === selectedId ? "workspaceCard active" : "workspaceCard"
                }
                onClick={() => void selectWorkspace(workspace.workspace_id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void selectWorkspace(workspace.workspace_id);
                  }
                }}
              >
                <div className="workspaceTitleRow">
                  <strong>{workspace.title}</strong>
                  <span className={workspace.status === "open" ? "chip passed" : "chip not_run"}>
                    {workspace.status === "open" ? "进行中" : "已关闭"}
                  </span>
                </div>
                {workspace.class_label && <small>{workspace.class_label}</small>}
                <small>
                  参与学生 {workspace.participants} 名 · 加入码{" "}
                  <code className="joinCode">{workspace.join_code}</code>
                </small>
                <div className="decisionRow">
                  <button
                    type="button"
                    className="btn btnSmall"
                    onClick={(event) => {
                      event.stopPropagation();
                      copyJoinCode(workspace.join_code);
                    }}
                  >
                    {copiedCode === workspace.join_code ? "已复制 ✓" : "复制加入码"}
                  </button>
                  {workspace.status === "open" && (
                    <button
                      type="button"
                      className="btn btnSmall"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void closeWorkspace(workspace.workspace_id);
                      }}
                    >
                      关闭工作区
                    </button>
                  )}
                </div>
              </div>
            ))}
            {workspaces.length === 0 && <div className="emptyTip">还没有工作区，先在上方创建一个。</div>}
          </div>
        </aside>

        <section className="workspace">
          {!selectedId || !overview ? (
            <div className="emptyTip">从左侧选择或创建一个作业工作区。</div>
          ) : (
            <>
              <article className="statementCard">
                <small>聚合总览 · {overview.title}</small>
                <div className="overviewStats">
                  <div className="statBlock">
                    <strong>{overview.participants}</strong>
                    <span>参与学生（去重）</span>
                  </div>
                  <div className="statBlock">
                    <strong>{overview.requests}</strong>
                    <span>求助请求总数</span>
                  </div>
                  <div className="statBlock">
                    <strong>{overview.per_problem.length}</strong>
                    <span>涉及题目数</span>
                  </div>
                </div>
                <table className="overviewTable">
                  <thead>
                    <tr>
                      <th>题目</th>
                      <th>请求数</th>
                      <th>参与人数</th>
                      <th>最深提示级</th>
                      <th>完整解答请求</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.per_problem.map((row) => (
                      <tr key={row.problem_ref ?? "(未命中题目)"}>
                        <td>{row.problem_ref ?? "（未命中题目）"}</td>
                        <td>{row.requests}</td>
                        <td>{row.participants}</td>
                        <td>{row.max_hint_level}</td>
                        <td>{row.full_solution_requests}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="evidenceNote">{overview.coverage_note}</div>
              </article>

              <div className="actionBar">
                <button type="button" className="btn btnPrimary" disabled={busy} onClick={() => void generateFindings()}>
                  生成 AI 候选现象
                </button>
                <span className="decisionLabel">
                  AI 只给候选；是否属实由 TA 校准，是否进周报由教师决定。
                </span>
              </div>

              {findings.map((finding) => (
                <FindingCard
                  key={finding.finding_id}
                  finding={finding}
                  busy={busy}
                  onTa={(decision, note) => void decideTa(finding.finding_id, decision, note)}
                  onTeacher={(decision, note) => void decideTeacher(finding.finding_id, decision, note)}
                />
              ))}

              {report && (
                <article className="reportPanel">
                  <h2>教师周报 · {report.title}</h2>
                  <div className="evidenceNote">
                    {report.coverage_note}
                    <br />
                    {report.channel_note}
                  </div>
                  {report.findings.length === 0 ? (
                    <p className="emptyTip">还没有教师接受的现象：走完“TA 确认 → 教师接受”后才会出现在这里。</p>
                  ) : (
                    report.findings.map((item) => (
                      <div key={item.finding_id} className="reportItem">
                        <p className="phenomenon">{item.phenomenon}</p>
                        <small className="basisNote">
                          {item.coverage_note}
                          {item.teacher_note && <> · 教师备注：{item.teacher_note}</>}
                        </small>
                      </div>
                    ))
                  )}
                </article>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
