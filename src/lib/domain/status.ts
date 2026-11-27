import type { Book, BookStatus } from '../../types/models';

export interface StatusTransitionInput {
  currentStatus: BookStatus;
  pageOpened: number;
  totalPages: number;
  hasSessionLogged?: boolean;
  startedAt?: string;
  completedAt?: string;
  nowIso?: string;
}

export interface StatusTransitionResult {
  status: BookStatus;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Derives updated book status according to section 6:
 * - not-started until the user opens page 2 or logs a session
 * - ongoing after that (sets startedAt)
 * - completed when the last page is reached (sets completedAt)
 */
export function deriveBookStatus(input: StatusTransitionInput): StatusTransitionResult {
  const now = input.nowIso ?? new Date().toISOString();
  const safeTotal = Math.max(1, input.totalPages);
  const clampedPage = Math.max(0, Math.min(input.pageOpened, safeTotal));

  if (input.currentStatus === 'completed') {
    return {
      status: 'completed',
      startedAt: input.startedAt ?? now,
      completedAt: input.completedAt ?? now,
    };
  }

  if (clampedPage >= safeTotal && safeTotal > 0) {
    return {
      status: 'completed',
      startedAt: input.startedAt ?? now,
      completedAt: input.completedAt ?? now,
    };
  }

  if (
    input.currentStatus === 'ongoing' ||
    clampedPage >= 2 ||
    Boolean(input.hasSessionLogged)
  ) {
    return {
      status: 'ongoing',
      startedAt: input.startedAt ?? now,
      completedAt: input.completedAt,
    };
  }

  return {
    status: 'not-started',
    startedAt: input.startedAt,
    completedAt: input.completedAt,
  };
}

export function computeBookProgress(currentPage: number, totalPages: number): number {
  if (totalPages <= 0) return 0;
  const clamped = Math.max(0, Math.min(currentPage, totalPages));
  return Math.round((clamped / totalPages) * 100);
}

export function computeOverallProgress(books: Pick<Book, 'furthestPage' | 'totalPages' | 'status'>[]): number {
  if (books.length === 0) return 0;
  let total = 0;
  let furthest = 0;
  for (const book of books) {
    if (book.totalPages > 0) {
      total += book.totalPages;
      const effectiveFurthest =
        book.status === 'completed'
          ? book.totalPages
          : Math.max(0, Math.min(book.furthestPage, book.totalPages));
      furthest += effectiveFurthest;
    }
  }
  if (total === 0) return 0;
  return Math.round((furthest / total) * 100);
}

export function formatPageNumber(page: number, totalPages: number): string {
  const digits = Math.max(3, String(Math.max(1, totalPages)).length);
  const paddedCurrent = String(Math.max(0, page)).padStart(digits, '0');
  const paddedTotal = String(Math.max(1, totalPages)).padStart(digits, '0');
  return `PAGE ${paddedCurrent} / ${paddedTotal}`;
}

export function computeSpineWidth(totalPages: number): number {
  const raw = 44 + Math.max(40, totalPages) * 0.14;
  return Math.round(Math.max(60, Math.min(104, raw)));
}

export function hashBookHeight(bookId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < bookId.length; i++) {
    hash ^= bookId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = ((hash >>> 0) % 1000) / 1000;
  return Math.round(295 + normalized * 70); // 295px..365px
}

function parseHexRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b];
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b];
  }
  return [45, 68, 56];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Picks dark graphite (#201F1C) or crisp warm paper (#FAF9F6) for >= 4.5:1 contrast.
 */
export function getContrastTextColor(bgHex: string): string {
  const [r, g, b] = parseHexRgb(bgHex);
  const lumBg = relativeLuminance(r, g, b);
  const lumLight = relativeLuminance(250, 249, 246); // #FAF9F6
  const lumDark = relativeLuminance(32, 31, 28); // #201F1C
  const ratioLight = (Math.max(lumBg, lumLight) + 0.05) / (Math.min(lumBg, lumLight) + 0.05);
  const ratioDark = (Math.max(lumBg, lumDark) + 0.05) / (Math.min(lumBg, lumDark) + 0.05);
  return ratioDark >= ratioLight ? '#201F1C' : '#FAF9F6';
}
