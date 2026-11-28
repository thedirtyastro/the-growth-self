import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Pencil,
  PenLine,
  Plus,
  RotateCcw,
  Tag,
  X,
} from 'lucide-react';
import { useLibraryStore } from '../store/library';
import { useUiStore } from '../store/ui';
import { formatPageNumber } from '../lib/domain/status';
import { formatDurationCompact } from '../lib/domain/heatmap';
import {
  createInitialProgress,
  deriveStatus,
  stats as computeProgressStats,
  type FinishChoice,
} from '../lib/domain/reading';
import { collectLibraryTags, mergeUniqueTags, normalizeTag } from '../lib/domain/tags';
import { PageTransition } from '../components/shell/PageTransition';
import { Badge } from '../components/shell/Badge';
import { Button } from '../components/shell/Button';
import { ProgressLine } from '../components/shell/ProgressLine';
import { BookCover } from '../components/detail/BookCover';
import { PageMap } from '../components/detail/PageMap';
import { EditBookModal } from '../components/detail/EditBookModal';
import { FinishPrompt } from '../components/reader/FinishPrompt';

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const books = useLibraryStore((s) => s.books);
  const progressByBook = useLibraryStore((s) => s.progressByBook);
  const hydrated = useLibraryStore((s) => s.hydrated);
  const highlights = useLibraryStore((s) => s.highlights);
  const journal = useLibraryStore((s) => s.journal);
  const bookmarks = useLibraryStore((s) => s.bookmarks);
  const sessions = useLibraryStore((s) => s.sessions);
  const setBookStatus = useLibraryStore((s) => s.setBookStatus);
  const setContentRange = useLibraryStore((s) => s.setContentRange);
  const applyFinishChoice = useLibraryStore((s) => s.applyFinishChoice);
  const readBookAgain = useLibraryStore((s) => s.readBookAgain);
  const addBookTag = useLibraryStore((s) => s.addBookTag);
  const removeBookTag = useLibraryStore((s) => s.removeBookTag);
  const removeBook = useLibraryStore((s) => s.removeBook);

  const openNoteModal = useUiStore((s) => s.openNoteModal);
  const showBanner = useUiStore((s) => s.showBanner);

  const [editOpen, setEditOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [finishMenuOpen, setFinishMenuOpen] = useState(false);
  const [finishPromptOpen, setFinishPromptOpen] = useState(false);
  const [confirmWeakCoverage, setConfirmWeakCoverage] = useState<number | null>(null);
  const [rangeStartDraft, setRangeStartDraft] = useState('1');
  const [rangeEndDraft, setRangeEndDraft] = useState('1');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const finishMenuRef = useRef<HTMLDivElement>(null);

  const book = books.find((b) => b.id === id);
  const progress = book
    ? progressByBook[book.id] ??
      createInitialProgress(book.id, book.totalPages, book.status, book.completedAt)
    : undefined;

  useEffect(() => {
    if (!progress) return;
    setRangeStartDraft(String(progress.contentStart));
    setRangeEndDraft(String(progress.contentEnd));
    setRangeError(null);
  }, [book?.id, progress?.contentStart, progress?.contentEnd]);

  useEffect(() => {
    if (!finishMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (finishMenuRef.current && !finishMenuRef.current.contains(e.target as Node)) {
        setFinishMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFinishMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [finishMenuOpen]);

  const suggestedTags = useMemo(() => {
    const summary = collectLibraryTags(books);
    const active = new Set((book?.tags ?? []).map((t) => normalizeTag(t).toLowerCase()));
    return mergeUniqueTags([
      ...summary.customTags.map((t) => t.tag),
      'Classic',
      'Must Read',
      'Reference',
    ]).filter((t) => !active.has(t.toLowerCase())).slice(0, 6);
  }, [books, book?.tags]);

  const stats = useMemo(() => {
    if (!book) {
      return { highlights: 0, notes: 0, bookmarks: 0, durationSeconds: 0 };
    }
    return {
      highlights: highlights.filter((h) => h.bookId === book.id).length,
      notes: journal.filter((j) => j.bookId === book.id).length,
      bookmarks: bookmarks.filter((bm) => bm.bookId === book.id).length,
      durationSeconds: sessions
        .filter((s) => s.bookId === book.id)
        .reduce((acc, s) => acc + s.durationSeconds, 0),
    };
  }, [book, highlights, journal, bookmarks, sessions]);

  if (!hydrated) {
    return (
      <PageTransition>
        <main className="mx-auto max-w-[1440px] px-5 py-16 md:px-8 lg:px-12" aria-busy="true" aria-label="Loading book details">
          <div className="h-5 w-32 animate-pulse bg-[var(--surface-secondary)]" />
          <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-24">
            <div className="min-h-[460px] animate-pulse bg-[var(--surface-secondary)]" />
            <div className="space-y-4 pt-4">
              <div className="h-4 w-24 animate-pulse bg-[var(--surface-secondary)]" />
              <div className="h-16 w-3/4 animate-pulse bg-[var(--surface-secondary)]" />
              <div className="h-8 w-1/2 animate-pulse bg-[var(--surface-secondary)]" />
            </div>
          </div>
        </main>
      </PageTransition>
    );
  }

  if (!book || !progress) {
    return (
      <PageTransition>
        <main className="mx-auto max-w-[1440px] px-5 py-16 md:px-8 lg:px-12">
          <Link
            to="/books"
            className="inline-flex h-11 items-center gap-2 editorial-label text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            THE COLLECTION
          </Link>
          <div className="mt-10 border border-[var(--border)] bg-[var(--surface)] p-12">
            <h1 className="font-display text-4xl font-semibold text-[var(--foreground)]">
              Book not found
            </h1>
            <p className="mt-2 text-sm text-[var(--foreground-secondary)]">
              This volume may have been removed from your local shelf.
            </p>
          </div>
        </main>
      </PageTransition>
    );
  }

  const derivedStatus = deriveStatus(progress);
  const readStats = computeProgressStats(progress);
  const displayPage = derivedStatus === 'not-started' ? 0 : progress.position;
  const effectiveSeconds = Math.max(
    stats.durationSeconds,
    Math.round(readStats.activeMs / 1000)
  );

  const primaryActionLabel =
    derivedStatus === 'completed'
      ? 'READ AGAIN'
      : derivedStatus === 'not-started'
        ? 'START READING'
        : 'CONTINUE READING';

  const handlePrimaryRead = async () => {
    if (derivedStatus === 'completed') {
      await readBookAgain(book.id);
    }
    navigate(`/read/${book.id}`);
  };

  const handleFinishChoice = async (choice: FinishChoice) => {
    const outcome = await applyFinishChoice(book.id, choice);
    if (outcome?.needsConfirm) {
      setConfirmWeakCoverage(outcome.coverage ?? null);
      return;
    }
    setFinishPromptOpen(false);
    setConfirmWeakCoverage(null);
    if (choice === 'elsewhere') {
      showBanner(`Marked "${book.title}" finished (read elsewhere).`);
    } else if (choice === 'skimmed') {
      showBanner(`Marked "${book.title}" finished (skimmed).`);
    } else {
      showBanner(`Marked "${book.title}" completed.`);
    }
  };

  const handleSaveRange = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = Math.floor(Number(rangeStartDraft));
    const end = Math.floor(Number(rangeEndDraft));
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 1 ||
      end > book.totalPages ||
      start >= end
    ) {
      setRangeError(
        `Enter valid pages between 1 and ${book.totalPages} with start before end.`
      );
      return;
    }
    setRangeError(null);
    await setContentRange(book.id, start, end, true);
    showBanner(`Updated main-text range to pages ${start}–${end}.`);
  };

  const handleRemove = async () => {
    await removeBook(book.id);
    showBanner(`Removed "${book.title}" from your library.`);
    navigate('/books');
  };

  return (
    <PageTransition>
      <main className="mx-auto max-w-[1440px] px-5 pt-8 pb-20 md:px-8 lg:px-12">
        <Link
          to="/books"
          className="inline-flex h-11 items-center gap-2 editorial-label text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          THE COLLECTION
        </Link>

        {/* Two-column editorial book presentation */}
        <div className="mt-6 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(340px,1fr)_minmax(340px,1.05fr)] lg:gap-24 items-start">
          {/* Left: Cover Stage */}
          <div className="flex min-h-[460px] md:min-h-[540px] items-center justify-center bg-[var(--surface-secondary)] p-8 md:p-12">
            <BookCover book={book} size="detail" />
          </div>

          {/* Right: Editorial Metadata & Actions */}
          <div className="pt-2">
            <Link
              to={`/books?genre=${encodeURIComponent(book.category)}`}
              className="editorial-label inline-block text-[var(--foreground-secondary)] hover:text-[var(--foreground)] underline-offset-4 hover:underline"
            >
              {book.category}
            </Link>

            <h1 className="mt-3 font-display text-[clamp(48px,6.5vw,92px)] font-semibold uppercase leading-[0.95] tracking-[-0.02em] text-[var(--foreground)]">
              {book.title}
            </h1>

            <p className="mt-4 font-display text-[28px] font-medium leading-tight text-[var(--foreground)]">
              {book.author}
            </p>

            {/* Progress Meta Row */}
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link
                to={`/books?status=${derivedStatus}`}
                aria-label={`Filter collection by status ${derivedStatus}`}
                className="inline-flex focus-visible:outline-2 focus-visible:outline-[var(--foreground)] focus-visible:outline-offset-2"
              >
                <Badge status={derivedStatus} completionType={progress.completionType} />
              </Link>
              <span className="editorial-label tabular-nums text-[var(--foreground)]">
                {formatPageNumber(displayPage, book.totalPages)}
              </span>
              <span className="editorial-label tabular-nums text-[var(--foreground-secondary)]">
                {derivedStatus === 'completed' && progress.completedAt
                  ? `${readStats.percent}% READ · COMPLETED ${format(new Date(progress.completedAt), 'MMM d, yyyy').toUpperCase()}`
                  : `${readStats.percent}% READ`}
              </span>
            </div>

            <div className="mt-3 max-w-[560px]">
              <ProgressLine percent={readStats.percent} />
            </div>

            <div className="mt-2 max-w-[560px]">
              <PageMap progress={progress} />
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button variant="primary" onClick={() => void handlePrimaryRead()}>
                <BookOpen className="mr-2 h-3.5 w-3.5" />
                {primaryActionLabel}
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate(`/reports?book=${book.id}`)}
              >
                <BarChart3 className="mr-2 h-3.5 w-3.5" />
                VIEW REPORT
              </Button>
              <Button
                variant="tertiary"
                onClick={() => openNoteModal(book.id, Math.max(1, displayPage || 1))}
              >
                <PenLine className="mr-1.5 h-3.5 w-3.5" />
                ADD NOTE
              </Button>
            </div>

            {/* Synopsis */}
            <div className="mt-7 max-w-[560px]">
              <div className="flex items-center justify-between">
                <h2 className="editorial-label text-[var(--foreground-secondary)]">
                  SYNOPSIS
                </h2>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="inline-flex items-center gap-1.5 editorial-label text-[var(--foreground-secondary)] hover:text-[var(--foreground)] underline underline-offset-4 cursor-pointer transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  EDIT DETAILS
                </button>
              </div>
              {book.synopsis ? (
                <p className="mt-2.5 font-prose text-[16px] leading-[1.65] text-[var(--foreground)]">
                  {book.synopsis}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="mt-2.5 text-sm text-[var(--foreground-secondary)] underline underline-offset-4 hover:text-[var(--foreground)] cursor-pointer"
                >
                  Add a synopsis
                </button>
              )}
            </div>
            {/* Tags Section */}
            <div className="mt-6 max-w-[560px] border-t border-[var(--border-soft)] pt-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="editorial-label inline-flex items-center gap-1.5 text-[var(--foreground-secondary)]">
                  <Tag className="h-3.5 w-3.5" />
                  TAGS
                </h2>
                <span className="editorial-label tabular-nums text-[var(--foreground-secondary)]">
                  {(book.tags ?? []).length} ASSIGNED
                </span>
              </div>

              {(book.tags ?? []).length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2" role="list" aria-label="Book tags">
                  {(book.tags ?? []).map((tag) => (
                    <div
                      key={tag}
                      role="listitem"
                      className="editorial-chip inline-flex items-center border border-[var(--border-strong)] bg-[var(--surface)]"
                    >
                      <Link
                        to={`/books?tag=${encodeURIComponent(tag)}`}
                        aria-label={`Filter collection by tag ${tag}`}
                        className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.11em] text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-colors"
                      >
                        {tag}
                      </Link>
                      <button
                        type="button"
                        onClick={() => void removeBookTag(book.id, tag)}
                        aria-label={`Remove tag ${tag}`}
                        className="inline-flex h-7 w-7 items-center justify-center border-l border-[var(--border)] text-[var(--foreground-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)] cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2.5 text-sm text-[var(--foreground-secondary)]">
                  No tags yet. Add tags below to categorize this book in your collection.
                </p>
              )}

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const clean = normalizeTag(tagDraft);
                  if (!clean) return;
                  await addBookTag(book.id, clean);
                  setTagDraft('');
                }}
                className="mt-3 flex gap-2"
              >
                <label htmlFor="detail-add-tag" className="sr-only">
                  Add tag to book
                </label>
                <input
                  id="detail-add-tag"
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  placeholder="Add tag (e.g. Classic, Must Read)..."
                  className="h-10 flex-1 border border-[var(--border)] bg-[var(--paper)] px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]"
                />
                <button
                  type="submit"
                  disabled={!normalizeTag(tagDraft)}
                  className="inline-flex h-10 items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--foreground)] hover:bg-[var(--surface-secondary)] disabled:opacity-45 cursor-pointer disabled:cursor-default"
                >
                  <Plus className="h-3.5 w-3.5" />
                  ADD TAG
                </button>
              </form>

              {suggestedTags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="editorial-label mr-1 text-[var(--foreground-secondary)]">
                    QUICK ADD:
                  </span>
                  {suggestedTags.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void addBookTag(book.id, s)}
                      aria-label={`Quick add tag ${s}`}
                      className="border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--foreground-secondary)] hover:border-[var(--foreground)] hover:text-[var(--foreground)] cursor-pointer"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Full-Width BOOK DETAILS Strip */}
        <section className="mt-16">
          <h2 className="editorial-label text-[var(--foreground)]">BOOK DETAILS</h2>
          <div className="mt-4 grid grid-cols-2 gap-6 border-t border-[var(--border)] pt-5 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <p className="editorial-label text-[var(--foreground-secondary)]">AUTHOR</p>
              <p className="mt-2 font-display text-[30px] font-medium leading-tight text-[var(--foreground)]">
                {book.author}
              </p>
            </div>
            <div>
              <p className="editorial-label text-[var(--foreground-secondary)]">GENRE</p>
              <Link
                to={`/books?genre=${encodeURIComponent(book.category)}`}
                className="mt-2 inline-block font-display text-[30px] font-medium leading-tight text-[var(--foreground)] hover:text-[var(--accent-hover)] transition-colors"
              >
                {book.category}
              </Link>
            </div>
            <div>
              <p className="editorial-label text-[var(--foreground-secondary)]">PAGES</p>
              <p className="mt-2 font-display text-[30px] font-medium leading-tight text-[var(--foreground)] tabular-nums">
                {book.totalPages}
              </p>
            </div>
            <div>
              <p className="editorial-label text-[var(--foreground-secondary)]">
                FIRST PUBLISHED
              </p>
              <p className="mt-2 font-display text-[30px] font-medium leading-tight text-[var(--foreground)] tabular-nums">
                {book.publishedYear ?? '—'}
              </p>
            </div>
            <div>
              <p className="editorial-label text-[var(--foreground-secondary)]">FILE</p>
              <p className="mt-2 font-display text-[30px] font-medium leading-tight text-[var(--foreground)]">
                {book.pdfFileId ? 'PDF, on this device' : 'Manual entry'}
              </p>
            </div>
          </div>
        </section>

        {/* Full-Width YOUR READING Strip */}
        <section className="mt-12">
          <div className="flex items-center justify-between gap-4">
            <h2 className="editorial-label text-[var(--foreground)]">YOUR READING</h2>
            {book.isSample && (
              <span className="editorial-label text-[var(--foreground-secondary)]">
                SAMPLE DATA
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-6 border-t border-[var(--border)] pt-5 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <p className="editorial-label text-[var(--foreground-secondary)]">
                POSITION
              </p>
              <p className="mt-2 font-display text-[30px] font-medium leading-tight text-[var(--foreground)] tabular-nums">
                {displayPage}
              </p>
            </div>
            <div>
              <p className="editorial-label text-[var(--foreground-secondary)]">
                HIGHLIGHTS
              </p>
              <p className="mt-2 font-display text-[30px] font-medium leading-tight text-[var(--foreground)] tabular-nums">
                {stats.highlights}
              </p>
            </div>
            <div>
              <p className="editorial-label text-[var(--foreground-secondary)]">NOTES</p>
              <p className="mt-2 font-display text-[30px] font-medium leading-tight text-[var(--foreground)] tabular-nums">
                {stats.notes}
              </p>
            </div>
            <div>
              <p className="editorial-label text-[var(--foreground-secondary)]">
                BOOKMARKS
              </p>
              <p className="mt-2 font-display text-[30px] font-medium leading-tight text-[var(--foreground)] tabular-nums">
                {stats.bookmarks}
              </p>
            </div>
            <div>
              <p className="editorial-label text-[var(--foreground-secondary)]">
                TIME READ
              </p>
              <p className="mt-2 font-display text-[30px] font-medium leading-tight text-[var(--foreground)] tabular-nums">
                {effectiveSeconds >= 30
                  ? formatDurationCompact(effectiveSeconds)
                  : '0m'}
              </p>
            </div>
          </div>

          {/* Main-text Content Range Editor */}
          <form
            onSubmit={handleSaveRange}
            className="mt-8 border-t border-[var(--border-soft)] pt-5"
            aria-label="Main text page range"
          >
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label
                  htmlFor="content-range-start"
                  className="editorial-label block text-[var(--foreground-secondary)]"
                >
                  First page of main text
                </label>
                <input
                  id="content-range-start"
                  type="number"
                  min={1}
                  max={book.totalPages}
                  value={rangeStartDraft}
                  onChange={(e) => {
                    setRangeStartDraft(e.target.value);
                    if (rangeError) setRangeError(null);
                  }}
                  className="mt-1.5 h-10 w-28 border border-[var(--border)] bg-[var(--paper)] px-3 text-sm tabular-nums text-[var(--foreground)]"
                />
              </div>

              <div>
                <label
                  htmlFor="content-range-end"
                  className="editorial-label block text-[var(--foreground-secondary)]"
                >
                  Last page of main text
                </label>
                <input
                  id="content-range-end"
                  type="number"
                  min={1}
                  max={book.totalPages}
                  value={rangeEndDraft}
                  onChange={(e) => {
                    setRangeEndDraft(e.target.value);
                    if (rangeError) setRangeError(null);
                  }}
                  className="mt-1.5 h-10 w-28 border border-[var(--border)] bg-[var(--paper)] px-3 text-sm tabular-nums text-[var(--foreground)]"
                />
              </div>

              <Button type="submit" variant="secondary" className="h-10">
                SAVE RANGE
              </Button>

              <p className="editorial-label tabular-nums text-[var(--foreground-secondary)]">
                {readStats.readPages} OF {readStats.contentPages} MAIN-TEXT PAGES READ
                {progress.round > 1 ? ` · ROUND ${progress.round}` : ''}
              </p>
            </div>

            {rangeError && (
              <p role="alert" className="mt-2 text-xs text-[#8B3835]">
                {rangeError}
              </p>
            )}
          </form>
        </section>

        {/* Quiet Book Management Strip */}
        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-soft)] pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="editorial-label text-[var(--foreground-secondary)]">
              STATUS:
            </span>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Set book status">
              {(
                [
                  { id: 'not-started', label: 'NOT STARTED' },
                  { id: 'ongoing', label: 'ONGOING' },
                  { id: 'completed', label: 'COMPLETED' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={derivedStatus === item.id}
                  onClick={() => void setBookStatus(book.id, item.id)}
                  className={`editorial-chip h-9 border px-3 text-[10px] font-medium uppercase tracking-[0.12em] cursor-pointer ${
                    derivedStatus === item.id
                      ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--surface)]'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-secondary)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {derivedStatus !== 'completed' ? (
              <div className="relative" ref={finishMenuRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={finishMenuOpen}
                  onClick={() => setFinishMenuOpen((open) => !open)}
                  className="ml-2 inline-flex h-9 items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--surface)] px-3 editorial-label text-[var(--foreground)] hover:bg-[var(--surface-secondary)] cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  MARK AS FINISHED
                  <ChevronDown className="h-3 w-3" />
                </button>

                {finishMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Mark as finished options"
                    className="absolute left-2 bottom-full mb-2 z-20 min-w-[210px] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setFinishMenuOpen(false);
                        setConfirmWeakCoverage(null);
                        setFinishPromptOpen(true);
                      }}
                      className="flex w-full items-center px-3.5 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.11em] text-[var(--foreground)] hover:bg-[var(--surface-secondary)] cursor-pointer"
                    >
                      I FINISHED IT HERE
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setFinishMenuOpen(false);
                        void handleFinishChoice('elsewhere');
                      }}
                      className="flex w-full items-center px-3.5 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.11em] text-[var(--foreground)] hover:bg-[var(--surface-secondary)] cursor-pointer"
                    >
                      I READ IT ELSEWHERE
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  await readBookAgain(book.id);
                  showBanner(`Started round ${progress.round + 1} for "${book.title}".`);
                }}
                className="ml-2 inline-flex h-9 items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--surface)] px-3 editorial-label text-[var(--foreground)] hover:bg-[var(--surface-secondary)] cursor-pointer transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                READ AGAIN
              </button>
            )}
          </div>

          {!confirmRemove ? (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="editorial-label text-[var(--foreground-secondary)] hover:text-[#8B3835] cursor-pointer"
            >
              REMOVE FROM SHELF
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--foreground-secondary)]">
                Delete book & annotations?
              </span>
              <Button
                variant="primary"
                className="h-9 px-4"
                onClick={() => void handleRemove()}
              >
                CONFIRM REMOVE
              </Button>
              <Button
                variant="tertiary"
                className="h-9"
                onClick={() => setConfirmRemove(false)}
              >
                CANCEL
              </Button>
            </div>
          )}
        </div>

        <EditBookModal
          book={book}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />

        <FinishPrompt
          open={finishPromptOpen}
          bookTitle={book.title}
          progress={progress}
          reason={null}
          confirmWeakCoverage={confirmWeakCoverage}
          onChoose={(choice) => void handleFinishChoice(choice)}
          onGoToUnread={(page) => {
            setFinishPromptOpen(false);
            setConfirmWeakCoverage(null);
            navigate(`/read/${book.id}?page=${page}`);
          }}
          onDismiss={() => {
            setFinishPromptOpen(false);
            setConfirmWeakCoverage(null);
          }}
        />
      </main>
    </PageTransition>
  );
}
