import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveBookStatus,
  computeBookProgress,
  computeOverallProgress,
  computeSpineWidth,
  hashBookHeight,
  getContrastTextColor,
} from './status';
import { getHeatmapLevel, mergeDailySessions, buildHeatmapGrid, formatDurationCompact } from './heatmap';
import { computeStreaks } from './streaks';
import { extractKeywords, aggregateKeywords } from './keywords';
import {
  createSessionTracker,
  tickSessionTracker,
  changeTrackerPage,
  snapshotSession,
  SESSION_IDLE_TIMEOUT_MS,
  MIN_PAGE_DWELL_MS,
} from './sessions';
import type { Highlight, JournalEntry, ReadingSession } from '../../types/models';

test('deriveBookStatus handles not-started, ongoing, and completed transitions', () => {
  const s1 = deriveBookStatus({
    currentStatus: 'not-started',
    pageOpened: 1,
    totalPages: 200,
    nowIso: '2026-11-25T10:00:00.000Z',
  });
  assert.equal(s1.status, 'not-started');
  assert.equal(s1.startedAt, undefined);

  const s2 = deriveBookStatus({
    currentStatus: 'not-started',
    pageOpened: 2,
    totalPages: 200,
    nowIso: '2026-11-25T10:05:00.000Z',
  });
  assert.equal(s2.status, 'ongoing');
  assert.equal(s2.startedAt, '2026-11-25T10:05:00.000Z');

  const s3 = deriveBookStatus({
    currentStatus: 'ongoing',
    pageOpened: 200,
    totalPages: 200,
    startedAt: '2026-11-25T10:05:00.000Z',
    nowIso: '2026-11-25T12:00:00.000Z',
  });
  assert.equal(s3.status, 'completed');
  assert.equal(s3.completedAt, '2026-11-25T12:00:00.000Z');
});

test('computeBookProgress and computeOverallProgress calculate accurate percentages', () => {
  assert.equal(computeBookProgress(68, 320), 21);
  assert.equal(computeBookProgress(0, 280), 0);
  assert.equal(
    computeOverallProgress([
      { furthestPage: 68, totalPages: 320, status: 'ongoing' },
      { furthestPage: 200, totalPages: 256, status: 'completed' }, // uses 256
      { furthestPage: 0, totalPages: 280, status: 'not-started' },
    ]),
    Math.round(((68 + 256) / (320 + 256 + 280)) * 100)
  );
});

test('spine dimensions and contrast colors stay within spec bounds', () => {
  assert.equal(computeSpineWidth(50), 60);
  assert.equal(computeSpineWidth(1000), 104);
  const h1 = hashBookHeight('book-atomic-habits');
  const h2 = hashBookHeight('book-atomic-habits');
  assert.equal(h1, h2);
  assert.ok(h1 >= 295 && h1 <= 365);
  assert.equal(getContrastTextColor('#2D4438'), '#FAF9F6');
  assert.equal(getContrastTextColor('#DEDAD0'), '#201F1C');
});

test('getHeatmapLevel maps minutes to levels 0..4', () => {
  assert.equal(getHeatmapLevel(0), 0);
  assert.equal(getHeatmapLevel(1), 1);
  assert.equal(getHeatmapLevel(9), 1);
  assert.equal(getHeatmapLevel(10), 2);
  assert.equal(getHeatmapLevel(19), 2);
  assert.equal(getHeatmapLevel(20), 3);
  assert.equal(getHeatmapLevel(39), 3);
  assert.equal(getHeatmapLevel(40), 4);
  assert.equal(getHeatmapLevel(120), 4);
});

