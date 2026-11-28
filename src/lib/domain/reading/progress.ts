import type { BookStatus, CompletionType, Progress } from '../../../types/models';
import {
  CFG,
  type FinishChoice,
  type NavSource,
  type PageState,
  type ProgressStats,
  type PromptContext,
  type PromptReason,
  type Visit,
  type WordCountLookup,
} from './constants';
import { minReadMs } from './dwell';

export interface FinishOutcome {
  progress: Progress;
  needsConfirm?: boolean;
  coverage?: number;
}

export function createInitialProgress(
  bookId: string,
  totalPages: number,
  initialStatus: BookStatus = 'not-started',
  nowIso: string = new Date().toISOString()
): Progress {
  const safeTotal = Math.max(1, Math.round(totalPages));
  const base: Progress = {
    bookId,
    round: 1,
    position: initialStatus === 'completed' ? safeTotal : 1,
    contentStart: 1,
    contentEnd: safeTotal,
    rangeDetected: false,
    pageStates: Array<number>(safeTotal + 1).fill(0),
    dwellMs: Array<number>(safeTotal + 1).fill(0),
    completions: [],
  };

  if (initialStatus === 'completed') {
    base.completionType = 'manual';
    base.completedAt = nowIso;
    base.completions = [
      {
        round: 1,
        type: 'manual',
        completedAt: nowIso,
        readPages: 0,
        skimmedPages: 0,
        activeMs: 0,
      },
    ];
  }

  return base;
}

export function resizeProgressArrays(p: Progress, totalPages: number): Progress {
  const targetLen = Math.max(1, Math.round(totalPages)) + 1;
  if (p.pageStates.length === targetLen && p.dwellMs.length === targetLen) {
    return p;
  }

  const nextStates = Array<number>(targetLen).fill(0);
  const nextDwell = Array<number>(targetLen).fill(0);
  for (let i = 1; i < Math.min(targetLen, p.pageStates.length); i++) {
    nextStates[i] = p.pageStates[i] ?? 0;
  }
  for (let i = 1; i < Math.min(targetLen, p.dwellMs.length); i++) {
    nextDwell[i] = p.dwellMs[i] ?? 0;
  }

  const maxPage = targetLen - 1;
  const contentStart = Math.max(1, Math.min(p.contentStart, maxPage));
  const contentEnd = Math.max(contentStart, Math.min(p.contentEnd, maxPage));
  const position = Math.max(1, Math.min(p.position, maxPage));

  return {
    ...p,
    position,
    contentStart,
    contentEnd,
    pageStates: nextStates,
    dwellMs: nextDwell,
  };
}

function getWordCount(words: WordCountLookup, page: number): number | null | undefined {
  if (typeof words === 'function') {
    return words(page);
  }
  return words[page];
}

/**
 * Credits active dwell time from a visit across the visible page(s).
 * In a two-page spread, active time splits proportionally by each page's minReadMs.
 * Page states only ever move upward (0 -> 1 -> 2).
 */
export function creditVisit(
  p: Progress,
  v: Visit | null,
  words: WordCountLookup
): Progress {
  if (!v || v.activeMs < CFG.VISIT_MIN_MS || v.pages.length === 0) {
    return p;
  }

  const maxPage = p.pageStates.length - 1;
  const validPages = Array.from(
    new Set(v.pages.filter((pg) => Number.isInteger(pg) && pg >= 1 && pg <= maxPage))
  );
  if (validPages.length === 0) return p;

  const mins = validPages.map((pg) => minReadMs(getWordCount(words, pg)));
  const totalMin = mins.reduce((acc, m) => acc + m, 0);
  if (totalMin <= 0) return p;

  const nextDwell = [...p.dwellMs];
  const nextStates = [...p.pageStates];

  for (let i = 0; i < validPages.length; i++) {
    const pg = validPages[i];
    const share = Math.round(v.activeMs * (mins[i] / totalMin));
    const updatedMs = (nextDwell[pg] ?? 0) + share;
    nextDwell[pg] = updatedMs;

    const prevState = nextStates[pg] ?? 0;
    if (updatedMs >= mins[i]) {
      nextStates[pg] = 2;
    } else if (updatedMs >= CFG.VISIT_MIN_MS && prevState < 1) {
      nextStates[pg] = 1;
    }
  }

  return {
    ...p,
    dwellMs: nextDwell,
    pageStates: nextStates,
  };
}

export function isJump(from: number, to: number, source: NavSource): boolean {
  return source !== 'turn' || Math.abs(to - from) > CFG.JUMP_PAGES;
}

