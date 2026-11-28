import { format } from 'date-fns';
import { CFG, type Visit } from './constants';

/**
 * Expected minimum active milliseconds required to consider a page "read".
 * Null/undefined word counts indicate a scanned/image page without a text layer.
 */
export function minReadMs(words: number | null | undefined): number {
  if (words == null) {
    return CFG.NO_TEXT_S * 1000;
  }
  const safeWords = Math.max(0, words);
  const ms = (safeWords / CFG.WPM_CAP) * 60_000;
  return Math.round(Math.max(CFG.MIN_S * 1000, Math.min(CFG.MAX_S * 1000, ms)));
}

export interface DaySlice {
  date: string;
  startedAt: string;
  endedAt: string;
  activeMs: number;
}

/**
 * Splits an active reading interval ending at `endMs` across local midnight boundaries
 * so late-night reading credits each calendar day proportionally.
 */
export function splitDurationByLocalDay(endMs: number, activeMs: number): DaySlice[] {
  const safeActive = Math.round(activeMs);
  if (safeActive <= 0) return [];

  let cursorStart = endMs - safeActive;
  const slices: DaySlice[] = [];

  while (cursorStart < endMs) {
    const startDate = new Date(cursorStart);
    const nextMidnight = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + 1,
      0,
      0,
      0,
      0
    ).getTime();

    const sliceEnd = Math.min(endMs, nextMidnight);
    const sliceMs = sliceEnd - cursorStart;
    if (sliceMs > 0) {
      slices.push({
        date: format(startDate, 'yyyy-MM-dd'),
        startedAt: new Date(cursorStart).toISOString(),
        endedAt: new Date(sliceEnd).toISOString(),
        activeMs: sliceMs,
      });
    }
    cursorStart = sliceEnd;
  }

  return slices;
}

/**
 * Pure dwell tracker for one open book session.
 * Accumulates active visible non-idle time on the currently settled page/spread.
 */
export class DwellTracker {
  private pages: number[] = [];
  private startedAt: number | null = null;
  private lastInputAt = 0;
  private lastTickAt = 0;
  private activeMs = 0;
  private totalVisitMs = 0;
  private visible: boolean;
  private jumped = false;

  constructor(initialVisible = true) {
    this.visible = initialVisible;
  }

  private advance(now: number): void {
    if (!this.visible || this.pages.length === 0 || this.startedAt === null) {
      this.lastTickAt = now;
      return;
    }
    const activeEnd = Math.min(now, this.lastInputAt + CFG.IDLE_MS);
    if (activeEnd > this.lastTickAt) {
      this.activeMs += activeEnd - this.lastTickAt;
    }
    this.lastTickAt = now;
  }

  /**
   * Transitions to a newly settled page or spread.
   * Returns any ended visit so callers can credit it and update resume position.
   */
  public show(pages: number[], now: number, jumped = false): Visit | null {
    const ended = this.flushVisit(now, true);
    const clean = Array.from(
      new Set(pages.filter((p) => Number.isInteger(p) && p >= 1))
    );
    this.pages = clean;
    this.startedAt = clean.length > 0 ? now : null;
    this.lastInputAt = now;
    this.lastTickAt = now;
    this.activeMs = 0;
    this.totalVisitMs = 0;
    this.jumped = jumped;
    return ended;
  }

  /**
   * Registers user activity (pointer, key, wheel, touch).
   */
  public input(now: number): void {
    this.advance(now);
    this.lastInputAt = now;
  }

  /**
   * Updates document visibility state. Hidden tabs accumulate zero active time.
   */
  public setVisible(visible: boolean, now: number): void {
    this.advance(now);
    this.visible = visible;
    this.lastTickAt = now;
    if (visible) {
      this.lastInputAt = now;
    }
  }

  /**
   * Commits accumulated active time for the current visit without leaving the page.
   * Call periodically (every 30s), on close, and on pagehide.
   */
  public commit(now: number): Visit | null {
    return this.flushVisit(now, false);
  }

  public getCurrentPages(): number[] {
    return [...this.pages];
  }

  private flushVisit(now: number, clearPages: boolean): Visit | null {
    this.advance(now);
    if (this.pages.length === 0 || this.startedAt === null) {
      if (clearPages) {
        this.pages = [];
        this.startedAt = null;
      }
      return null;
    }

    const chunkMs = Math.round(this.activeMs);
    const nextTotal = this.totalVisitMs + chunkMs;
    const visit: Visit | null =
      chunkMs > 0
        ? {
            pages: [...this.pages],
            activeMs: chunkMs,
            totalVisitMs: nextTotal,
            settledAt: this.startedAt,
            jumped: this.jumped,
          }
        : null;

    if (clearPages) {
      this.pages = [];
      this.startedAt = null;
      this.activeMs = 0;
      this.totalVisitMs = 0;
      this.jumped = false;
    } else {
      this.totalVisitMs = nextTotal;
      this.activeMs = 0;
      this.lastTickAt = now;
      if (nextTotal >= CFG.POSITION_DWELL_MS) {
        this.jumped = false;
      }
    }

    return visit;
  }
}
