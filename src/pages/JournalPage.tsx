import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { BookOpen, Calendar, Plus, Search, Trash2 } from 'lucide-react';
import { useLibraryStore } from '../store/library';
import { useUiStore } from '../store/ui';
import { PageTransition } from '../components/shell/PageTransition';
import { Panel } from '../components/shell/Panel';
import { Button } from '../components/shell/Button';

export function JournalPage() {
  const books = useLibraryStore((s) => s.books);
  const journal = useLibraryStore((s) => s.journal);
  const removeJournalEntry = useLibraryStore((s) => s.removeJournalEntry);
  const openNoteModal = useUiStore((s) => s.openNoteModal);

  const [bookFilter, setBookFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [search, setSearch] = useState('');

  const bookMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return journal.filter((entry) => {
      if (bookFilter !== 'all' && entry.bookId !== bookFilter) return false;
      if (dateFilter && !entry.createdAt.startsWith(dateFilter)) return false;
      if (q) {
        const bookTitle = bookMap.get(entry.bookId)?.title.toLowerCase() ?? '';
        const haystack = `${entry.content} ${entry.quote ?? ''} ${entry.keywords.join(' ')} ${bookTitle}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [journal, bookFilter, dateFilter, search, bookMap]);

  return (
    <PageTransition>
      <main className="mx-auto max-w-[1440px] px-5 pt-10 pb-20 md:px-8 md:pt-14 lg:px-12">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="editorial-label text-[var(--foreground-secondary)]">
              NOTES & REFLECTIONS
            </p>
            <h1 className="mt-3 font-display text-[clamp(48px,7vw,96px)] font-semibold uppercase leading-[0.94] tracking-[-0.02em] text-[var(--foreground)]">
              READING JOURNAL
            </h1>
          </div>

          <Button
            variant="primary"
            disabled={books.length === 0}
            onClick={() => openNoteModal('choose', 1)}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            ADD ENTRY
          </Button>
        </div>

        {/* Filter Bar */}
        <div className="mt-10 grid grid-cols-1 gap-4 border-b border-[var(--border)] pb-6 md:grid-cols-3">
          <div>
            <label
              htmlFor="journal-search"
              className="editorial-label mb-1.5 inline-flex items-center gap-1.5 text-[var(--foreground-secondary)]"
            >
              <Search className="h-3.5 w-3.5" />
              SEARCH
            </label>
            <input
              id="journal-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes, quotes, or keywords..."
              className="h-11 w-full border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="journal-book-filter"
              className="editorial-label mb-1.5 inline-flex items-center gap-1.5 text-[var(--foreground-secondary)]"
            >
              <BookOpen className="h-3.5 w-3.5" />
              BOOK
            </label>
            <select
              id="journal-book-filter"
              value={bookFilter}
              onChange={(e) => setBookFilter(e.target.value)}
              className="h-11 w-full border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            >
              <option value="all">All books</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="journal-date-filter"
              className="editorial-label mb-1.5 inline-flex items-center gap-1.5 text-[var(--foreground-secondary)]"
            >
              <Calendar className="h-3.5 w-3.5" />
              DATE
            </label>
            <div className="flex gap-2">
              <input
                id="journal-date-filter"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="h-11 flex-1 border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
              />
              {dateFilter && (
                <Button
                  variant="secondary"
                  className="h-11 px-4"
                  onClick={() => setDateFilter('')}
                >
                  CLEAR
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Entries */}
        <div className="mt-10 space-y-6">
          {filteredEntries.length === 0 ? (
            <Panel>
              <p className="font-display text-3xl font-medium text-[var(--foreground)]">
                {journal.length === 0
                  ? 'No journal entries yet.'
                  : 'No entries match your search.'}
              </p>
              <p className="mt-2 text-sm text-[var(--foreground-secondary)]">
                {books.length === 0
                  ? 'Add a book to begin writing notes and capturing highlights.'
                  : 'Highlight a passage while reading or add a reflection above.'}
              </p>
            </Panel>
          ) : (
            filteredEntries.map((entry) => {
              const book = bookMap.get(entry.bookId);
              return (
                <article
                  key={entry.id}
                  className="editorial-card-lift border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-soft)] pb-4">
                    <div className="flex flex-wrap items-center gap-3">
                      {book ? (
                        <Link
                          to={`/books/${book.id}`}
                          className="editorial-link-underline font-display text-2xl font-medium text-[var(--foreground)] hover:text-[var(--accent-hover)] transition-colors"
                        >
                          {book.title}
                        </Link>
                      ) : (
                        <span className="font-display text-2xl font-medium">Book</span>
                      )}
                      <span className="editorial-label text-[var(--foreground-secondary)] tabular-nums">
                        · PAGE {entry.pageNumber}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="editorial-label text-[var(--foreground-secondary)]">
                        {format(new Date(entry.createdAt), 'MMM d, yyyy').toUpperCase()}
                      </span>
                      <button
                        type="button"
                        aria-label={`Delete journal entry from ${book?.title ?? 'book'}`}
                        onClick={() => void removeJournalEntry(entry.id)}
                        className="inline-flex h-9 w-9 items-center justify-center text-[var(--foreground-secondary)] hover:text-[#8B3835] cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {entry.quote && (
                    <blockquote className="mt-5 border-b border-[var(--border-soft)] pb-4 font-prose text-base italic leading-relaxed text-[var(--foreground-secondary)]">
                      &ldquo;{entry.quote}&rdquo;
                    </blockquote>
                  )}

                  <p className="mt-5 max-w-[75ch] font-prose text-[17px] leading-[1.7] text-[var(--foreground)]">
                    {entry.content}
                  </p>

                  {entry.keywords.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-3 text-xs text-[var(--foreground-secondary)]">
                      {entry.keywords.slice(0, 6).map((kw) => (
                        <span key={kw}>#{kw}</span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </main>
    </PageTransition>
  );
}
