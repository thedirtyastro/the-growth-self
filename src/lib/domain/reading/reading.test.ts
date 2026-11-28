import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFG,
  DwellTracker,
  applyChoice,
  applyContentRange,
  binPageStates,
  commitPosition,
  createInitialProgress,
  creditVisit,
  deriveStatus,
  detectContentRange,
  findFirstUnreadPage,
  formatSkippedRanges,
  isJump,
  migrateLegacy,
  minReadMs,
  overallProgress,
  promptReason,
  readAgain,
  splitDurationByLocalDay,
  stats,
  wordCountFromTextItems,
  type PdfRangeReadable,
} from './index';

test('minReadMs clamps between MIN_S and MAX_S and handles missing text layer', () => {
  assert.equal(minReadMs(null), CFG.NO_TEXT_S * 1000);
  assert.equal(minReadMs(undefined), CFG.NO_TEXT_S * 1000);
  assert.equal(minReadMs(0), CFG.MIN_S * 1000);
  assert.equal(minReadMs(10), CFG.MIN_S * 1000);
  assert.equal(minReadMs(250), 25_000);
  assert.equal(minReadMs(900), CFG.MAX_S * 1000);
  assert.equal(minReadMs(120), 12_000);
});

test('1. Peek at the ending: jump to page 200 for 3s leaves position and completion unchanged', () => {
  let p = createInitialProgress('b1', 200);
  p = { ...p, position: 15 };
  const tracker = new DwellTracker(true);
  tracker.show([200], 1000, isJump(15, 200, 'toc'));
  const visit = tracker.commit(4000); // 3s < POSITION_DWELL_MS (5000)

  const words = Array(201).fill(250);
  p = creditVisit(p, visit, words);
  p = commitPosition(p, visit);

  assert.equal(p.position, 15);
  assert.equal(p.pageStates[200], 1); // skimmed (< 25s)
  assert.equal(deriveStatus(p), 'not-started'); // 0.5% viewed < 10%
  assert.equal(p.completionType, undefined);
});

test('2. Read only the ending: jump to 200 and dwell 30s moves position, keeps ongoing, finish requires confirm', () => {
  let p = createInitialProgress('b1', 200);
  p = { ...p, position: 10 };
  const tracker = new DwellTracker(true);
  tracker.show([200], 0, isJump(10, 200, 'field'));
  const visit = tracker.commit(30_000);

  const words = Array(201).fill(250);
  p = creditVisit(p, visit, words);
  p = commitPosition(p, visit);

  assert.equal(p.position, 200);
  assert.equal(p.pageStates[200], 2);
  assert.equal(stats(p).percent, 1);
  assert.equal(deriveStatus(p), 'ongoing');

  const reason = promptReason(p, { onContentEnd: true, leaving: 'close', opening: false });
  assert.equal(reason, 'close-at-end');

  const res = applyChoice(p, 'read', '2026-11-27T10:00:00Z');
  assert.equal(res.needsConfirm, true);
  assert.equal(res.progress.completionType, undefined);
});

test('3. Hold the arrow key: rapid flips < 1s credit nothing', () => {
  let p = createInitialProgress('b1', 200);
  const tracker = new DwellTracker(true);
  const words = Array(201).fill(200);

  for (let pg = 1; pg <= 20; pg++) {
    const ended = tracker.show([pg], pg * 300, false);
    p = creditVisit(p, ended, words);
    p = commitPosition(p, ended);
  }
  const finalEnded = tracker.commit(20 * 300 + 250);
  p = creditVisit(p, finalEnded, words);
  p = commitPosition(p, finalEnded);

  const s = stats(p);
  assert.equal(s.readPages, 0);
  assert.equal(s.skimmedPages, 0);
  assert.equal(s.percent, 0);
  assert.equal(deriveStatus(p), 'not-started');
  assert.equal(p.position, 1);
});

test('4. Skim 40 pages of 300 for 1.5s each: 0% READ, status ongoing via ONGOING_VIEWED', () => {
  let p = createInitialProgress('b1', 300);
  const words = Array(301).fill(250);

  for (let pg = 1; pg <= 40; pg++) {
    p = creditVisit(
      p,
      { pages: [pg], activeMs: 1500, totalVisitMs: 1500, settledAt: pg * 2000, jumped: false },
      words
    );
  }

  const s = stats(p);
  assert.equal(s.readPages, 0);
  assert.equal(s.skimmedPages, 40);
  assert.equal(s.percent, 0);
  assert.ok(s.viewedRatio >= CFG.ONGOING_VIEWED);
  assert.equal(deriveStatus(p), 'ongoing');
});

