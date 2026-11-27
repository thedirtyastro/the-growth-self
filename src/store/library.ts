import { create } from 'zustand';
import type {
  Book,
  BookStatus,
  Bookmark,
  Highlight,
  HighlightColor,
  JournalEntry,
  ReadingSession,
  Rect,
} from '../types/models';
import {
  clearAllDbData,
  deleteBookCascade,
  deleteBookmarkDb,
  deleteHighlightDb,
  deleteJournalEntryDb,
  loadAllLibraryData,
  putBook,
  putBookmark,
  putCoverDataUrl,
  putHighlight,
  putJournalEntry,
  putPdfBlob,
  putSession,
} from '../lib/db';
import { deriveBookStatus } from '../lib/domain/status';
import { extractKeywords } from '../lib/domain/keywords';
import { mergeUniqueTags, normalizeTag } from '../lib/domain/tags';
import { generateSampleLibraryDataset } from '../lib/sampleLibrary';
import { useSettingsStore } from './settings';

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface AddBookPayload {
  title: string;
  author: string;
  category: string;
  tags?: string[];
  status?: BookStatus;
  totalPages: number;
  synopsis?: string;
  publishedYear?: number;
  coverDataUrl?: string;
  coverColor: string;
  pdfBlob?: Blob;
}

interface LibraryState {
  hydrated: boolean;
  hydrating: boolean;
  books: Book[];
  highlights: Highlight[];
  sessions: ReadingSession[];
  journal: JournalEntry[];
  bookmarks: Bookmark[];

  hydrate: () => Promise<void>;
  addBook: (payload: AddBookPayload) => Promise<Book>;
  updateBook: (id: string, patch: Partial<Book>) => Promise<void>;
  removeBook: (id: string) => Promise<void>;
  addBookTag: (bookId: string, rawTag: string) => Promise<void>;
  removeBookTag: (bookId: string, tag: string) => Promise<void>;
  setBookStatus: (bookId: string, status: BookStatus) => Promise<void>;
  recordReadingProgress: (bookId: string, pageOpened: number, actualPdfPages?: number) => Promise<void>;
  markCompleted: (bookId: string) => Promise<void>;
  resetBookProgress: (bookId: string) => Promise<void>;

  addHighlight: (input: {
    bookId: string;
    pageNumber: number;
    text: string;
    rects: Rect[];
    color: HighlightColor;
    note?: string;
    isArea?: boolean;
  }) => Promise<Highlight>;
  updateHighlight: (id: string, patch: Partial<Pick<Highlight, 'color' | 'note'>>) => Promise<void>;
  removeHighlight: (id: string) => Promise<void>;

  toggleBookmark: (bookId: string, pageNumber: number, label?: string) => Promise<boolean>;
  removeBookmark: (id: string) => Promise<void>;

  addJournalEntry: (input: {
    bookId: string;
    pageNumber: number;
    quote?: string;
    content: string;
    highlightId?: string;
  }) => Promise<JournalEntry>;
  removeJournalEntry: (id: string) => Promise<void>;

  upsertSession: (session: ReadingSession) => Promise<void>;
  loadSampleLibrary: () => Promise<void>;
  clearLibrary: () => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  hydrated: false,
  hydrating: false,
  books: [],
  highlights: [],
  sessions: [],
  journal: [],
  bookmarks: [],

  hydrate: async () => {
    if (get().hydrated || get().hydrating) return;
    set({ hydrating: true });
    try {
      const data = await loadAllLibraryData();
      useSettingsStore.getState().setFromDb(data.settings);
      set({
        books: data.books.sort((a, b) => a.addedAt.localeCompare(b.addedAt)),
        highlights: data.highlights,
        sessions: data.sessions,
        journal: data.journal.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        bookmarks: data.bookmarks,
        hydrated: true,
        hydrating: false,
      });
    } catch (err) {
      console.error('Failed to hydrate library from IndexedDB:', err);
      set({ hydrated: true, hydrating: false });
    }
  },

