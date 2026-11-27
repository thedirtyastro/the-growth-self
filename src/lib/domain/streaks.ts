import { subDays, parseISO, differenceInCalendarDays } from 'date-fns';
import type { ReadingSession } from '../../types/models';
import { mergeDailySessions, toLocalDateKey } from './heatmap';

export interface StreakMetrics {
  currentStreak: number;
  longestStreak: number;
  totalReadingDays: number;
  totalReadingSeconds: number;
  totalPagesRead: number;
}

/**
 * Section 6:
 * - A reading day has at least 1 minute (>= 60 seconds).
 * - Current streak = consecutive days ending today, or ending yesterday if today has no reading yet.
 * - Also computes longest streak, total reading days, total reading time, and total pages read.
 */
export function computeStreaks(
  sessions: ReadingSession[],
  referenceDate: Date = new Date()
): StreakMetrics {
  const aggregates = mergeDailySessions(sessions);
  const readingDates: string[] = [];

  let totalReadingSeconds = 0;
  let totalPagesRead = 0;

  for (const [dateKey, agg] of aggregates.entries()) {
    totalReadingSeconds += agg.durationSeconds;
    totalPagesRead += agg.pagesRead;
    if (agg.minutes >= 1) {
      readingDates.push(dateKey);
    }
  }

  readingDates.sort();
  const totalReadingDays = readingDates.length;

  if (readingDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalReadingDays: 0,
      totalReadingSeconds,
      totalPagesRead,
    };
  }

  // Longest streak across all sorted reading dates
  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < readingDates.length; i++) {
    const prev = parseISO(readingDates[i - 1]);
    const curr = parseISO(readingDates[i]);
    if (differenceInCalendarDays(curr, prev) === 1) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 1;
    }
  }

  // Current streak ending today or yesterday
  const readingSet = new Set(readingDates);
  const todayKey = toLocalDateKey(referenceDate);
  const yesterdayKey = toLocalDateKey(subDays(referenceDate, 1));

  let cursorDate: Date | null = null;
  if (readingSet.has(todayKey)) {
    cursorDate = referenceDate;
  } else if (readingSet.has(yesterdayKey)) {
    cursorDate = subDays(referenceDate, 1);
  }

  let currentStreak = 0;
  while (cursorDate) {
    const key = toLocalDateKey(cursorDate);
    if (readingSet.has(key)) {
      currentStreak += 1;
      cursorDate = subDays(cursorDate, 1);
    } else {
      break;
    }
  }

  return {
    currentStreak,
    longestStreak,
    totalReadingDays,
    totalReadingSeconds,
    totalPagesRead,
  };
}