test('5. Rough go-through: skimmed completion produces skimmed completionType; weak read needs confirmation', () => {
  let p = createInitialProgress('b1', 100);
  const words = Array(101).fill(250); // minReadMs = 25s
  for (let pg = 1; pg <= 90; pg++) {
    const ms = pg <= 40 ? 26_000 : 3_000;
    p = creditVisit(
      p,
      { pages: [pg], activeMs: ms, totalVisitMs: ms, settledAt: pg * 30_000, jumped: false },
      words
    );
  }

  const s = stats(p);
  assert.equal(s.percent, 40); // < 60% WEAK_COVERAGE
  const tryRead = applyChoice(p, 'read', '2026-11-27T12:00:00Z');
  assert.equal(tryRead.needsConfirm, true);

  const skimmed = applyChoice(p, 'skimmed', '2026-11-27T12:01:00Z');
  assert.equal(skimmed.progress.completionType, 'skimmed');
  assert.equal(deriveStatus(skimmed.progress), 'completed');

  const anyway = applyChoice(p, 'anyway', '2026-11-27T12:02:00Z');
  assert.equal(anyway.progress.completionType, 'read');
  assert.equal(deriveStatus(anyway.progress), 'completed');
});

test('6. Honest read: >=90% coverage triggers prompt on end/open and completes cleanly as read', () => {
  let p = createInitialProgress('b1', 20);
  const words = Array(21).fill(100); // minReadMs = 10s
  for (let pg = 1; pg <= 18; pg++) {
    p = creditVisit(
      p,
      { pages: [pg], activeMs: 11_000, totalVisitMs: 11_000, settledAt: pg * 15_000, jumped: false },
      words
    );
  }

  assert.equal(stats(p).percent, 90);
  assert.equal(promptReason(p, { onContentEnd: false, leaving: null, opening: true }), 'catch-up');

  const notYet = applyChoice(p, 'notyet', '2026-11-27T10:00:00Z');
  assert.equal(notYet.progress.promptDismissedAt, 0.9);
  assert.equal(promptReason(notYet.progress, { onContentEnd: false, leaving: null, opening: true }), null);

  // Reading one more page (+5% coverage) re-enables prompt
  const p19 = creditVisit(
    notYet.progress,
    { pages: [19], activeMs: 11_000, totalVisitMs: 11_000, settledAt: 300_000, jumped: false },
    words
  );
  assert.equal(promptReason(p19, { onContentEnd: false, leaving: null, opening: true }), 'catch-up');

  const done = applyChoice(p19, 'read', '2026-11-27T10:05:00Z');
  assert.equal(done.progress.completionType, 'read');
  assert.equal(done.progress.completions.length, 1);
  assert.equal(deriveStatus(done.progress), 'completed');
});

test('7. Walk away & hidden tab: idle cuts off at 90s and hidden tab adds zero active time', () => {
  const tracker = new DwellTracker(true);
  tracker.show([5], 0, false);

  // Walk away for 10 minutes with no input -> caps at 90_000ms
  const vIdle = tracker.commit(600_000);
  assert.ok(vIdle);
  assert.equal(vIdle.activeMs, CFG.IDLE_MS);

  // Hide tab at t=600_000, keep hidden until 900_000 -> adds 0ms
  tracker.setVisible(false, 600_000);
  tracker.input(700_000);
  const vHidden = tracker.commit(900_000);
  assert.equal(vHidden, null);

  // Resume visibility at 900_000 and read 10s
  tracker.setVisible(true, 900_000);
  const vBack = tracker.commit(910_000);
  assert.ok(vBack);
  assert.equal(vBack.activeMs, 10_000);
});

test('8. Back matter & content range detection excludes front/back matter from coverage', async () => {
  const mockPdf: PdfRangeReadable = {
    numPages: 200,
    async getOutline() {
      return [
        { title: 'Copyright', dest: [0] },
        { title: 'Chapter 1: Foundations', dest: [4] }, // 1-based page 5
        { title: 'Chapter 10: Conclusion', dest: [169] }, // page 170
        { title: 'Notes & References', dest: [179] }, // page 180 (> 0.85 * 200 = 170)
        { title: 'Index', dest: [190] },
      ];
    },
    async getDestination() {
      return null;
    },
    async getPageIndex(ref) {
      return Number(ref);
    },
  };

  const range = await detectContentRange(mockPdf);
  assert.deepEqual(range, { start: 5, end: 179 });

  const noBackMatterPdf: PdfRangeReadable = {
    numPages: 100,
    async getOutline() {
      return [
        { title: 'Prologue', dest: [2] }, // page 3
        { title: 'Epilogue', dest: [94] },
      ];
    },
    async getDestination() {
      return null;
    },
    async getPageIndex(ref) {
      return Number(ref);
    },
  };
  assert.deepEqual(await detectContentRange(noBackMatterPdf), { start: 3, end: 100 });
});

