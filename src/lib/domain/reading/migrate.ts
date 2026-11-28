import type { BookStatus, Progress, ReadingSession } from '../../../types/models';
import { CFG } from './constants';
import { creditVisit } from './progress';

export interface LegacyBookInput {
  id: string;
  status: BookStatus;
  totalPages: number;
  currentPage?: number;
  furthestPage?: number;
  completedAt?: string;
  lastReadAt?: string;
}

export interface LegacySessionInput {
  bookId: string;
  startPage?: number;
  endPage?: number;
  durationMinutes?: number;
  durationSeconds?: number;
  pagesViewed?: number[];
  endedAt?: string;
}

/**
 * Migrates a legacy Book + its sessions (without discarding prior data) into a Progress record.
 * - Legacy completed books preserve completion as `manual`, round = 1, leaving pageStates empty (0).
 * - Legacy ongoing books preserve `position` and convert historical session dwell into initial page coverage.
 */
export function migrateLegacy(
  book: LegacyBookInput,
  sessions: Array<LegacySessionInput | ReadingSession>,
  total?: number
): Progress {
  const safeTotal = Math.max(1, total ?? book.totalPages ?? 1);
  const bookSessions = sessions.filter((s) => s.bookId === book.id);

  const pageStates = Array<number>(safeTotal + 1).fill(0);
  const dwellMs = Array<number>(safeTotal + 1).fill(0);

  const rawPos = book.currentPage && book.currentPage >= 1
    ? book.currentPage
    : book.furthestPage && book.furthestPage >= 1
      ? book.furthestPage
      : 1;
  const position = Math.max(1, Math.min(rawPos, safeTotal));

  let totalActiveMs = 0;
  for (const s of bookSessions) {
    const ms =
      'durationSeconds' in s && typeof s.durationSeconds === 'number'
        ? Math.max(0, Math.round(s.durationSeconds * 1000))
        : 'durationMinutes' in s && typeof s.durationMinutes === 'number'
          ? Math.max(0, Math.round(s.durationMinutes * 60_000))
          : 0;
    totalActiveMs += ms;
  }

  if (book.status === 'completed') {
    const completedAt = book.completedAt ?? book.lastReadAt ?? new Date().toISOString();
    return {
      bookId: book.id,
      round: 1,
      position: Math.max(1, Math.min(safeTotal, rawPos || safeTotal)),
      contentStart: 1,
      contentEnd: safeTotal,
      rangeDetected: false,
      pageStates,
      dwellMs,
      completionType: 'manual',
      completedAt,
      completions: [
        {
          round: 1,
          type: 'manual',
          completedAt,
          readPages: 0,
          skimmedPages: 0,
          activeMs: totalActiveMs,
        },
      ],
    };
  }

  let progress: Progress = {
    bookId: book.id,
    round: 1,
    position,
    contentStart: 1,
    contentEnd: safeTotal,
    rangeDetected: false,
    pageStates,
    dwellMs,
    completions: [],
  };

  // Credit real session time if sessions list pagesViewed or startPage..endPage
  for (const s of bookSessions) {
    const ms =
      'durationSeconds' in s && typeof s.durationSeconds === 'number'
        ? Math.max(0, Math.round(s.durationSeconds * 1000))
        : 'durationMinutes' in s && typeof s.durationMinutes === 'number'
          ? Math.max(0, Math.round(s.durationMinutes * 60_000))
          : 0;
    if (ms < CFG.VISIT_MIN_MS) continue;

    let pages: number[] = [];
    if ('pagesViewed' in s && Array.isArray(s.pagesViewed) && s.pagesViewed.length > 0) {
      pages = s.pagesViewed;
    } else if (
      'startPage' in s &&
      typeof s.startPage === 'number' &&
      'endPage' in s &&
      typeof s.endPage === 'number'
    ) {
      const a = Math.max(1, Math.min(s.startPage, s.endPage));
      const b = Math.min(safeTotal, Math.max(s.startPage, s.endPage));
      pages = Array.from({ length: b - a + 1 }, (_, idx) => a + idx);
    }

    if (pages.length > 0) {
      progress = creditVisit(
        progress,
        {
          pages,
          activeMs: ms,
          totalVisitMs: ms,
          settledAt: Date.now(),
          jumped: false,
        },
        []
      );
    }
  }

  return progress;
}
