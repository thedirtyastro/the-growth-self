import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FolderOpen, LayoutGrid, Plus, Rows3, Sparkles, Tag, X } from 'lucide-react';
import type { BookStatus } from '../types/models';
import { useLibraryStore } from '../store/library';
import { useUiStore } from '../store/ui';
import { formatPageNumber } from '../lib/domain/status';
import { createInitialProgress, deriveStatus, stats } from '../lib/domain/reading';
import {
  collectLibraryTags,
  filterBooksByTags,
  normalizeTag,
} from '../lib/domain/tags';
import { PageTransition } from '../components/shell/PageTransition';
import { Badge } from '../components/shell/Badge';
import { Button } from '../components/shell/Button';
import { ProgressLine } from '../components/shell/ProgressLine';
import { BookCover } from '../components/detail/BookCover';
import { Shelf } from '../components/shelf/Shelf';

type FilterTab = 'all' | BookStatus;
type SortOption = 'recent' | 'progress' | 'completed' | 'not-started';

function toggleInList(list: string[], value: string): string[] {
  const key = normalizeTag(value).toLowerCase();
  const exists = list.some((item) => normalizeTag(item).toLowerCase() === key);
  if (exists) {
    return list.filter((item) => normalizeTag(item).toLowerCase() !== key);
  }
  return [...list, normalizeTag(value)];
}

function isSelected(list: string[], value: string): boolean {
  const key = normalizeTag(value).toLowerCase();
  return list.some((item) => normalizeTag(item).toLowerCase() === key);
}

