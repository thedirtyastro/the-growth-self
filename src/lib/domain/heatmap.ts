import { format, startOfWeek, subWeeks, addDays } from 'date-fns';
import type { ReadingSession } from '../../types/models';

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export interface DailyAggregate {
  date: string;
  durationSeconds: number;
  minutes: number;
  pagesRead: number;
  level: HeatmapLevel;
  books: Array<{
    bookId: string;
    durationSeconds: number;
    pagesRead: number;
  }>;
  sessions: ReadingSession[];
}

export interface HeatmapCell {
  date: string;
  col: number;
  row: number;
  minutes: number;
  pagesRead: number;
  level: HeatmapLevel;
  isFuture: boolean;
  aggregate?: DailyAggregate;
}

export interface HeatmapMonthLabel {
  label: string;
  col: number;
  percent: number;
}

export function toLocalDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Section 6:
 * 0 none, 1 = 1 to 9 min, 2 = 10 to 19 min, 3 = 20 to 39 min, 4 = 40+ min
 */
export function getHeatmapLevel(minutes: number): HeatmapLevel {
  if (minutes < 1) return 0;
  if (minutes <= 9) return 1;
  if (minutes <= 19) return 2;
  if (minutes <= 39) return 3;
  return 4;
}

/**
 * Merges same-day sessions and produces per-day aggregates with per-book merged totals.
 */
export function mergeDailySessions(sessions: ReadingSession[]): Map<string, DailyAggregate> {
  const byDate = new Map<string, ReadingSession[]>();

  for (const s of sessions) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }

  const result = new Map<string, DailyAggregate>();
  for (const [date, daySessions] of byDate.entries()) {
    let totalDuration = 0;
    const byBook = new Map<string, { durationSeconds: number; pagesSet: Set<number>; fallbackPages: number }>();

    for (const session of daySessions) {
      totalDuration += session.durationSeconds;
      const entry = byBook.get(session.bookId) ?? {
        durationSeconds: 0,
        pagesSet: new Set<number>(),
        fallbackPages: 0,
      };
      entry.durationSeconds += session.durationSeconds;
      if (session.pagesViewed.length > 0) {
        for (const p of session.pagesViewed) entry.pagesSet.add(p);
      } else {
        entry.fallbackPages += session.pagesRead;
      }
      byBook.set(session.bookId, entry);
    }

    let totalPages = 0;
    const books: DailyAggregate['books'] = [];
    for (const [bookId, info] of byBook.entries()) {
      const pagesRead = info.pagesSet.size > 0 ? info.pagesSet.size : info.fallbackPages;
      totalPages += pagesRead;
      books.push({
        bookId,
        durationSeconds: info.durationSeconds,
        pagesRead,
      });
    }

    books.sort((a, b) => b.durationSeconds - a.durationSeconds);

    const minutes = Math.floor(totalDuration / 60);
    result.set(date, {
      date,
      durationSeconds: totalDuration,
      minutes,
      pagesRead: totalPages,
      level: getHeatmapLevel(minutes),
      books,
      sessions: [...daySessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    });
  }

  return result;
}

/**
 * Builds a 52-column x 7-row heatmap grid ending in the current week.
 * Weeks start on Sunday (weekStartsOn: 0). Days in the future are flagged isFuture: true.
 */
export function buildHeatmapGrid(
  sessions: ReadingSession[],
  referenceDate: Date = new Date()
): {
  cells: HeatmapCell[];
  months: HeatmapMonthLabel[];
  activeDaysCount: number;
} {
  const todayKey = toLocalDateKey(referenceDate);
  const currentWeekStart = startOfWeek(referenceDate, { weekStartsOn: 0 });
  const gridStart = subWeeks(currentWeekStart, 51);
  const aggregates = mergeDailySessions(sessions);

  const cells: HeatmapCell[] = [];
  const months: HeatmapMonthLabel[] = [];
  let lastMonth = -1;
  let activeDaysCount = 0;

  for (let col = 0; col < 52; col++) {
    const weekDate = addDays(gridStart, col * 7);
    const month = weekDate.getMonth();
    if (month !== lastMonth) {
      const prev = months[months.length - 1];
      if (prev && col - prev.col < 3) {
        months.pop();
      }
      months.push({
        label: format(weekDate, 'MMM'),
        col,
        percent: (col / 52) * 100,
      });
      lastMonth = month;
    }

    for (let row = 0; row < 7; row++) {
      const cellDate = addDays(weekDate, row);
      const dateKey = toLocalDateKey(cellDate);
      const isFuture = dateKey > todayKey;
      const agg = isFuture ? undefined : aggregates.get(dateKey);
      const minutes = agg ? agg.minutes : 0;
      const level = agg ? agg.level : 0;

      if (!isFuture && minutes >= 1) {
        activeDaysCount += 1;
      }

      cells.push({
        date: dateKey,
        col,
        row,
        minutes,
        pagesRead: agg ? agg.pagesRead : 0,
        level,
        isFuture,
        aggregate: agg,
      });
    }
  }

  return { cells, months, activeDaysCount };
}

export function formatDurationCompact(totalSeconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