test('mergeDailySessions and buildHeatmapGrid aggregate sessions without future days', () => {
  const ref = new Date(2026, 10, 25, 12, 0, 0); // 2026-11-25
  const sessions: ReadingSession[] = [
    {
      id: 's1',
      bookId: 'b1',
      date: '2026-11-25',
      startedAt: '2026-11-25T08:00:00Z',
      endedAt: '2026-11-25T08:15:00Z',
      durationSeconds: 900,
      pagesViewed: [1, 2, 3, 4],
      pagesRead: 4,
    },
    {
      id: 's2',
      bookId: 'b1',
      date: '2026-11-25',
      startedAt: '2026-11-25T20:00:00Z',
      endedAt: '2026-11-25T20:10:00Z',
      durationSeconds: 600,
      pagesViewed: [4, 5, 6],
      pagesRead: 3,
    },
  ];
  const merged = mergeDailySessions(sessions);
  const todayAgg = merged.get('2026-11-25');
  assert.ok(todayAgg);
  assert.equal(todayAgg.minutes, 25);
  assert.equal(todayAgg.pagesRead, 6); // deduplicated pages 1..6
  assert.equal(todayAgg.level, 3);

  const grid = buildHeatmapGrid(sessions, ref);
  assert.equal(grid.cells.length, 52 * 7);
  assert.equal(grid.activeDaysCount, 1);
  const futureCells = grid.cells.filter((c) => c.date > '2026-11-25');
  assert.ok(futureCells.every((c) => c.isFuture));
});

test('computeStreaks preserves streak if yesterday had reading and today does not yet', () => {
  const ref = new Date(2026, 10, 25, 12, 0, 0); // 2026-11-25
  const sessions: ReadingSession[] = [
    {
      id: 's1',
      bookId: 'b1',
      date: '2026-11-22',
      startedAt: '2026-11-22T10:00:00Z',
      endedAt: '2026-11-22T10:10:00Z',
      durationSeconds: 600,
      pagesViewed: [1, 2],
      pagesRead: 2,
    },
    {
      id: 's2',
      bookId: 'b1',
      date: '2026-11-23',
      startedAt: '2026-11-23T10:00:00Z',
      endedAt: '2026-11-23T10:10:00Z',
      durationSeconds: 600,
      pagesViewed: [3, 4],
      pagesRead: 2,
    },
    {
      id: 's3',
      bookId: 'b1',
      date: '2026-11-24',
      startedAt: '2026-11-24T10:00:00Z',
      endedAt: '2026-11-24T10:10:00Z',
      durationSeconds: 600,
      pagesViewed: [5, 6],
      pagesRead: 2,
    },
  ];
  const metrics = computeStreaks(sessions, ref);
  assert.equal(metrics.currentStreak, 3);
  assert.equal(metrics.longestStreak, 3);
  assert.equal(metrics.totalReadingDays, 3);
  assert.equal(formatDurationCompact(metrics.totalReadingSeconds), '30m');
});

test('extractKeywords and aggregateKeywords clean, stem, and rank keywords', () => {
  const words = extractKeywords('Habits and systems build lasting discipline, habits matter!');
  assert.ok(words.includes('habit'));
  assert.ok(words.includes('system'));
  assert.ok(words.includes('discipline'));
  assert.ok(!words.includes('and'));

  const highlights: Highlight[] = [
    {
      id: 'h1',
      bookId: 'b1',
      pageNumber: 10,
      text: 'Discipline and daily habits compound.',
      rects: [],
      color: 'yellow',
      keywords: [],
      createdAt: '2026-11-25T10:00:00Z',
    },
  ];
  const journals: JournalEntry[] = [
    {
      id: 'j1',
      bookId: 'b2',
      pageNumber: 4,
      content: 'Focus and discipline shape character.',
      keywords: [],
      createdAt: '2026-11-25T11:00:00Z',
    },
  ];
  const ranked = aggregateKeywords(highlights, journals);
  assert.equal(ranked[0].word, 'discipline');
  assert.equal(ranked[0].count, 2);
  assert.deepEqual(ranked[0].bookIds.sort(), ['b1', 'b2']);
});

test('session tracker tracks 3s page dwell and pauses after 60s idle', () => {
  let tracker = createSessionTracker('sess-1', 'b1', 1, 1000);
  tracker = tickSessionTracker(tracker, true, 1000 + MIN_PAGE_DWELL_MS + 500); // t=4500
  tracker = changeTrackerPage(tracker, 2, 5000);
  tracker = tickSessionTracker(tracker, true, 5000 + 2000); // only 2s on page 2 -> should NOT count page 2 yet
  let snap = snapshotSession(tracker, 7000);
  assert.deepEqual(snap.pagesViewed, [1]);

  // Wait 60s without activity -> pauses
  tracker = tickSessionTracker(tracker, true, 5000 + SESSION_IDLE_TIMEOUT_MS + 1000);
  assert.equal(tracker.paused, true);
  snap = snapshotSession(tracker, 5000 + SESSION_IDLE_TIMEOUT_MS + 1000);
  assert.ok(snap.durationSeconds < 10);
});