  addBook: async (payload) => {
    const id = createId('book');
    const nowIso = new Date().toISOString();
    let pdfFileId: string | undefined;

    if (payload.pdfBlob) {
      pdfFileId = createId('pdf');
      await putPdfBlob(pdfFileId, payload.pdfBlob);
    }

    if (payload.coverDataUrl) {
      await putCoverDataUrl(id, payload.coverDataUrl);
    }

    const totalPages = Math.max(1, payload.totalPages);
    const initialStatus: BookStatus = payload.status ?? 'not-started';
    const initialCurrentPage =
      initialStatus === 'completed'
        ? totalPages
        : initialStatus === 'ongoing'
          ? Math.min(totalPages, 1)
          : 0;

    const book: Book = {
      id,
      title: payload.title.trim() || 'Untitled Book',
      author: payload.author.trim() || 'Unknown Author',
      category: normalizeTag(payload.category) || 'General',
      tags: mergeUniqueTags(payload.tags ?? []),
      totalPages,
      currentPage: initialCurrentPage,
      furthestPage: initialCurrentPage,
      status: initialStatus,
      pdfFileId,
      coverDataUrl: payload.coverDataUrl,
      coverColor: payload.coverColor,
      synopsis: payload.synopsis?.trim() || undefined,
      publishedYear: payload.publishedYear,
      addedAt: nowIso,
      startedAt: initialStatus !== 'not-started' ? nowIso : undefined,
      completedAt: initialStatus === 'completed' ? nowIso : undefined,
      lastReadAt: initialStatus !== 'not-started' ? nowIso : undefined,
    };

    await putBook(book);
    set((state) => ({ books: [...state.books, book] }));
    return book;
  },

  updateBook: async (id, patch) => {
    const existing = get().books.find((b) => b.id === id);
    if (!existing) return;
    const updated: Book = {
      ...existing,
      ...patch,
      category:
        patch.category !== undefined
          ? normalizeTag(patch.category) || 'General'
          : existing.category,
      tags:
        patch.tags !== undefined
          ? mergeUniqueTags(patch.tags)
          : existing.tags,
    };
    if (patch.coverDataUrl) {
      await putCoverDataUrl(id, patch.coverDataUrl);
    }
    await putBook(updated);
    set((state) => ({
      books: state.books.map((b) => (b.id === id ? updated : b)),
    }));
  },

