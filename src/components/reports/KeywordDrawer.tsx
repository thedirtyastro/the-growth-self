import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import type { Book, Highlight, HighlightColor, JournalEntry } from '../../types/models';
import type { KeywordInsight } from '../../lib/domain/keywords';

interface KeywordDrawerProps {
  keyword: KeywordInsight | null;
  books: Book[];
  highlights: Highlight[];
  journal: JournalEntry[];
  onClose: () => void;
}

const COLOR_HEX: Record<HighlightColor, string> = {
  yellow: 'var(--hl-yellow)',
  pink: 'var(--hl-pink)',
  blue: 'var(--hl-blue)',
  green: 'var(--hl-green)',
};

export function KeywordDrawer({
  keyword,
  books,
  highlights,
  journal,
  onClose,
}: KeywordDrawerProps) {
  const [bookFilter, setBookFilter] = useState<string>('all');
  const [colorFilter, setColorFilter] = useState<'all' | HighlightColor>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  useEffect(() => {
    setBookFilter('all');
    setColorFilter('all');
    setDateFilter('');
  }, [keyword?.word]);

  useEffect(() => {
    if (!keyword) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyword, onClose]);

  const bookMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const matchingHighlights = useMemo(() => {
    if (!keyword) return [];
    const idSet = new Set(keyword.highlightIds);
    return highlights.filter((h) => {
      if (!idSet.has(h.id)) return false;
      if (bookFilter !== 'all' && h.bookId !== bookFilter) return false;
      if (colorFilter !== 'all' && h.color !== colorFilter) return false;
      if (dateFilter && !h.createdAt.startsWith(dateFilter)) return false;
      return true;
    });
  }, [keyword, highlights, bookFilter, colorFilter, dateFilter]);

  const matchingJournal = useMemo(() => {
    if (!keyword) return [];
    if (colorFilter !== 'all') return [];
    const idSet = new Set(keyword.journalIds);
    return journal.filter((j) => {
      if (!idSet.has(j.id)) return false;
      if (bookFilter !== 'all' && j.bookId !== bookFilter) return false;
      if (dateFilter && !j.createdAt.startsWith(dateFilter)) return false;
      return true;
    });
  }, [keyword, journal, bookFilter, colorFilter, dateFilter]);

  if (!keyword) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[rgba(32,31,28,0.34)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyword-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-[440px] flex-col border-l border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 overflow-y-auto">
        <div className="mb-6 flex items-center justify-between border-b border-[var(--border-soft)] pb-4">
          <div>
            <p className="editorial-label text-[var(--foreground-secondary)]">
              KEYWORD INSIGHT · {keyword.count} {keyword.count === 1 ? 'MATCH' : 'MATCHES'}
            </p>
            <h2
              id="keyword-drawer-title"
              className="mt-1 font-display text-4xl font-medium text-[var(--foreground)]"
            >
              {keyword.word}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyword drawer"
            className="inline-flex h-11 w-11 items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-3 border-b border-[var(--border-soft)] pb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="kw-book-filter"
                className="editorial-label mb-1 block text-[var(--foreground-secondary)]"
              >
                BOOK
              </label>
              <select
                id="kw-book-filter"
                value={bookFilter}
                onChange={(e) => setBookFilter(e.target.value)}
                className="h-10 w-full border border-[var(--border)] bg-[var(--paper)] px-2 text-xs"
              >
                <option value="all">All books</option>
                {keyword.bookIds.map((bid) => (
                  <option key={bid} value={bid}>
                    {bookMap.get(bid)?.title ?? bid}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="kw-date-filter"
                className="editorial-label mb-1 block text-[var(--foreground-secondary)]"
              >
                DATE
              </label>
              <input
                id="kw-date-filter"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="h-10 w-full border border-[var(--border)] bg-[var(--paper)] px-2 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="editorial-label mr-1 text-[var(--foreground-secondary)]">
              COLOR:
            </span>
            <button
              type="button"
              onClick={() => setColorFilter('all')}
              className={`px-2 py-1 text-[10px] uppercase tracking-[0.12em] border ${
                colorFilter === 'all'
                  ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--surface)]'
                  : 'border-[var(--border)] text-[var(--foreground-secondary)]'
              }`}
            >
              All
            </button>
            {(['yellow', 'pink', 'blue', 'green'] as HighlightColor[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Filter ${c} highlights`}
                onClick={() => setColorFilter(c)}
                className={`h-6 w-6 rounded-full border ${
                  colorFilter === c
                    ? 'ring-2 ring-[var(--foreground)] ring-offset-1'
                    : 'border-[var(--border-strong)]'
                }`}
                style={{ backgroundColor: COLOR_HEX[c] }}
              />
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {matchingHighlights.length === 0 && matchingJournal.length === 0 ? (
            <p className="text-sm text-[var(--foreground-secondary)]">
              No annotations match the selected filters.
            </p>
          ) : (
            <>
              {matchingHighlights.map((hl) => {
                const book = bookMap.get(hl.bookId);
                return (
                  <div
                    key={hl.id}
                    className="border border-[var(--border-soft)] bg-[var(--paper)] p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="editorial-label text-[var(--foreground-secondary)]">
                        {book?.title ?? 'Book'} · PAGE {hl.pageNumber}
                      </span>
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: COLOR_HEX[hl.color] }}
                      />
                    </div>
                    <p className="font-prose text-sm leading-relaxed text-[var(--foreground)]">
                      &ldquo;{hl.text}&rdquo;
                    </p>
                    {hl.note && (
                      <p className="mt-2 text-xs text-[var(--foreground-secondary)]">
                        {hl.note}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--foreground-secondary)]">
                      <span>{format(new Date(hl.createdAt), 'MMM d, yyyy')}</span>
                      {book && (
                        <Link
                          to={`/read/${book.id}?page=${hl.pageNumber}`}
                          onClick={onClose}
                          className="underline underline-offset-4 hover:text-[var(--foreground)]"
                        >
                          OPEN PAGE
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}

              {matchingJournal.map((j) => {
                const book = bookMap.get(j.bookId);
                return (
                  <div
                    key={j.id}
                    className="border border-[var(--border-soft)] bg-[var(--background)] p-4"
                  >
                    <p className="editorial-label text-[var(--foreground-secondary)]">
                      JOURNAL · {book?.title ?? 'Book'} · PAGE {j.pageNumber}
                    </p>
                    {j.quote && (
                      <p className="mt-2 font-prose text-xs italic text-[var(--foreground-secondary)]">
                        &ldquo;{j.quote}&rdquo;
                      </p>
                    )}
                    <p className="mt-2 text-sm text-[var(--foreground)]">{j.content}</p>
                    <p className="mt-2 text-[11px] text-[var(--foreground-secondary)]">
                      {format(new Date(j.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
