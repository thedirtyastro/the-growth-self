# Changes — Reading Integrity Patch

## Summary
Decoupled reading **position** (`position`), **coverage** (`pageStates` across the main-text range), and **completion** (`completionType` + `completedAt`), eliminated `furthestPage` inflation, added active dwell tracking with word-count thresholds, front/back matter range detection, jump detection, finish confirmation prompts, and updated developer contact details.

## Files Created
- `src/lib/domain/reading/constants.ts` — `CFG` thresholds (`POSITION_DWELL_MS`, `SKIM_MS`, `MIN_READ_MS`, `SHORT_READ_MS`, `IDLE_MS`, `JUMP_PAGES`, etc.), `PageState`, `NavSource`, `Visit`, `FinishChoice`, `PromptContext`, `PromptReason`, `ProgressStats`, and `WordCountLookup`.
- `src/lib/domain/reading/dwell.ts` — `minReadMs`, `splitDurationByLocalDay` (midnight boundary splitting for daily active reading time), and `DwellTracker` (settled-page active dwell accumulator pausing on hidden tab and 60s idle).
- `src/lib/domain/reading/progress.ts` — `createInitialProgress`, `resizeProgressArrays`, `creditVisit`, `isJump`, `commitPosition`, `applyContentRange`, `stats`, `deriveStatus`, `overallProgress`, `promptReason`, `applyChoice`, `readAgain`, `findFirstUnreadPage`, `formatSkippedRanges`, `binPageStates`, and `wordCountFromTextItems`.
- `src/lib/domain/reading/range.ts` — `flattenOutline` and `detectContentRange` (PDF outline/text heuristic locating main text start in the first 35% and back matter after 85% for PDFs >= 12 pages).
- `src/lib/domain/reading/migrate.ts` — `migrateLegacy` (v1 -> v2 IndexedDB conversion preserving completed books as `manual`, active positions, and session times while removing `furthestPage`).
- `src/lib/domain/reading/index.ts` — Barrel exports for `src/lib/domain/reading`.
- `src/lib/domain/reading/reading.test.ts` — Unit tests covering all worked scenarios, spread proportional credit, tab hiding, jump rules, midnight splitting, overall progress, and migration.
- `src/components/detail/PageMap.tsx` — 3px binned coverage map across `[contentStart, contentEnd]` showing unread (`--border-soft`), skimmed (`--border-strong`), and read (`--foreground`) pages.
- `src/components/reader/JumpChip.tsx` — Temporary `"Jumped from page X. Go back"` chip for jumps via page field, outline/search, or >= 5 pages.
- `src/components/reader/FinishPrompt.tsx` — Accessible, focus-trapped dialog showing real coverage facts (`readPages`, `contentPages`, `% READ`, active time, skimmed count, skipped ranges) with `I READ IT`, `I SKIMMED IT`, `NOT YET`, `GO TO FIRST UNREAD PAGE`, and `< 60%` weak-coverage confirmation (`MARK FINISHED ANYWAY`).
- `CHANGES.md` — Summary of files modified/created and engineering assumptions.