  addBookTag: async (bookId, rawTag) => {
    const existing = get().books.find((b) => b.id === bookId);
    if (!existing) return;
    const clean = normalizeTag(rawTag);
    if (!clean) return;
    const nextTags = mergeUniqueTags([...(existing.tags ?? []), clean]);
    const updated: Book = { ...existing, tags: nextTags };
    await putBook(updated);
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? updated : b)),
    }));
  },

  removeBookTag: async (bookId, tag) => {
    const existing = get().books.find((b) => b.id === bookId);
    if (!existing) return;
    const target = normalizeTag(tag).toLowerCase();
    const nextTags = (existing.tags ?? []).filter(
      (t) => normalizeTag(t).toLowerCase() !== target
    );
    const updated: Book = { ...existing, tags: nextTags };
    await putBook(updated);
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? updated : b)),
    }));
  },

  setBookStatus: async (bookId, status) => {
    const existing = get().books.find((b) => b.id === bookId);
    if (!existing) return;
    const nowIso = new Date().toISOString();
    let updated: Book;
    if (status === 'completed') {
      updated = {
        ...existing,
        status: 'completed',
        currentPage: existing.totalPages,
        furthestPage: existing.totalPages,
        startedAt: existing.startedAt ?? nowIso,
        completedAt: existing.completedAt ?? nowIso,
        lastReadAt: nowIso,
      };
    } else if (status === 'ongoing') {
      const page =
        existing.currentPage > 0 && existing.currentPage < existing.totalPages
          ? existing.currentPage
          : 1;
      updated = {
        ...existing,
        status: 'ongoing',
        currentPage: page,
        furthestPage: Math.max(page, Math.min(existing.furthestPage, existing.totalPages)),
        startedAt: existing.startedAt ?? nowIso,
        completedAt: undefined,
        lastReadAt: nowIso,
      };
    } else {
      updated = {
        ...existing,
        status: 'not-started',
        currentPage: 0,
        furthestPage: 0,
        startedAt: undefined,
        completedAt: undefined,
      };
    }
    await putBook(updated);
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? updated : b)),
    }));
  },

  removeBook: async (id) => {
    const existing = get().books.find((b) => b.id === id);
    await deleteBookCascade(id, existing?.pdfFileId);
    set((state) => ({
      books: state.books.filter((b) => b.id !== id),
      highlights: state.highlights.filter((h) => h.bookId !== id),
      sessions: state.sessions.filter((s) => s.bookId !== id),
      journal: state.journal.filter((j) => j.bookId !== id),
      bookmarks: state.bookmarks.filter((bm) => bm.bookId !== id),
    }));
  },

  recordReadingProgress: async (bookId, pageOpened, actualPdfPages) => {
    const existing = get().books.find((b) => b.id === bookId);
    if (!existing) return;
    const nowIso = new Date().toISOString();
    const effectiveTotal = Math.max(existing.totalPages, actualPdfPages ?? 0, 1);
    const clampedPage = Math.max(1, Math.min(pageOpened, effectiveTotal));
    const derived = deriveBookStatus({
      currentStatus: existing.status,
      pageOpened: clampedPage,
      totalPages: effectiveTotal,
      startedAt: existing.startedAt,
      completedAt: existing.completedAt,
      nowIso,
    });

    // If user is on page 1 and status is still not-started, keep currentPage at 0 in library metadata
    const nextCurrentPage = derived.status === 'not-started' ? 0 : clampedPage;
    const nextFurthest =
      derived.status === 'completed'
        ? effectiveTotal
        : Math.max(existing.furthestPage, nextCurrentPage);

    const updated: Book = {
      ...existing,
      totalPages: effectiveTotal,
      currentPage: nextCurrentPage,
      furthestPage: nextFurthest,
      status: derived.status,
      startedAt: derived.startedAt,
      completedAt: derived.completedAt,
      lastReadAt: nowIso,
    };

    await putBook(updated);
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? updated : b)),
    }));
  },

  markCompleted: async (bookId) => {
    const existing = get().books.find((b) => b.id === bookId);
    if (!existing) return;
    const nowIso = new Date().toISOString();
    const updated: Book = {
      ...existing,
      status: 'completed',
      currentPage: existing.totalPages,
      furthestPage: existing.totalPages,
      startedAt: existing.startedAt ?? nowIso,
      completedAt: existing.completedAt ?? nowIso,
      lastReadAt: nowIso,
    };
    await putBook(updated);
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? updated : b)),
    }));
  },

  resetBookProgress: async (bookId) => {
    const existing = get().books.find((b) => b.id === bookId);
    if (!existing) return;
    const updated: Book = {
      ...existing,
      status: 'ongoing',
      currentPage: 1,
      startedAt: existing.startedAt ?? new Date().toISOString(),
      completedAt: undefined,
      lastReadAt: new Date().toISOString(),
    };
    await putBook(updated);
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? updated : b)),
    }));
  },

  addHighlight: async (input) => {
    const keywords = extractKeywords(`${input.text} ${input.note ?? ''}`);
    const highlight: Highlight = {
      id: createId('hl'),
      bookId: input.bookId,
      pageNumber: input.pageNumber,
      text: input.text.trim(),
      rects: input.rects,
      color: input.color,
      note: input.note?.trim() || undefined,
      keywords,
      createdAt: new Date().toISOString(),
      isArea: input.isArea,
    };
    await putHighlight(highlight);
    set((state) => ({ highlights: [highlight, ...state.highlights] }));

    if (highlight.note) {
      await get().addJournalEntry({
        bookId: highlight.bookId,
        pageNumber: highlight.pageNumber,
        quote: highlight.text,
        content: highlight.note,
        highlightId: highlight.id,
      });
    }
    return highlight;
  },

  updateHighlight: async (id, patch) => {
    const existing = get().highlights.find((h) => h.id === id);
    if (!existing) return;
    const nextNote = patch.note !== undefined ? patch.note.trim() || undefined : existing.note;
    const updated: Highlight = {
      ...existing,
      color: patch.color ?? existing.color,
      note: nextNote,
      keywords: extractKeywords(`${existing.text} ${nextNote ?? ''}`),
    };
    await putHighlight(updated);
    set((state) => ({
      highlights: state.highlights.map((h) => (h.id === id ? updated : h)),
    }));
  },

  removeHighlight: async (id) => {
    await deleteHighlightDb(id);
    set((state) => ({
      highlights: state.highlights.filter((h) => h.id !== id),
    }));
  },

  toggleBookmark: async (bookId, pageNumber, label) => {
    const existing = get().bookmarks.find(
      (b) => b.bookId === bookId && b.pageNumber === pageNumber
    );
    if (existing) {
      await deleteBookmarkDb(existing.id);
      set((state) => ({
        bookmarks: state.bookmarks.filter((b) => b.id !== existing.id),
      }));
      return false;
    }
    const bookmark: Bookmark = {
      id: createId('bm'),
      bookId,
      pageNumber,
      label: label?.trim() || `Page ${pageNumber}`,
      createdAt: new Date().toISOString(),
    };
    await putBookmark(bookmark);
    set((state) => ({ bookmarks: [bookmark, ...state.bookmarks] }));
    return true;
  },

  removeBookmark: async (id) => {
    await deleteBookmarkDb(id);
    set((state) => ({
      bookmarks: state.bookmarks.filter((b) => b.id !== id),
    }));
  },

  addJournalEntry: async (input) => {
    const entry: JournalEntry = {
      id: createId('jr'),
      bookId: input.bookId,
      pageNumber: input.pageNumber,
      quote: input.quote?.trim() || undefined,
      content: input.content.trim(),
      keywords: extractKeywords(`${input.quote ?? ''} ${input.content}`),
      highlightId: input.highlightId,
      createdAt: new Date().toISOString(),
    };
    await putJournalEntry(entry);
    set((state) => ({
      journal: [entry, ...state.journal],
    }));
    return entry;
  },

  removeJournalEntry: async (id) => {
    await deleteJournalEntryDb(id);
    set((state) => ({
      journal: state.journal.filter((j) => j.id !== id),
    }));
  },

  upsertSession: async (session) => {
    await putSession(session);
    set((state) => {
      const idx = state.sessions.findIndex((s) => s.id === session.id);
      if (idx === -1) {
        return { sessions: [...state.sessions, session] };
      }
      const next = [...state.sessions];
      next[idx] = session;
      return { sessions: next };
    });

    // Ensure book transitions from not-started -> ongoing if session has meaningful time
    if (session.durationSeconds >= 5) {
      const book = get().books.find((b) => b.id === session.bookId);
      if (book && book.status === 'not-started') {
        const derived = deriveBookStatus({
          currentStatus: book.status,
          pageOpened: Math.max(1, book.currentPage),
          totalPages: book.totalPages,
          hasSessionLogged: true,
        });
        const updated: Book = {
          ...book,
          status: derived.status,
          currentPage: Math.max(1, book.currentPage),
          furthestPage: Math.max(1, book.furthestPage),
          startedAt: derived.startedAt,
          lastReadAt: session.endedAt,
        };
        await putBook(updated);
        set((state) => ({
          books: state.books.map((b) => (b.id === book.id ? updated : b)),
        }));
      }
    }
  },

  loadSampleLibrary: async () => {
    const dataset = generateSampleLibraryDataset(new Date());
    await clearAllDbData();
    await Promise.all([
      ...dataset.pdfBlobs.map((item) => putPdfBlob(item.pdfFileId, item.blob)),
      ...dataset.books.map((book) => putBook(book)),
      ...dataset.books
        .filter((b) => b.coverDataUrl)
        .map((b) => putCoverDataUrl(b.id, b.coverDataUrl!)),
      ...dataset.highlights.map((h) => putHighlight(h)),
      ...dataset.journal.map((j) => putJournalEntry(j)),
      ...dataset.bookmarks.map((bm) => putBookmark(bm)),
      ...dataset.sessions.map((s) => putSession(s)),
    ]);

    set({
      books: dataset.books,
      highlights: dataset.highlights,
      journal: dataset.journal.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      bookmarks: dataset.bookmarks,
      sessions: dataset.sessions,
      hydrated: true,
    });
  },

  clearLibrary: async () => {
    await clearAllDbData();
    set({
      books: [],
      highlights: [],
      journal: [],
      bookmarks: [],
      sessions: [],
    });
  },
}));
