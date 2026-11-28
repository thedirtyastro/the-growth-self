import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Clock, Flame, TrendingUp } from 'lucide-react';
import type { BookStatus } from '../types/models';
import { useLibraryStore } from '../store/library';
import { computeStreaks } from '../lib/domain/streaks';
import { formatPageNumber } from '../lib/domain/status';
import {
  createInitialProgress,
  deriveStatus,
  overallProgress as computeOverallReadingProgress,
  stats,
} from '../lib/domain/reading';
import { formatDurationCompact } from '../lib/domain/heatmap';
import { aggregateKeywords, type KeywordInsight } from '../lib/domain/keywords';
import { PageTransition } from '../components/shell/PageTransition';
import { Panel } from '../components/shell/Panel';
import { Badge } from '../components/shell/Badge';
import { ProgressLine } from '../components/shell/ProgressLine';
import { Heatmap } from '../components/reports/Heatmap';
import { DayDrawer } from '../components/reports/DayDrawer';
import { KeywordDrawer } from '../components/reports/KeywordDrawer';

type BookTab = 'all' | BookStatus;

export function ReportPage() {
  const books = useLibraryStore((s) => s.books);
  const progressByBook = useLibraryStore((s) => s.progressByBook);
  const sessions = useLibraryStore((s) => s.sessions);
  const highlights = useLibraryStore((s) => s.highlights);
  const journal = useLibraryStore((s) => s.journal);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [selectedKeyword, setSelectedKeyword] = useState<KeywordInsight | null>(null);
  const [bookTab, setBookTab] = useState<BookTab>('all');
  const [bookSort, setBookSort] = useState<'progress' | 'title'>('progress');
  const [keywordView, setKeywordView] = useState<'list' | 'cloud'>('list');

  const currentYear = new Date().getFullYear();
  const hasSampleData = books.some((b) => b.isSample);

  const getProgress = (b: typeof books[number]) =>
    progressByBook[b.id] ?? createInitialProgress(b.id, b.totalPages, b.status, b.completedAt);

  const metrics = useMemo(() => computeStreaks(sessions, new Date()), [sessions]);
  const overallProgress = useMemo(
    () => computeOverallReadingProgress(books.map(getProgress)),
    [books, progressByBook]
  );

  const counts = useMemo(() => {
    let completed = 0;
    let ongoing = 0;
    let notStarted = 0;
    for (const b of books) {
      const st = deriveStatus(getProgress(b));
      if (st === 'completed') completed += 1;
      else if (st === 'ongoing') ongoing += 1;
      else notStarted += 1;
    }
    return { total: books.length, completed, ongoing, notStarted };
  }, [books, progressByBook]);

  const filteredBooks = useMemo(() => {
    const base =
      bookTab === 'all' ? books : books.filter((b) => deriveStatus(getProgress(b)) === bookTab);
    return [...base].sort((a, b) => {
      if (bookSort === 'title') return a.title.localeCompare(b.title);
      const pa = stats(getProgress(a)).percent;
      const pb = stats(getProgress(b)).percent;
      return pb - pa;
    });
  }, [books, progressByBook, bookTab, bookSort]);

  const keywords = useMemo(
    () => aggregateKeywords(highlights, journal).slice(0, 8),
    [highlights, journal]
  );

  const topKeywordCount = keywords[0]?.count ?? 1;

  const pctCompleted = counts.total > 0 ? (counts.completed / counts.total) * 100 : 0;
  const pctOngoing = counts.total > 0 ? (counts.ongoing / counts.total) * 100 : 0;
  const pctNotStarted = counts.total > 0 ? (counts.notStarted / counts.total) * 100 : 100;

  return (
    <PageTransition>
      <main className="mx-auto max-w-[1440px] px-5 pt-10 pb-20 md:px-8 md:pt-14 lg:px-12 space-y-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="editorial-label text-[var(--foreground-secondary)]">
              READING REPORT / {currentYear}
              {hasSampleData ? ' · SAMPLE DATA' : ''}
            </p>
            <h1 className="mt-4 font-display text-[clamp(56px,8vw,112px)] font-semibold uppercase leading-[0.92] tracking-[-0.02em] text-[var(--foreground)]">
              MY PROGRESS
            </h1>
          </div>
          <p className="max-w-[260px] text-[15px] leading-relaxed text-[var(--foreground-secondary)] md:pb-2">
            A record of the pages, ideas, and habits that shaped your year.
          </p>
        </div>

        {/* Summary Panel */}
        <Panel label="SUMMARY">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-[var(--border-soft)]">
            <div className="lg:pr-8">
              <p className="editorial-label inline-flex items-center gap-1.5 text-[var(--foreground-secondary)]">
                <BookOpen className="h-3.5 w-3.5 text-[var(--accent-hover)]" />
                PAGES READ
              </p>
              <p className="mt-3 font-display text-[52px] md:text-[64px] font-semibold leading-none text-[var(--foreground)] tabular-nums">
                {metrics.totalPagesRead.toLocaleString()}
              </p>
              <p className="mt-3 text-xs text-[var(--foreground-secondary)]">
                this year
              </p>
            </div>

            <div className="lg:px-8">
              <p className="editorial-label inline-flex items-center gap-1.5 text-[var(--foreground-secondary)]">
                <Clock className="h-3.5 w-3.5 text-[var(--accent-hover)]" />
                READING TIME
              </p>
              <p className="mt-3 font-display text-[52px] md:text-[64px] font-semibold leading-none text-[var(--foreground)] tabular-nums">
                {metrics.totalReadingSeconds >= 60
                  ? formatDurationCompact(metrics.totalReadingSeconds)
                  : '0m'}
              </p>
              <p className="mt-3 text-xs text-[var(--foreground-secondary)] tabular-nums">
                across {metrics.totalReadingDays}{' '}
                {metrics.totalReadingDays === 1 ? 'day' : 'days'}
              </p>
            </div>

            <div className="lg:px-8">
              <p className="editorial-label inline-flex items-center gap-1.5 text-[var(--foreground-secondary)]">
                <Flame className="h-3.5 w-3.5 text-[var(--accent-hover)]" />
                CURRENT STREAK
              </p>
              <p className="mt-3 font-display text-[52px] md:text-[64px] font-semibold leading-none text-[var(--foreground)] tabular-nums">
                {metrics.currentStreak}{' '}
                {metrics.currentStreak === 1 ? 'day' : 'days'}
              </p>
              <p className="mt-3 text-xs text-[var(--foreground-secondary)] tabular-nums">
                longest: {metrics.longestStreak}{' '}
                {metrics.longestStreak === 1 ? 'day' : 'days'}
              </p>
            </div>

            <div className="lg:pl-8">
              <p className="editorial-label inline-flex items-center gap-1.5 text-[var(--foreground-secondary)]">
                <TrendingUp className="h-3.5 w-3.5 text-[var(--accent-hover)]" />
                OVERALL PROGRESS
              </p>
              <p className="mt-3 font-display text-[52px] md:text-[64px] font-semibold leading-none text-[var(--foreground)] tabular-nums">
                {overallProgress}%
              </p>
              <p className="mt-3 text-xs text-[var(--foreground-secondary)]">
                of your library
              </p>
            </div>
          </div>

          {/* 8px Stacked Library Bar */}
          <div
            className="mt-8 flex h-[8px] w-full overflow-hidden bg-[var(--border-soft)]"
            aria-label="Library status distribution"
          >
            {pctCompleted > 0 && (
              <div
                style={{ width: `${pctCompleted}%`, backgroundColor: 'var(--success-text)' }}
              />
            )}
            {pctOngoing > 0 && (
              <div
                style={{ width: `${pctOngoing}%`, backgroundColor: 'var(--info-text)' }}
              />
            )}
            {pctNotStarted > 0 && (
              <div
                style={{ width: `${pctNotStarted}%`, backgroundColor: 'var(--border)' }}
              />
            )}
          </div>

          {/* Second 4-col strip aligned to top */}
          <div className="mt-6 grid grid-cols-2 gap-6 lg:grid-cols-4 lg:gap-0">
            <div className="lg:pr-8">
              <p className="editorial-label text-[var(--foreground-secondary)]">
                TOTAL BOOKS
              </p>
              <p className="mt-2 font-display text-[36px] font-medium leading-none tabular-nums">
                {counts.total}
              </p>
            </div>

            <div className="lg:px-8">
              <p className="flex items-center gap-2 editorial-label text-[var(--foreground-secondary)]">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 bg-[var(--success-text)]"
                />
                COMPLETED
              </p>
              <p className="mt-2 font-display text-[36px] font-medium leading-none tabular-nums">
                {counts.completed}
              </p>
            </div>

            <div className="lg:px-8">
              <p className="flex items-center gap-2 editorial-label text-[var(--foreground-secondary)]">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 bg-[var(--info-text)]"
                />
                ONGOING
              </p>
              <p className="mt-2 font-display text-[36px] font-medium leading-none tabular-nums">
                {counts.ongoing}
              </p>
            </div>

            <div className="lg:pl-8">
              <p className="flex items-center gap-2 editorial-label text-[var(--foreground-secondary)]">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 bg-[var(--border)]"
                />
                NOT STARTED
              </p>
              <p className="mt-2 font-display text-[36px] font-medium leading-none tabular-nums">
                {counts.notStarted}
              </p>
            </div>
          </div>
        </Panel>

        {/* Heatmap Panel */}
        <Heatmap
          sessions={sessions}
          books={books}
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setDrawerDate(d);
          }}
        />

        {/* Lower 7fr / 5fr Split */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[7fr_5fr] items-start">
          {/* Progress By Book */}
          <Panel
            label="PROGRESS BY BOOK"
            rightSlot={
              <div className="flex flex-wrap items-center gap-4">
                <div role="tablist" className="flex items-center gap-3">
                  {(['all', 'ongoing', 'completed', 'not-started'] as BookTab[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={bookTab === t}
                      onClick={() => setBookTab(t)}
                      className={`h-8 editorial-label border-b whitespace-nowrap cursor-pointer ${
                        bookTab === t
                          ? 'border-[var(--foreground)] text-[var(--foreground)]'
                          : 'border-transparent text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      {t === 'not-started' ? 'NOT STARTED' : t.toUpperCase()}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Sort book progress"
                  value={bookSort}
                  onChange={(e) => setBookSort(e.target.value as 'progress' | 'title')}
                  className="h-8 border border-[var(--border)] bg-transparent px-2 text-[10px] font-medium uppercase tracking-[0.12em]"
                >
                  <option value="progress">PROGRESS</option>
                  <option value="title">TITLE</option>
                </select>
              </div>
            }
          >
            {filteredBooks.length === 0 ? (
              <p className="py-8 text-sm text-[var(--foreground-secondary)]">
                {books.length === 0
                  ? 'Add a book to track your progress.'
                  : 'No books match this status.'}
              </p>
            ) : (
              <div className="divide-y divide-[var(--border-soft)]">
                {filteredBooks.map((book) => {
                  const prog = getProgress(book);
                  const derivedStatus = deriveStatus(prog);
                  const pct = stats(prog).percent;
                  const displayPage = derivedStatus === 'not-started' ? 0 : prog.position;

                  return (
                    <Link
                      key={book.id}
                      to={`/books/${book.id}`}
                      className="group grid grid-cols-[36px_1fr_165px] items-center gap-4 px-2 -mx-2 py-4 hover:bg-[var(--background)]/80 transition-colors duration-150"
                    >
                      <div
                        className="h-12 w-9 overflow-hidden border border-[var(--border-soft)] transition-transform duration-200 group-hover:-translate-y-0.5"
                        style={{ backgroundColor: book.coverColor }}
                      >
                        {book.coverDataUrl && (
                          <img
                            src={book.coverDataUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>

                      <div className="min-w-0 transition-transform duration-150 group-hover:translate-x-0.5">
                        <p className="truncate font-display text-xl font-medium text-[var(--foreground)] group-hover:text-[var(--accent-hover)] transition-colors">
                          {book.title}
                        </p>
                        <p className="truncate text-xs text-[var(--foreground-secondary)]">
                          {book.author}
                        </p>
                        <div className="mt-2">
                          <ProgressLine percent={pct} />
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        <Badge status={derivedStatus} completionType={prog.completionType} />
                        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--foreground-secondary)] tabular-nums">
                          {formatPageNumber(displayPage, book.totalPages)} · {pct}% READ
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Keyword Insights */}
          <Panel
            label="KEYWORD INSIGHTS"
            rightSlot={
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setKeywordView('list')}
                  className={`editorial-label border-b pb-0.5 cursor-pointer ${
                    keywordView === 'list'
                      ? 'border-[var(--foreground)] text-[var(--foreground)]'
                      : 'border-transparent text-[var(--foreground-secondary)]'
                  }`}
                >
                  HIGHLIGHTS
                </button>
                <button
                  type="button"
                  onClick={() => setKeywordView('cloud')}
                  className={`editorial-label border-b pb-0.5 cursor-pointer ${
                    keywordView === 'cloud'
                      ? 'border-[var(--foreground)] text-[var(--foreground)]'
                      : 'border-transparent text-[var(--foreground-secondary)]'
                  }`}
                >
                  CLOUD
                </button>
              </div>
            }
          >
            {keywords.length === 0 ? (
              <p className="py-8 text-sm text-[var(--foreground-secondary)]">
                Highlight passages or write journal notes to see recurring themes.
              </p>
            ) : keywordView === 'list' ? (
              <div className="divide-y divide-[var(--border-soft)]">
                {keywords.map((kw) => {
                  const pct = Math.max(8, Math.round((kw.count / topKeywordCount) * 100));
                  return (
                    <button
                      key={kw.word}
                      type="button"
                      onClick={() => setSelectedKeyword(kw)}
                      className="group grid w-full grid-cols-[1fr_38%_28px] items-center gap-4 px-2 -mx-2 py-3.5 text-left hover:bg-[var(--background)]/80 transition-colors duration-150 cursor-pointer"
                    >
                      <span className="font-display text-[26px] font-medium leading-none text-[var(--foreground)] truncate transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--accent-hover)]">
                        {kw.word}
                      </span>
                      <div className="h-[3px] w-full bg-[var(--border-soft)]">
                        <div
                          className="h-full bg-[var(--foreground)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-right text-sm text-[var(--foreground-secondary)] tabular-nums">
                        {kw.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap items-baseline justify-center gap-x-6 gap-y-4 py-6">
                {keywords.map((kw) => {
                  const ratio = kw.count / Math.max(1, topKeywordCount);
                  const fontSize = Math.round(20 + ratio * 24);
                  return (
                    <button
                      key={kw.word}
                      type="button"
                      onClick={() => setSelectedKeyword(kw)}
                      style={{ fontSize: `${fontSize}px` }}
                      className="font-display font-medium leading-none text-[var(--foreground)] hover:text-[var(--accent-hover)] transition-colors cursor-pointer"
                    >
                      {kw.word}
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <DayDrawer
          date={drawerDate}
          sessions={sessions}
          books={books}
          highlights={highlights}
          journal={journal}
          onClose={() => setDrawerDate(null)}
        />

        <KeywordDrawer
          keyword={selectedKeyword}
          books={books}
          highlights={highlights}
          journal={journal}
          onClose={() => setSelectedKeyword(null)}
        />
      </main>
    </PageTransition>
  );
}