## Files Modified
- `src/types/models.ts` — Added `CompletionType`, `CompletionRecord`, and `Progress`; removed `furthestPage` from `Book`; added optional `completionType` and `pageWordCounts` on `Book`.
- `src/lib/db.ts` — Upgraded IndexedDB schema to version 2 with a `progress` store (`keyPath: 'bookId'`), transactional `v1 -> v2` migration and backfill, atomic `saveProgressAndBook` / `saveProgressBookAndSessions` (syncing `Book.status` via `deriveStatus` in the same transaction), and cascade delete/clear updates.
- `src/lib/domain/heatmap.ts` — Changed day duration rounding to `Math.round(totalDuration / 60)` and `formatDurationCompact` to round minutes cleanly so >= 30s active reading registers as `1m`.
- `src/lib/domain/status.ts` & `src/lib/domain/domain.test.ts` — Removed `furthestPage` from `computeOverallProgress` and test fixtures.
- `src/lib/pdf/loader.ts` — Added `extractPageWordCount(pdf, pageNumber)`.
- `src/lib/sampleLibrary.ts` — Removed `furthestPage`; added pre-seeded `Progress` records with realistic `read`/`skimmed` distributions and a `COMPLETED · SKIMMED` sample volume (`Essentialism`).
- `src/store/library.ts` — Wired `progressByBook`, `syncPdfMetadata`, `updateBookWordCounts`, `commitVisitAction` (including midnight session splitting), `setContentRange`, `applyFinishChoice`, and `readBookAgain`.
- `src/components/shell/Badge.tsx` — Added `completionType` prop to render `COMPLETED · SKIMMED`.
- `src/components/reader/BookScene.tsx` & `src/components/reader/FlatReader.tsx` — Added `onSettledChange` callbacks so dwell tracking starts only after page-turn animations settle (never mid-drag).
- `src/components/reader/ReaderControls.tsx` — Added click-to-jump page number input (`source='field'`) and forward trigger at `contentEnd` when uncompleted.
- `src/pages/ReaderPage.tsx` — Connected single `DwellTracker`, 1s-throttled activity listeners (`pointerdown`, `keydown`, `wheel`, `touchstart`), `visibilitychange`, 30s + `pagehide` + close commits, word-count caching, first-open `detectContentRange`, `JumpChip`, and `FinishPrompt`.
- `src/components/shelf/BookCaption.tsx` — Updated shelf hover caption to display `% READ` and `COMPLETED · SKIMMED`.
- `src/pages/CollectionPage.tsx` — Updated progress percentages, sorting, and cards to use `Progress`, `stats()`, `deriveStatus()`, `Badge completionType`, and `% READ`.
- `src/pages/ReportPage.tsx` — Updated `OVERALL PROGRESS` and `PROGRESS BY BOOK` to use `overallProgress()`, `stats()`, `deriveStatus()`, `Badge completionType`, and `% READ`.
- `src/pages/BookDetailPage.tsx` — Updated metadata row (`% READ`, `Badge completionType`), added `PageMap`, main-text range editor (`First page of main text`, `Last page of main text`), `MARK AS FINISHED` menu (`I FINISHED IT HERE` / `I READ IT ELSEWHERE`), `FinishPrompt`, and `READ AGAIN`.
- `index.html`, `src/components/shell/Footer.tsx`, `src/components/shell/ProfileDrawer.tsx` — Updated developer contact email to `s.saru7072@gmail.com` and kept the developer block compact and minimal.

## Assumptions Made
1. **Vite + React SPA layout**: Because this application is built on Vite + React Router (`src/...`) rather than Next.js (`app/...`), the pure reading-integrity domain module lives under `src/lib/domain/reading/` and unit tests run with Node's native test runner via `npx tsx --test` (no Vitest dependency installed).
2. **Word-count extraction on demand**: Page word counts (`Book.pageWordCounts`) are computed lazily via `pdf.getPage(n).getTextContent()` as pages are visited and cached onto the `Book` record on commit/unmount rather than scanning entire multi-hundred-page PDFs on open. Uncached or scanned pages fall back to `minReadMs(undefined)` (`20_000` ms).
3. **Sample PDF length reconciliation**: Sample library records preserve realistic book page counts in metadata while generated demo PDF blobs contain up to 12 rendered pages. Opening a sample PDF calls `syncPdfMetadata(bookId, pdf.numPages)` which cleanly resizes `Progress.pageStates` and `dwellMs` and clamps `contentStart`/`contentEnd` to the rendered PDF page count so reader navigation and finish prompts stay consistent.
4. **Active time floor in `TIME READ`**: In `BookDetailPage` and `ReportPage`, active reading time splits across local midnight into `ReadingSession` records and displays `Math.max(sessionSeconds, Math.round(readStats.activeMs / 1000))` so pre-seeded sample `dwellMs` and newly tracked reader sessions stay aligned.