/**
 * Moves resume position only after the user settles on the target page/spread
 * for at least POSITION_DWELL_MS (5 seconds).
 */
export function commitPosition(p: Progress, v: Visit | null): Progress {
  if (!v || v.pages.length === 0) return p;
  if (v.totalVisitMs < CFG.POSITION_DWELL_MS) return p;

  const maxPage = Math.max(1, p.pageStates.length - 1);
  const target = Math.max(1, Math.min(v.pages[0], maxPage));
  if (target === p.position) return p;
  return {
    ...p,
    position: target,
  };
}

export function applyContentRange(
  p: Progress,
  start: number,
  end: number,
  rangeDetected = true
): Progress {
  const maxPage = Math.max(1, p.pageStates.length - 1);
  const safeStart = Math.max(1, Math.min(Math.round(start), maxPage));
  const safeEnd = Math.max(safeStart, Math.min(Math.round(end), maxPage));
  return {
    ...p,
    contentStart: safeStart,
    contentEnd: safeEnd,
    rangeDetected,
  };
}

export function stats(p: Progress): ProgressStats {
  const maxPage = Math.max(1, p.pageStates.length - 1);
  const start = Math.max(1, Math.min(p.contentStart, maxPage));
  const end = Math.max(start, Math.min(p.contentEnd, maxPage));
  const contentPages = Math.max(1, end - start + 1);

  let readPages = 0;
  let skimmedPages = 0;
  let unseenPages = 0;

  for (let pg = start; pg <= end; pg++) {
    const st = p.pageStates[pg] ?? 0;
    if (st === 2) readPages += 1;
    else if (st === 1) skimmedPages += 1;
    else unseenPages += 1;
  }

  let activeMs = 0;
  for (let pg = 1; pg < p.dwellMs.length; pg++) {
    activeMs += p.dwellMs[pg] ?? 0;
  }

  const coverage = readPages / contentPages;
  const percent = Math.round(coverage * 100);
  const viewedRatio = (readPages + skimmedPages) / contentPages;

  return {
    contentPages,
    readPages,
    skimmedPages,
    unseenPages,
    coverage,
    percent,
    viewedRatio,
    activeMs,
  };
}

export function deriveStatus(p: Progress): BookStatus {
  if (p.completionType) {
    return 'completed';
  }
  const s = stats(p);
  if (s.readPages >= 1 || s.viewedRatio >= CFG.ONGOING_VIEWED) {
    return 'ongoing';
  }
  return 'not-started';
}

export function overallProgress(all: Progress[]): number {
  if (all.length === 0) return 0;
  let totalContent = 0;
  let totalRead = 0;
  for (const p of all) {
    const s = stats(p);
    totalContent += s.contentPages;
    totalRead += s.readPages;
  }
  if (totalContent <= 0) return 0;
  return Math.round((totalRead / totalContent) * 100);
}

export function promptReason(p: Progress, ctx: PromptContext): PromptReason {
  if (p.completionType) return null;

  const s = stats(p);
  const canPrompt =
    p.promptDismissedAt === undefined ||
    s.coverage - p.promptDismissedAt >= CFG.PROMPT_STEP - 1e-9;

  if (!canPrompt) return null;

  if (ctx.opening) {
    return s.coverage >= CFG.PROMPT_AT ? 'catch-up' : null;
  }

  if (ctx.leaving === 'forward' && ctx.onContentEnd) {
    return 'end-of-book';
  }

  if (ctx.leaving === 'close') {
    if (ctx.onContentEnd) return 'close-at-end';
    if (s.coverage >= CFG.PROMPT_AT) return 'catch-up';
  }

  return null;
}

function recordCompletion(p: Progress, type: CompletionType, nowIso: string): Progress {
  const s = stats(p);
  return {
    ...p,
    completionType: type,
    completedAt: nowIso,
    promptDismissedAt: undefined,
    completions: [
      ...p.completions,
      {
        round: p.round,
        type,
        completedAt: nowIso,
        readPages: s.readPages,
        skimmedPages: s.skimmedPages,
        activeMs: s.activeMs,
      },
    ],
  };
}

export function applyChoice(
  p: Progress,
  c: FinishChoice,
  nowIso: string = new Date().toISOString()
): FinishOutcome {
  const s = stats(p);

  if (c === 'notyet') {
    return {
      progress: {
        ...p,
        promptDismissedAt: s.coverage,
      },
    };
  }

  if (c === 'read') {
    if (s.coverage < CFG.WEAK_COVERAGE) {
      return {
        progress: p,
        needsConfirm: true,
        coverage: s.coverage,
      };
    }
    return { progress: recordCompletion(p, 'read', nowIso) };
  }

  if (c === 'anyway') {
    return { progress: recordCompletion(p, 'read', nowIso) };
  }

  if (c === 'skimmed') {
    return { progress: recordCompletion(p, 'skimmed', nowIso) };
  }

  // 'elsewhere'
  return { progress: recordCompletion(p, 'manual', nowIso) };
}

