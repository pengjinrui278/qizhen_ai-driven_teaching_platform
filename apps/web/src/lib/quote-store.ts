// 剪刀工作区的类型与 localStorage 持久化（M1：pane 树 + 引用片段；events 不落盘，刷新后按 attemptId 重拉）
export type QuotePiece = {
  id: string;
  key: string;            // 由 DOM 标记推导，用于回贴选中态；段内拖选为 part:<uuid>
  unit: "text" | "mathInline" | "mathBlock";
  source: string;         // 归一化 markdown 切片（发送与卡片渲染用）
  text: string;           // 纯文本预览
  label: string;          // "主页面 · 第 2 轮回答"
  paneId: string;         // 来源 pane
  attemptId: string | null;
  requestId: string;
};

export type PaneState = {
  id: string;
  parentId: string;              // "main" 或其它 pane id
  title: string;                 // "子页面 1"
  attemptId: string | null;      // 子页面的正式会话 id（发送后写入）
  quotes: QuotePiece[];          // 创建时固化的引用
  question: string;              // 发起子页面的问题
  weight: number;                // M2：flex 权重；M1 恒为 1
  state: "open" | "tab";         // M2：抽页；M1 恒为 open
  pinned: boolean;
  createdAt: number;
};

export type QuoteWorkspaceState = {
  v: 1;
  userId: string;
  mainAttemptId: string | null;
  course: string;
  panes: PaneState[];
  links?: Record<string, string>; // 子会话 attemptId → 父会话 attemptId（历史「追问」归组，关闭子页面后仍保留）
  seq: number;                   // 子页面编号序列
  updatedAt: number;
};

const PIECE_SOURCE_LIMIT = 4000;
const MAX_PANES = 6;
const MAX_PIECES = 12;

export function holdPiece<T extends { source: string; text: string }>(piece: T): T {
  return { ...piece, source: piece.source.slice(0, PIECE_SOURCE_LIMIT), text: piece.text.slice(0, PIECE_SOURCE_LIMIT) };
}

export function canAddPane(panes: PaneState[]) { return panes.length < MAX_PANES; }
export function canAddPiece(pieces: QuotePiece[]) { return pieces.length < MAX_PIECES; }
export const paneLimit = MAX_PANES;
export const pieceLimit = MAX_PIECES;

export function newPaneId() { return "pane-" + Math.random().toString(36).slice(2, 10); }

// 父页面子树末尾之后 —— 子页面 2 落在子页面 1 的右边，而不是跑到主页面之外。
// 依赖不变式：panes 按「子树连续」排列（新页总是插在自己父级的子树末尾），M2 换位后需保持。
export function subtreeEnd(panes: PaneState[], parentId: string) {
  const baseDepth = parentId === "main" ? -1 : paneDepth(panes, parentId);
  let end = parentId === "main" ? 0 : panes.findIndex((p) => p.id === parentId) + 1;
  if (end <= 0) end = 0;
  while (end < panes.length && paneDepth(panes, panes[end].id) > baseDepth) end += 1;
  return end;
}

export function descendantIds(panes: PaneState[], id: string): string[] {
  const direct = panes.filter((p) => p.parentId === id);
  return direct.flatMap((p) => [p.id, ...descendantIds(panes, p.id)]);
}

export function paneDepth(panes: PaneState[], id: string): number {
  let depth = 0, current = panes.find((p) => p.id === id);
  while (current && current.parentId !== "main") {
    depth += 1;
    current = panes.find((p) => p.id === current!.parentId);
  }
  return depth;
}

const key = (userId: string) => "learning-mirror.scissors.v1." + userId;

export function loadWorkspace(userId: string, mainAttemptId: string | null): QuoteWorkspaceState | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as QuoteWorkspaceState;
    if (value?.v !== 1 || value.userId !== userId) return null;
    if ((value.mainAttemptId || null) !== (mainAttemptId || null)) return null;
    if (!Array.isArray(value.panes)) return null;
    return value;
  } catch {
    return null;
  }
}

export function saveWorkspace(workspace: QuoteWorkspaceState) {
  if (typeof window === "undefined" || !workspace.userId) return;
  try {
    window.localStorage.setItem(key(workspace.userId), JSON.stringify({ ...workspace, updatedAt: Date.now() }));
  } catch {
    /* 配额或隐私模式：子页面仍可用，只是不跨刷新恢复 */
  }
}

export function clearWorkspace(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.removeItem(key(userId));
  } catch {
    /* 同上 */
  }
}
