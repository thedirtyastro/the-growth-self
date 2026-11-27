import type { Book, BookStatus } from '../../types/models';

export const DEFAULT_GENRE_OPTIONS = [
  'Discipline',
  'Philosophy',
  'Focus',
  'Psychology',
  'Productivity',
  'Systems',
  'Mindfulness',
  'Clarity',
  'Science',
  'History',
  'Biography',
  'Essays',
  'Fiction',
  'General',
] as const;

export interface TagCount {
  tag: string;
  count: number;
}

export interface LibraryTagsSummary {
  genres: TagCount[];
  customTags: TagCount[];
  statusCounts: Record<'all' | BookStatus, number>;
}

export interface TagFilterOptions {
  statusFilter: 'all' | BookStatus;
  genreTags: string[];
  customTags: string[];
  matchMode?: 'and' | 'or';
}

export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mergeUniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const clean = normalizeTag(raw);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

export function formatStatusLabel(status: BookStatus): string {
  switch (status) {
    case 'ongoing':
      return 'Ongoing';
    case 'completed':
      return 'Completed';
    case 'not-started':
      return 'Not Started';
  }
}

function addCount(
  map: Map<string, { tag: string; count: number }>,
  rawTag: string
) {
  const clean = normalizeTag(rawTag);
  if (!clean) return;
  const key = clean.toLowerCase();
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    map.set(key, { tag: clean, count: 1 });
  }
}

function sortTagCounts(map: Map<string, { tag: string; count: number }>): TagCount[] {
  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.tag.localeCompare(b.tag);
  });
}

export function collectLibraryTags(books: Book[]): LibraryTagsSummary {
  const genreMap = new Map<string, { tag: string; count: number }>();
  const tagMap = new Map<string, { tag: string; count: number }>();
  const statusCounts: Record<'all' | BookStatus, number> = {
    all: books.length,
    ongoing: 0,
    completed: 0,
    'not-started': 0,
  };

  for (const book of books) {
    statusCounts[book.status] += 1;
    addCount(genreMap, book.category || 'General');
    const uniqueBookTags = mergeUniqueTags(book.tags ?? []);
    for (const tag of uniqueBookTags) {
      addCount(tagMap, tag);
    }
  }

  return {
    genres: sortTagCounts(genreMap),
    customTags: sortTagCounts(tagMap),
    statusCounts,
  };
}

export function filterBooksByTags(
  books: Book[],
  options: TagFilterOptions
): Book[] {
  const { statusFilter, genreTags, customTags, matchMode = 'and' } = options;

  const selectedGenres = mergeUniqueTags(genreTags).map((g) => g.toLowerCase());
  const selectedCustom = mergeUniqueTags(customTags).map((t) => t.toLowerCase());

  return books.filter((book) => {
    if (statusFilter !== 'all' && book.status !== statusFilter) {
      return false;
    }

    if (selectedGenres.length === 0 && selectedCustom.length === 0) {
      return true;
    }

    const bookGenre = normalizeTag(book.category || 'General').toLowerCase();
    const bookTags = mergeUniqueTags(book.tags ?? []).map((t) => t.toLowerCase());

    const matchesAnyGenre = selectedGenres.includes(bookGenre);

    if (matchMode === 'or') {
      const matchesAnyCustom = selectedCustom.some((t) => bookTags.includes(t));
      return matchesAnyGenre || matchesAnyCustom;
    }

    // 'and' mode: book must satisfy selected genre(s) AND all selected custom tags
    if (selectedGenres.length > 0 && !matchesAnyGenre) {
      return false;
    }
    if (selectedCustom.length > 0) {
      const hasAllCustom = selectedCustom.every((t) => bookTags.includes(t));
      if (!hasAllCustom) return false;
    }
    return true;
  });
}