export function readAgain(p: Progress): Progress {
  return {
    ...p,
    round: p.round + 1,
    position: Math.max(1, p.contentStart),
    pageStates: Array<number>(p.pageStates.length).fill(0),
    dwellMs: Array<number>(p.dwellMs.length).fill(0),
    completionType: undefined,
    completedAt: undefined,
    promptDismissedAt: undefined,
  };
}

export function findFirstUnreadPage(p: Progress): number {
  const maxPage = Math.max(1, p.pageStates.length - 1);
  const start = Math.max(1, Math.min(p.contentStart, maxPage));
  const end = Math.max(start, Math.min(p.contentEnd, maxPage));

  for (let pg = start; pg <= end; pg++) {
    if ((p.pageStates[pg] ?? 0) < 2) {
      return pg;
    }
  }
  return start;
}

export function formatSkippedRanges(p: Progress): string | null {
  const maxPage = Math.max(1, p.pageStates.length - 1);
  const start = Math.max(1, Math.min(p.contentStart, maxPage));
  const end = Math.max(start, Math.min(p.contentEnd, maxPage));

  const ranges: Array<[number, number]> = [];
  let rangeStart: number | null = null;

  for (let pg = start; pg <= end; pg++) {
    const state = p.pageStates[pg] ?? 0;
    if (state === 0) {
      if (rangeStart === null) rangeStart = pg;
    } else if (rangeStart !== null) {
      ranges.push([rangeStart, pg - 1]);
      rangeStart = null;
    }
  }
  if (rangeStart !== null) {
    ranges.push([rangeStart, end]);
  }

  if (ranges.length === 0) return null;

  const formatted = ranges.slice(0, 3).map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`));
  const suffix = ranges.length > 3 ? ` (+${ranges.length - 3} more)` : '';
  return `Pages ${formatted.join(', ')}${suffix} unread`;
}

export interface PageMapBin {
  startPage: number;
  endPage: number;
  state: PageState;
  readCount: number;
  skimmedCount: number;
  unseenCount: number;
}

/**
 * Produces up to `maxBins` (300) contiguous page-state segments across contentStart..contentEnd
 * for the 3px PageMap strip on BookDetailPage.
 */
export function binPageStates(p: Progress, maxBins = 300): PageMapBin[] {
  const maxPage = Math.max(1, p.pageStates.length - 1);
  const start = Math.max(1, Math.min(p.contentStart, maxPage));
  const end = Math.max(start, Math.min(p.contentEnd, maxPage));
  const count = end - start + 1;

  const binCount = Math.min(count, Math.max(1, maxBins));
  const bins: PageMapBin[] = [];

  for (let b = 0; b < binCount; b++) {
    const bStart = start + Math.floor((b * count) / binCount);
    const bEnd = start + Math.floor(((b + 1) * count) / binCount) - 1;
    const safeBEnd = Math.max(bStart, Math.min(end, bEnd));

    let readCount = 0;
    let skimmedCount = 0;
    let unseenCount = 0;
    for (let pg = bStart; pg <= safeBEnd; pg++) {
      const st = p.pageStates[pg] ?? 0;
      if (st === 2) readCount += 1;
      else if (st === 1) skimmedCount += 1;
      else unseenCount += 1;
    }

    const totalInBin = safeBEnd - bStart + 1;
    let state: PageState = 0;
    if (readCount === totalInBin || readCount >= Math.ceil(totalInBin * 0.5)) {
      state = 2;
    } else if (readCount > 0 || skimmedCount > 0) {
      state = 1;
    }

    bins.push({
      startPage: bStart,
      endPage: safeBEnd,
      state,
      readCount,
      skimmedCount,
      unseenCount,
    });
  }

  return bins;
}

export function wordCountFromTextItems(items: Array<{ str?: string }> | null | undefined): number | null {
  if (!items || items.length === 0) return null;
  let totalWords = 0;
  let hasNonSpace = false;

  for (const item of items) {
    const s = item.str;
    if (!s) continue;
    const trimmed = s.trim();
    if (!trimmed) continue;
    hasNonSpace = true;
    totalWords += trimmed.split(/\s+/).length;
  }

  return hasNonSpace ? totalWords : null;
}