test('9. Re-read: readAgain increments round, preserves completions history, resets pages', () => {
  let p = createInitialProgress('b1', 10);
  const words = Array(11).fill(100);
  p = applyContentRange(p, 2, 9, true);
  for (let pg = 2; pg <= 9; pg++) {
    p = creditVisit(
      p,
      { pages: [pg], activeMs: 12_000, totalVisitMs: 12_000, settledAt: pg * 15_000, jumped: false },
      words
    );
  }
  const finished = applyChoice(p, 'read', '2026-11-20T10:00:00Z').progress;
  assert.equal(finished.completions.length, 1);

  const r2 = readAgain(finished);
  assert.equal(r2.round, 2);
  assert.equal(r2.position, 2); // contentStart
  assert.equal(r2.completionType, undefined);
  assert.equal(r2.completedAt, undefined);
  assert.equal(r2.completions.length, 1);
  assert.equal(stats(r2).readPages, 0);
  assert.equal(deriveStatus(r2), 'not-started');
});

test('10. Across midnight: splits active duration cleanly between local calendar days', () => {
  const end = new Date(2026, 10, 26, 0, 15, 0, 0).getTime(); // Nov 26 00:15 local
  const activeMs = 20 * 60_000; // 20 mins: 5 mins on Nov 25, 15 mins on Nov 26
  const slices = splitDurationByLocalDay(end, activeMs);
  assert.equal(slices.length, 2);
  assert.equal(slices[0].date, '2026-11-25');
  assert.equal(slices[0].activeMs, 5 * 60_000);
  assert.equal(slices[1].date, '2026-11-26');
  assert.equal(slices[1].activeMs, 15 * 60_000);
});

test('11. Legacy migration handles completed and ongoing books without faking 100% read', () => {
  const migratedDone = migrateLegacy(
    {
      id: 'b-done',
      status: 'completed',
      totalPages: 256,
      currentPage: 256,
      furthestPage: 256,
      completedAt: '2026-11-01T12:00:00Z',
    },
    [{ bookId: 'b-done', startPage: 1, endPage: 20, durationMinutes: 15 }],
    256
  );
  assert.equal(migratedDone.completionType, 'manual');
  assert.equal(migratedDone.round, 1);
  assert.equal(migratedDone.completions.length, 1);
  assert.equal(stats(migratedDone).readPages, 0);
  assert.equal(deriveStatus(migratedDone), 'completed');

  const migratedOngoing = migrateLegacy(
    {
      id: 'b-on',
      status: 'ongoing',
      totalPages: 320,
      currentPage: 68,
      furthestPage: 68,
    },
    [{ bookId: 'b-on', startPage: 1, endPage: 4, durationMinutes: 4 }],
    320
  );
  assert.equal(migratedOngoing.position, 68);
  assert.equal(migratedOngoing.completionType, undefined);
  assert.ok(migratedOngoing.dwellMs[1] > 0);
  assert.equal(migratedOngoing.pageStates[68], 0);
});

test('Extra: spread crediting splits time proportionally by expected reading time', () => {
  let p = createInitialProgress('b-spread', 10);
  // Page 1 has 100 words (10s min), Page 2 has 200 words (20s min) -> 1:2 split
  const words = [null, 100, 200];
  p = creditVisit(
    p,
    { pages: [1, 2], activeMs: 30_000, totalVisitMs: 30_000, settledAt: 0, jumped: false },
    words
  );
  assert.equal(p.dwellMs[1], 10_000);
  assert.equal(p.dwellMs[2], 20_000);
  assert.equal(p.pageStates[1], 2);
  assert.equal(p.pageStates[2], 2);
});

test('Extra: isJump, overallProgress, elsewhere choice, and helper selectors', () => {
  assert.equal(isJump(10, 12, 'turn'), false);
  assert.equal(isJump(10, 25, 'turn'), true);
  assert.equal(isJump(10, 11, 'toc'), true);
  assert.equal(isJump(10, 12, 'field'), true);
  assert.equal(isJump(10, 12, 'scrub'), true);

  let p1 = createInitialProgress('b1', 10);
  let p2 = createInitialProgress('b2', 10);
  const words = Array(11).fill(100);
  for (let pg = 1; pg <= 5; pg++) {
    p1 = creditVisit(p1, { pages: [pg], activeMs: 12_000, totalVisitMs: 12_000, settledAt: 0, jumped: false }, words);
  }
  const elsewhere = applyChoice(p2, 'elsewhere', '2026-11-27T00:00:00Z');
  assert.equal(elsewhere.progress.completionType, 'manual');
  assert.equal(overallProgress([p1, elsewhere.progress]), 25); // 5 / 20 = 25%

  assert.equal(findFirstUnreadPage(p1), 6);
  assert.equal(formatSkippedRanges(p1), 'Pages 6–10 unread');
  assert.equal(binPageStates(p1, 300).length, 10);
  assert.equal(wordCountFromTextItems([{ str: '   ' }]), null);
  assert.equal(wordCountFromTextItems([{ str: 'Hello world' }, { str: 'foo bar baz' }]), 5);
});
