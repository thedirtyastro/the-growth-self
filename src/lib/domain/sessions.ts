import type { ReadingSession } from '../../types/models';
import { toLocalDateKey } from './heatmap';

export const SESSION_IDLE_TIMEOUT_MS = 60_000;
export const MIN_PAGE_DWELL_MS = 3_000;

export interface SessionTrackerState {
  id: string;
  bookId: string;
  date: string;
  startedAt: string;
  lastTickAtMs: number;
  lastActivityAtMs: number;
  activeSeconds: number;
  currentPage: number;
  currentPageEnteredAtMs: number;
  pagesViewed: Set<number>;
  paused: boolean;
}

export function createSessionTracker(
  id: string,
  bookId: string,
  initialPage: number,
  nowMs: number = Date.now()
): SessionTrackerState {
  const nowDate = new Date(nowMs);
  return {
    id,
    bookId,
    date: toLocalDateKey(nowDate),
    startedAt: nowDate.toISOString(),
    lastTickAtMs: nowMs,
    lastActivityAtMs: nowMs,
    activeSeconds: 0,
    currentPage: initialPage,
    currentPageEnteredAtMs: nowMs,
    pagesViewed: new Set<number>(),
    paused: false,
  };
}

export function markTrackerActivity(
  state: SessionTrackerState,
  nowMs: number = Date.now()
): SessionTrackerState {
  return {
    ...state,
    lastActivityAtMs: nowMs,
    paused: false,
    lastTickAtMs: state.paused ? nowMs : state.lastTickAtMs,
  };
}

export function changeTrackerPage(
  state: SessionTrackerState,
  nextPage: number,
  nowMs: number = Date.now()
): SessionTrackerState {
  const nextPagesViewed = new Set(state.pagesViewed);
  if (nowMs - state.currentPageEnteredAtMs >= MIN_PAGE_DWELL_MS && state.currentPage >= 1) {
    nextPagesViewed.add(state.currentPage);
  }
  return {
    ...state,
    currentPage: nextPage,
    currentPageEnteredAtMs: nowMs,
    lastActivityAtMs: nowMs,
    paused: false,
    pagesViewed: nextPagesViewed,
  };
}

export function tickSessionTracker(
  state: SessionTrackerState,
  isDocumentVisible: boolean,
  nowMs: number = Date.now()
): SessionTrackerState {
  const idleElapsed = nowMs - state.lastActivityAtMs;
  if (!isDocumentVisible || idleElapsed >= SESSION_IDLE_TIMEOUT_MS) {
    return {
      ...state,
      paused: true,
      lastTickAtMs: nowMs,
    };
  }

  const deltaSeconds = Math.max(0, Math.min(10, (nowMs - state.lastTickAtMs) / 1000));
  const nextPagesViewed = new Set(state.pagesViewed);
  if (nowMs - state.currentPageEnteredAtMs >= MIN_PAGE_DWELL_MS && state.currentPage >= 1) {
    nextPagesViewed.add(state.currentPage);
  }

  return {
    ...state,
    paused: false,
    lastTickAtMs: nowMs,
    activeSeconds: state.activeSeconds + deltaSeconds,
    pagesViewed: nextPagesViewed,
  };
}

export function snapshotSession(
  state: SessionTrackerState,
  nowMs: number = Date.now()
): ReadingSession {
  const pagesViewed = new Set(state.pagesViewed);
  if (
    !state.paused &&
    nowMs - state.currentPageEnteredAtMs >= MIN_PAGE_DWELL_MS &&
    state.currentPage >= 1
  ) {
    pagesViewed.add(state.currentPage);
  }
  const pagesList = Array.from(pagesViewed).sort((a, b) => a - b);
  return {
    id: state.id,
    bookId: state.bookId,
    date: state.date,
    startedAt: state.startedAt,
    endedAt: new Date(nowMs).toISOString(),
    durationSeconds: Math.round(state.activeSeconds),
    pagesViewed: pagesList,
    pagesRead: pagesList.length,
  };
}