export function CollectionPage() {
  const books = useLibraryStore((s) => s.books);
  const progressByBook = useLibraryStore((s) => s.progressByBook);
  const hydrated = useLibraryStore((s) => s.hydrated);
  const loadSampleLibrary = useLibraryStore((s) => s.loadSampleLibrary);
  const openAddBook = useUiStore((s) => s.openAddBook);
  const showBanner = useUiStore((s) => s.showBanner);

  const [searchParams, setSearchParams] = useSearchParams();
  const [sort, setSort] = useState<SortOption>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'shelf'>('grid');

  const rawStatus = searchParams.get('status');
  const filter: FilterTab =
    rawStatus === 'ongoing' || rawStatus === 'completed' || rawStatus === 'not-started'
      ? rawStatus
      : 'all';
  const selectedGenres = useMemo(
    () => searchParams.getAll('genre').map(normalizeTag).filter(Boolean),
    [searchParams]
  );
  const selectedTags = useMemo(
    () => searchParams.getAll('tag').map(normalizeTag).filter(Boolean),
    [searchParams]
  );
  const matchMode: 'and' | 'or' = searchParams.get('match') === 'or' ? 'or' : 'and';

  const updateFilters = (next: {
    status?: FilterTab;
    genres?: string[];
    tags?: string[];
    match?: 'and' | 'or';
  }) => {
    const params = new URLSearchParams();
    const s = next.status ?? filter;
    const g = next.genres ?? selectedGenres;
    const t = next.tags ?? selectedTags;
    const m = next.match ?? matchMode;
    if (s !== 'all') params.set('status', s);
    for (const genre of g) params.append('genre', genre);
    for (const tag of t) params.append('tag', tag);
    if (m === 'or') params.set('match', 'or');
    setSearchParams(params, { replace: true });
  };

  const clearAllFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const tagSummary = useMemo(() => collectLibraryTags(books), [books]);

  const filteredBooks = useMemo(() => {
    const matching = filterBooksByTags(books, {
      statusFilter: filter,
      genreTags: selectedGenres,
      customTags: selectedTags,
      matchMode,
    });

    const getProgress = (bookId: string, totalPages: number, status: BookStatus, completedAt?: string) =>
      progressByBook[bookId] ?? createInitialProgress(bookId, totalPages, status, completedAt);

    return [...matching].sort((a, b) => {
      const pa = getProgress(a.id, a.totalPages, a.status, a.completedAt);
      const pb = getProgress(b.id, b.totalPages, b.status, b.completedAt);
      if (sort === 'progress') {
        return stats(pb).percent - stats(pa).percent;
      }
      if (sort === 'completed') {
        if (a.status === 'completed' && b.status !== 'completed') return -1;
        if (b.status === 'completed' && a.status !== 'completed') return 1;
        return (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
      }
      if (sort === 'not-started') {
        if (a.status === 'not-started' && b.status !== 'not-started') return -1;
        if (b.status === 'not-started' && a.status !== 'not-started') return 1;
        return a.title.localeCompare(b.title);
      }
      return (b.lastReadAt ?? b.addedAt).localeCompare(a.lastReadAt ?? a.addedAt);
    });
  }, [books, progressByBook, filter, selectedGenres, selectedTags, matchMode, sort]);

  const filterTabs: Array<{ id: FilterTab; label: string; count: number }> = [
    { id: 'all', label: 'ALL', count: tagSummary.statusCounts.all },
    { id: 'ongoing', label: 'ONGOING', count: tagSummary.statusCounts.ongoing },
    { id: 'completed', label: 'COMPLETED', count: tagSummary.statusCounts.completed },
    { id: 'not-started', label: 'NOT STARTED', count: tagSummary.statusCounts['not-started'] },
  ];

  const hasActiveFilters =
    filter !== 'all' || selectedGenres.length > 0 || selectedTags.length > 0;
  const multiTagCount = selectedGenres.length + selectedTags.length;

  return (
    <PageTransition>
      <main className="mx-auto max-w-[1440px] px-5 pt-10 pb-20 md:px-8 md:pt-14 lg:px-12">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="editorial-label text-[var(--foreground-secondary)]">
              PERSONAL LIBRARY
            </p>
            <h1 className="mt-3 font-display text-[clamp(48px,7vw,96px)] font-semibold uppercase leading-[0.94] tracking-[-0.02em] text-[var(--foreground)]">
              THE COLLECTION
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="primary" onClick={openAddBook}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              ADD BOOK
            </Button>
          </div>
        </div>

        {/* Status Tabs & Sort Controls */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-3">
          <div role="tablist" aria-label="Filter collection by status" className="flex flex-wrap items-center gap-6">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                onClick={() => updateFilters({ status: tab.id })}
                className={`h-11 editorial-label whitespace-nowrap shrink-0 border-b transition-colors cursor-pointer ${
                  filter === tab.id
                    ? 'border-[var(--foreground)] text-[var(--foreground)]'
                    : 'border-transparent text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                {tab.label}
                {books.length > 0 && (
                  <span className="ml-1.5 tabular-nums opacity-80">({tab.count})</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <label htmlFor="collection-sort" className="sr-only">
              Sort books
            </label>
            <select
              id="collection-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="h-11 border border-[var(--border)] bg-[var(--surface)] px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--foreground)]"
            >
              <option value="recent">SORT: RECENTLY READ</option>
              <option value="progress">SORT: PROGRESS</option>
              <option value="completed">SORT: COMPLETED</option>
              <option value="not-started">SORT: NOT STARTED</option>
            </select>

            <div className="flex border border-[var(--border)] bg-[var(--surface)]">
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
                onClick={() => setViewMode('grid')}
                className={`inline-flex h-11 w-11 items-center justify-center transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-[var(--foreground)] text-[var(--surface)]'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Shelf view"
                aria-pressed={viewMode === 'shelf'}
                onClick={() => setViewMode('shelf')}
                className={`inline-flex h-11 w-11 items-center justify-center transition-colors ${
                  viewMode === 'shelf'
                    ? 'bg-[var(--foreground)] text-[var(--surface)]'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                <Rows3 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Genre & Custom Tag Filter Strip */}
        {books.length > 0 && (tagSummary.genres.length > 0 || tagSummary.customTags.length > 0) && (
          <section
            aria-label="Filter collection by genre and tags"
            className="border-b border-[var(--border)] py-4 space-y-3"
          >
            {tagSummary.genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="editorial-label mr-2 inline-flex min-w-[68px] items-center gap-1.5 text-[var(--foreground-secondary)]">
                  <FolderOpen className="h-3.5 w-3.5" />
                  GENRE
                </span>
                {tagSummary.genres.map(({ tag, count }) => {
                  const active = isSelected(selectedGenres, tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Filter collection by genre ${tag} (${count})`}
                      onClick={() =>
                        updateFilters({ genres: toggleInList(selectedGenres, tag) })
                      }
                      className={`editorial-chip inline-flex h-8 items-center gap-1.5 border px-2.5 text-[10px] font-medium uppercase tracking-[0.11em] cursor-pointer ${
                        active
                          ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--surface)]'
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-secondary)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <span>{tag}</span>
                      <span className="tabular-nums opacity-75">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {tagSummary.customTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="editorial-label mr-2 inline-flex min-w-[68px] items-center gap-1.5 text-[var(--foreground-secondary)]">
                  <Tag className="h-3.5 w-3.5" />
                  TAGS
                </span>
                {tagSummary.customTags.map(({ tag, count }) => {
                  const active = isSelected(selectedTags, tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Filter collection by tag ${tag} (${count})`}
                      onClick={() =>
                        updateFilters({ tags: toggleInList(selectedTags, tag) })
                      }
                      className={`editorial-chip inline-flex h-8 items-center gap-1.5 border px-2.5 text-[10px] font-medium uppercase tracking-[0.11em] cursor-pointer ${
                        active
                          ? 'border-[#8F4A35] bg-[#8F4A35] text-[var(--surface)]'
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-secondary)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <span>{tag}</span>
                      <span className="tabular-nums opacity-75">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {hasActiveFilters && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="editorial-label tabular-nums text-[var(--foreground)]">
                    SHOWING {filteredBooks.length} OF {books.length} BOOKS
                  </span>
                  {selectedGenres.map((g) => (
                    <button
                      key={`active-genre-${g}`}
                      type="button"
                      onClick={() =>
                        updateFilters({ genres: toggleInList(selectedGenres, g) })
                      }
                      aria-label={`Remove genre filter ${g}`}
                      className="inline-flex h-7 items-center gap-1 border border-[var(--foreground)] bg-[var(--surface)] px-2 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--foreground)] cursor-pointer"
                    >
                      GENRE: {g}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                  {selectedTags.map((t) => (
                    <button
                      key={`active-tag-${t}`}
                      type="button"
                      onClick={() =>
                        updateFilters({ tags: toggleInList(selectedTags, t) })
                      }
                      aria-label={`Remove tag filter ${t}`}
                      className="inline-flex h-7 items-center gap-1 border border-[var(--accent)] bg-[var(--surface)] px-2 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--foreground)] cursor-pointer"
                    >
                      TAG: {t}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-4">
                  {multiTagCount >= 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        updateFilters({ match: matchMode === 'and' ? 'or' : 'and' })
                      }
                      className="editorial-label border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[var(--foreground)] hover:bg-[var(--surface-secondary)] cursor-pointer"
                    >
                      MATCH: {matchMode === 'and' ? 'ALL' : 'ANY'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="editorial-label text-[var(--foreground-secondary)] hover:text-[var(--foreground)] underline underline-offset-4 cursor-pointer"
                  >
                    CLEAR FILTERS
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Content */}
        {!hydrated ? (
          <div className="mt-10 grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="aspect-[340/500] w-full animate-pulse bg-[var(--surface-secondary)]" />
                <div className="h-5 w-3/4 animate-pulse bg-[var(--surface-secondary)]" />
              </div>
            ))}
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="mt-16 border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <p className="font-display text-3xl font-medium text-[var(--foreground)]">
              {books.length === 0
                ? 'Your collection is empty.'
                : 'No books match these filters.'}
            </p>
            <p className="mt-2 text-sm text-[var(--foreground-secondary)]">
              {books.length === 0
                ? 'Upload a PDF or add a book manually to begin building your shelf.'
                : 'Try clearing one or more genre, tag, or status filters.'}
            </p>
            {books.length === 0 ? (
              <div className="mt-6 flex flex-wrap justify-center gap-4">
                <Button variant="primary" onClick={openAddBook}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  ADD YOUR FIRST BOOK
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await loadSampleLibrary();
                    showBanner('Sample library loaded for demonstration.');
                  }}
                >
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  LOAD SAMPLE LIBRARY
                </Button>
              </div>
            ) : (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" onClick={clearAllFilters}>
                  CLEAR ALL FILTERS
                </Button>
              </div>
            )}
          </div>
        ) : viewMode === 'shelf' ? (
          <div className="mt-4">
            <Shelf books={filteredBooks} showCaption />
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-8 gap-y-12">
            {filteredBooks.map((book) => {
              const prog =
                progressByBook[book.id] ??
                createInitialProgress(book.id, book.totalPages, book.status, book.completedAt);
              const derivedStatus = deriveStatus(prog);
              const readStats = stats(prog);
              const displayPage = derivedStatus === 'not-started' ? 0 : prog.position;

              return (
                <article key={book.id} className="flex flex-col">
                  <Link
                    to={`/books/${book.id}`}
                    className="group flex flex-col focus-visible:outline-2 focus-visible:outline-[var(--foreground)] focus-visible:outline-offset-4"
                  >
                    <div className="transition-transform duration-200 ease-[var(--ease-standard)] group-hover:-translate-y-1.5">
                      <BookCover book={book} size="card" />
                    </div>
                    <div className="mt-4">
                      <h2 className="font-display text-2xl font-medium leading-tight text-[var(--foreground)] group-hover:text-[var(--accent-hover)] transition-colors duration-150">
                        {book.title}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--foreground-secondary)]">
                        {book.author}
                      </p>
                    </div>
                  </Link>

                  <div className="mt-3 space-y-2.5 flex-1 flex flex-col justify-end">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateFilters({
                            status: filter === derivedStatus ? 'all' : derivedStatus,
                          })
                        }
                        aria-label={`Filter by status ${derivedStatus}`}
                        className="editorial-chip cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--foreground)] focus-visible:outline-offset-2"
                      >
                        <Badge status={derivedStatus} completionType={prog.completionType} />
                      </button>
                      <span className="editorial-label tabular-nums text-[var(--foreground-secondary)]">
                        {formatPageNumber(displayPage, book.totalPages).replace('PAGE ', '')} · {readStats.percent}% READ
                      </span>
                    </div>

                    <ProgressLine percent={readStats.percent} />

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateFilters({
                            genres: toggleInList(selectedGenres, book.category),
                          })
                        }
                        aria-label={`Filter by genre ${book.category}`}
                        className={`editorial-chip border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] cursor-pointer ${
                          isSelected(selectedGenres, book.category)
                            ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--surface)]'
                            : 'border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--foreground)] hover:border-[var(--foreground)]'
                        }`}
                      >
                        {book.category}
                      </button>
                      {(book.tags ?? []).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() =>
                            updateFilters({ tags: toggleInList(selectedTags, tag) })
                          }
                          aria-label={`Filter by tag ${tag}`}
                          className={`editorial-chip border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] cursor-pointer ${
                            isSelected(selectedTags, tag)
                              ? 'border-[#8F4A35] bg-[#8F4A35] text-[var(--surface)]'
                              : 'border-[var(--border-soft)] bg-[var(--surface)] text-[var(--foreground-secondary)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </PageTransition>
  );
}
