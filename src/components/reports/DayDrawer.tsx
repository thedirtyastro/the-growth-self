import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { X } from 'lucide-react';
import type { Book, Highlight, JournalEntry, ReadingSession } from '../../types/models';
import { mergeDailySessions, formatDurationCompact } from '../../lib/domain/heatmap';

interface DayDrawerProps {
  date: string | null;
  sessions: ReadingSession[];
  books: Book[];
  highlights: Highlight[];
  journal: JournalEntry[];
  onClose: () => void;
}

export function DayDrawer({
  date,
  sessions,
  books,
  highlights,
  journal,
  onClose,
}: DayDrawerProps) {
  useEffect(() => {
    if (!date) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [date, onClose]);

  if (!date) return null;

  const merged = mergeDailySessions(sessions).get(date);
  const bookMap = new Map(books.map((b) => [b.id, b]));
  const dayHighlights = highlights.filter((h) => h.createdAt.startsWith(date));
  const dayJournal = journal.filter((j) => j.createdAt.startsWith(date));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[rgba(32,31,28,0.34)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-[400px] flex-col border-l border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 overflow-y-auto">
        <div className="mb-6 flex items-center justify-between border-b border-[var(--border-soft)] pb-4">
          <div>
            <p className="editorial-label text-[var(--foreground-secondary)]">
              DAILY READING LOG
            </p>
            <h2
              id="day-drawer-title"
              className="mt-1 font-display text-3xl font-semibold text-[var(--foreground)]"
            >
              {format(parseISO(date), 'MMMM d, yyyy')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close day log"
            className="inline-flex h-11 w-11 items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!merged ? (
          <p className="text-sm text-[var(--foreground-secondary)]">
            No reading sessions were recorded on this day.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 border-b border-[var(--border-soft)] pb-5">
              <div>
                <p className="editorial-label text-[var(--foreground-secondary)]">
                  TIME READ
                </p>
                <p className="mt-1 font-display text-3xl font-medium tabular-nums">
                  {formatDurationCompact(merged.durationSeconds)}
                </p>
              </div>
              <div>
                <p className="editorial-label text-[var(--foreground-secondary)]">
                  PAGES READ
                </p>
                <p className="mt-1 font-display text-3xl font-medium tabular-nums">
                  {merged.pagesRead}
                </p>
              </div>
            </div>

            <div>
              <h3 className="editorial-label mb-3 text-[var(--foreground-secondary)]">
                BOOKS READ
              </h3>
              <div className="space-y-3">
                {merged.books.map((item) => {
                  const book = bookMap.get(item.bookId);
                  if (!book) return null;
                  return (
                    <Link
                      key={item.bookId}
                      to={`/books/${book.id}`}
                      onClick={onClose}
                      className="flex items-center justify-between border border-[var(--border-soft)] bg-[var(--background)] p-3 hover:border-[var(--border-strong)] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="h-8 w-6 shrink-0"
                          style={{ backgroundColor: book.coverColor }}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-display text-lg font-medium text-[var(--foreground)]">
                            {book.title}
                          </p>
                          <p className="text-xs text-[var(--foreground-secondary)]">
                            {book.author}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-[var(--foreground-secondary)] tabular-nums shrink-0">
                        {Math.max(1, Math.floor(item.durationSeconds / 60))}m · {item.pagesRead}p
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {(dayHighlights.length > 0 || dayJournal.length > 0) && (
              <div className="border-t border-[var(--border-soft)] pt-5">
                <h3 className="editorial-label mb-3 text-[var(--foreground-secondary)]">
                  ANNOTATIONS CREATED
                </h3>
                <div className="space-y-3">
                  {dayHighlights.map((hl) => (
                    <div
                      key={hl.id}
                      className="border border-[var(--border-soft)] bg-[var(--paper)] p-3 text-xs"
                    >
                      <p className="font-prose text-sm text-[var(--foreground)]">
                        &ldquo;{hl.text}&rdquo;
                      </p>
                      <p className="mt-1 editorial-label text-[var(--foreground-secondary)]">
                        {bookMap.get(hl.bookId)?.title} · PAGE {hl.pageNumber}
                      </p>
                    </div>
                  ))}
                  {dayJournal.map((j) => (
                    <div
                      key={j.id}
                      className="border border-[var(--border-soft)] bg-[var(--paper)] p-3 text-xs"
                    >
                      <p className="text-sm text-[var(--foreground)]">{j.content}</p>
                      <p className="mt-1 editorial-label text-[var(--foreground-secondary)]">
                        {bookMap.get(j.bookId)?.title} · PAGE {j.pageNumber}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