import {
  normalizeTag,
  mergeUniqueTags,
  collectLibraryTags,
  filterBooksByTags,
} from './tags';
import type { Book } from '../../types/models';

test('normalizeTag and mergeUniqueTags clean whitespace, hash prefixes, and case-insensitive duplicates', () => {
  assert.equal(normalizeTag('  #Must   Read  '), 'Must Read');
  assert.equal(normalizeTag('   '), '');
  assert.deepEqual(
    mergeUniqueTags(['Classic', ' classic ', '#Classic', 'Stoicism', '  ', 'stoicism']),
    ['Classic', 'Stoicism']
  );
});

test('collectLibraryTags aggregates genres, custom tags, and status counts accurately', () => {
  const books: Book[] = [
    {
      id: 'b1',
      title: 'Meditations',
      author: 'Marcus Aurelius',
      category: 'Philosophy',
      tags: ['Classic', 'Stoicism'],
      totalPages: 256,
      currentPage: 256,
      furthestPage: 256,
      status: 'completed',
      coverColor: '#4F6373',
      addedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'b2',
      title: 'Atomic Habits',
      author: 'James Clear',
      category: 'Discipline',
      tags: ['Habits', 'Systems'],
      totalPages: 320,
      currentPage: 68,
      furthestPage: 68,
      status: 'ongoing',
      coverColor: '#2D4438',
      addedAt: '2026-11-02T00:00:00Z',
    },
    {
      id: 'b3',
      title: 'Four Thousand Weeks',
      author: 'Oliver Burkeman',
      category: 'philosophy',
      tags: ['classic', 'Time'],
      totalPages: 288,
      currentPage: 0,
      furthestPage: 0,
      status: 'not-started',
      coverColor: '#70543E',
      addedAt: '2026-11-03T00:00:00Z',
    },
  ];

  const summary = collectLibraryTags(books);
  assert.deepEqual(summary.statusCounts, {
    all: 3,
    ongoing: 1,
    completed: 1,
    'not-started': 1,
  });
  assert.equal(summary.genres[0].tag, 'Philosophy');
  assert.equal(summary.genres[0].count, 2);
  assert.equal(summary.customTags[0].tag, 'Classic');
  assert.equal(summary.customTags[0].count, 2);
});

test('filterBooksByTags filters by status, genre, and custom tags in AND and OR modes', () => {
  const books: Book[] = [
    {
      id: 'b1',
      title: 'Meditations',
      author: 'Marcus Aurelius',
      category: 'Philosophy',
      tags: ['Classic', 'Stoicism'],
      totalPages: 256,
      currentPage: 256,
      furthestPage: 256,
      status: 'completed',
      coverColor: '#4F6373',
      addedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'b2',
      title: 'Atomic Habits',
      author: 'James Clear',
      category: 'Discipline',
      tags: ['Habits', 'Systems'],
      totalPages: 320,
      currentPage: 68,
      furthestPage: 68,
      status: 'ongoing',
      coverColor: '#2D4438',
      addedAt: '2026-11-02T00:00:00Z',
    },
    {
      id: 'b3',
      title: 'Four Thousand Weeks',
      author: 'Oliver Burkeman',
      category: 'Philosophy',
      tags: ['Classic', 'Time'],
      totalPages: 288,
      currentPage: 0,
      furthestPage: 0,
      status: 'not-started',
      coverColor: '#70543E',
      addedAt: '2026-11-03T00:00:00Z',
    },
  ];

  assert.deepEqual(
    filterBooksByTags(books, {
      statusFilter: 'all',
      genreTags: ['Philosophy'],
      customTags: ['Stoicism'],
      matchMode: 'and',
    }).map((b) => b.id),
    ['b1']
  );

  assert.deepEqual(
    filterBooksByTags(books, {
      statusFilter: 'all',
      genreTags: ['Philosophy'],
      customTags: ['Habits'],
      matchMode: 'or',
    }).map((b) => b.id),
    ['b1', 'b2', 'b3']
  );

  assert.deepEqual(
    filterBooksByTags(books, {
      statusFilter: 'not-started',
      genreTags: ['philosophy'],
      customTags: ['classic'],
      matchMode: 'and',
    }).map((b) => b.id),
    ['b3']
  );
});

