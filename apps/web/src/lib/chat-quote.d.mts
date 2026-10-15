export const QUOTE_HEADER: string;
export const QUOTE_SKIP: string;

export type SourceMeta = {
  source: string;
  label: string;
  paneId: string;
  attemptId?: string | null;
  requestId: string;
};

export type RawQuoteUnit = {
  unit: "text" | "mathInline" | "mathBlock";
  key: string;
  source: string;
  text: string;
  label: string;
  paneId: string;
  attemptId: string | null;
  requestId: string;
};

export function isFollowUpText(text: unknown): boolean;
export function isFollowUpTitle(title: unknown): boolean;
export function serializeFollowUp(fragments: { label?: string; source?: string; text?: string }[], question: string): string;
export function parseFollowUp(text: string): { fragments: { index: number; label: string; source: string }[]; question: string } | null;
export function plainFromSource(source: unknown): string;
export function buildTurnLabel(paneTitle: string, turnIndex: number): string;
export function annotateQuoteBlocks(): (tree: unknown) => void;
export function topUnitsWithin(root: Element): HTMLElement[];
export function collectUnitsWithin(root: Element, sources: Record<string, SourceMeta>): RawQuoteUnit[];
export function quoteKeyOf(el: Element): string;
export function readQuoteUnit(el: HTMLElement, sources: Record<string, SourceMeta> | undefined): RawQuoteUnit | null;
export function readRangePiece(selection: Selection | null, container: Element | null): { source: string; host: Element | null } | null;
