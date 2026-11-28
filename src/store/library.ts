import { create } from 'zustand';
import type {
  Book,
  BookStatus,
  Bookmark,
  Highlight,
  HighlightColor,
  JournalEntry,
  Progress,
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
  putProgress,
  putSession,
  saveProgressAndBook,
  saveProgressBookAndSessions,
} from '../lib/db';
import {
  applyChoice,
  applyContentRange,
  commitPosition,
  createInitialProgress,
  creditVisit,
  deriveStatus,
  readAgain,
  resizeProgressArrays,
  splitDurationByLocalDay,
  type FinishChoice,
  type FinishOutcome,
  type Visit,
  type WordCountLookup,
} from '../lib/domain/reading';
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
  progressByBook: Record<string, Progress>;
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

  syncPdfMetadata: (
    bookId: string,
    actualPdfPages: number,
    pageWordCounts?: (number | null)[]
  ) => Promise<Progress | undefined>;
  updateBookWordCounts: (bookId: string, pageWordCounts: (number | null)[]) => Promise<void>;
  commitVisitAction: (
    bookId: string,
    visit: Visit | null,
    wordsLookup: WordCountLookup,
    endMs?: number
  ) => Promise<Progress | undefined>;
  setContentRange: (
    bookId: string,
    start: number,
    end: number,
    rangeDetected?: boolean
  ) => Promise<Progress | undefined>;
  applyFinishChoice: (bookId: string, choice: FinishChoice) => Promise<FinishOutcome | undefined>;
  readBookAgain: (bookId: string) => Promise<Progress | undefined>;

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

function getOrCreateProgress(
  state: LibraryState,
  book: Book
): Progress {
  return (
    state.progressByBook[book.id] ??
    createInitialProgress(book.id, book.totalPages, book.status, book.completedAt)
  );
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  hydrated: false,
  hydrating: false,
  books: [],
  progressByBook: {},
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
      const progressByBook: Record<string, Progress> = {};
      for (const p of data.progressList) {
        progressByBook[p.bookId] = p;
      }
      set({
        books: data.books.sort((a, b) => a.addedAt.localeCompare(b.addedAt)),
        progressByBook,
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
    const progress = createInitialProgress(id, totalPages, initialStatus, nowIso);
    const derived = deriveStatus(progress);

    const book: Book = {
      id,
      title: payload.title.trim() || 'Untitled Book',
      author: payload.author.trim() || 'Unknown Author',
      category: normalizeTag(payload.category) || 'General',
      tags: mergeUniqueTags(payload.tags ?? []),
      totalPages,
      currentPage: derived === 'not-started' ? 0 : progress.position,
      status: derived,
      completionType: progress.completionType,
      pdfFileId,
      coverDataUrl: payload.coverDataUrl,
      coverColor: payload.coverColor,
      synopsis: payload.synopsis?.trim() || undefined,
      publishedYear: payload.publishedYear,
      addedAt: nowIso,
      startedAt: derived !== 'not-started' ? nowIso : undefined,
      completedAt: progress.completedAt,
      lastReadAt: derived !== 'not-started' ? nowIso : undefined,
    };

    const synced = await saveProgressAndBook(progress, book);
    set((state) => ({
      books: [...state.books, synced],
      progressByBook: { ...state.progressByBook, [id]: progress },
    }));
    return synced;
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
    const currentProgress = getOrCreateProgress(get(), existing);

    let nextProgress: Progress;
    if (status === 'completed') {
      nextProgress = applyChoice(currentProgress, 'elsewhere', nowIso).progress;
    } else if (status === 'not-started') {
      nextProgress = createInitialProgress(bookId, existing.totalPages, 'not-started', nowIso);
    } else {
      nextProgress = {
        ...currentProgress,
        completionType: undefined,
        completedAt: undefined,
      };
    }

    const derived = status === 'ongoing' ? 'ongoing' : deriveStatus(nextProgress);
    const bookToSave: Book = {
      ...existing,
      status: derived,
      currentPage: derived === 'not-started' ? 0 : nextProgress.position,
      completionType: nextProgress.completionType,
      completedAt: nextProgress.completedAt,
      startedAt: derived === 'not-started' ? undefined : existing.startedAt ?? nowIso,
      lastReadAt: derived === 'not-started' ? existing.lastReadAt : nowIso,
    };

    const tx = await (await import('../lib/db')).getDb();
    const idbTx = tx.transaction(['progress', 'books'], 'readwrite');
    await idbTx.objectStore('progress').put(nextProgress);
    await idbTx.objectStore('books').put(bookToSave);
    await idbTx.done;

    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? bookToSave : b)),
      progressByBook: { ...state.progressByBook, [bookId]: nextProgress },
    }));
  },

  removeBook: async (id) => {
    const existing = get().books.find((b) => b.id === id);
    await deleteBookCascade(id, existing?.pdfFileId);
    set((state) => {
      const nextProgressMap = { ...state.progressByBook };
      delete nextProgressMap[id];
      return {
        books: state.books.filter((b) => b.id !== id),
        progressByBook: nextProgressMap,
        highlights: state.highlights.filter((h) => h.bookId !== id),
        sessions: state.sessions.filter((s) => s.bookId !== id),
        journal: state.journal.filter((j) => j.bookId !== id),
        bookmarks: state.bookmarks.filter((bm) => bm.bookId !== id),
      };
    });
  },

  syncPdfMetadata: async (bookId, actualPdfPages, pageWordCounts) => {
    const existing = get().books.find((b) => b.id === bookId);
    if (!existing) return undefined;
    const currentProgress = getOrCreateProgress(get(), existing);
    const safeTotal = Math.max(1, actualPdfPages);
    const resized = resizeProgressArrays(currentProgress, safeTotal);

    const updatedBook: Book = {
      ...existing,
      totalPages: safeTotal,
      pageWordCounts: pageWordCounts ?? existing.pageWordCounts,
    };
    const syncedBook = await saveProgressAndBook(resized, updatedBook);
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? syncedBook : b)),
      progressByBook: { ...state.progressByBook, [bookId]: resized },
    }));
    return resized;
  },

  updateBookWordCounts: async (bookId, pageWordCounts) => {
    const existing = get().books.find((b) => b.id === bookId);
    if (!existing) return;
    const updated: Book = { ...existing, pageWordCounts };
    await putBook(updated);
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? updated : b)),
    }));
  },

  commitVisitAction: async (bookId, visit, wordsLookup, endMs = Date.now()) => {
    const existing = get().books.find((b) => b.id === bookId);
    if (!existing || !visit || visit.activeMs <= 0) {
      return existing ? getOrCreateProgress(get(), existing) : undefined;
    }

    const currentProgress = getOrCreateProgress(get(), existing);
    let nextProgress = creditVisit(currentProgress, visit, wordsLookup);
    nextProgress = commitPosition(nextProgress, visit);

    const nowIso = new Date(endMs).toISOString();
    const derived = deriveStatus(nextProgress);

    // Split active reading time across midnight into local calendar day records
    const slices = splitDurationByLocalDay(endMs, visit.activeMs);
    const existingSessions = get().sessions;
    const sessionsToPersist: ReadingSession[] = [];

    for (const slice of slices) {
      const sessionId = `day-${bookId}-${slice.date}`;
      const prior =
        sessionsToPersist.find((s) => s.id === sessionId) ??
        existingSessions.find((s) => s.id === sessionId);

      const creditedPages = visit.activeMs >= 1000 ? visit.pages : [];
      const mergedPages = Array.from(
        new Set([...(prior?.pagesViewed ?? []), ...creditedPages])
      ).sort((a, b) => a - b);

      const updatedSession: ReadingSession = {
        id: sessionId,
        bookId,
        date: slice.date,
        startedAt: prior?.startedAt ?? slice.startedAt,
        endedAt: slice.endedAt,
        durationSeconds: (prior?.durationSeconds ?? 0) + slice.activeMs / 1000,
        pagesViewed: mergedPages,
        pagesRead: mergedPages.length,
      };
      sessionsToPersist.push(updatedSession);
    }

    const updatedBook: Book = {
      ...existing,
      startedAt:
        derived !== 'not-started' ? existing.startedAt ?? nowIso : existing.startedAt,
      lastReadAt: visit.activeMs >= 1000 ? nowIso : existing.lastReadAt,
    };

    const syncedBook = await saveProgressBookAndSessions(
      nextProgress,
      updatedBook,
      sessionsToPersist
    );

    set((state) => {
      const nextSessionMap = new Map(state.sessions.map((s) => [s.id, s]));
      for (const s of sessionsToPersist) {
        nextSessionMap.set(s.id, s);
      }
      return {
        books: state.books.map((b) => (b.id === bookId ? syncedBook : b)),
        progressByBook: { ...state.progressByBook, [bookId]: nextProgress },
        sessions: Array.from(nextSessionMap.values()),
      };
    });

    return nextProgress;
  },

  setContentRange: async (bookId, start, end, rangeDetected = true) => {
    const existing = get().books.find((b) => b.id === bookId);
    if (!existing) return undefined;
    const currentProgress = getOrCreateProgress(get(), existing);
    const nextProgress = applyContentRange(currentProgress, start, end, rangeDetected);
    const syncedBook = await saveProgressAndBook(nextProgress, existing);
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? syncedBook : b)),
      progressByBook: { ...state.progressByBook, [bookId]: nextProgress },
    }));
    return nextProgress;
  },

  applyFinishChoice: async (bookId, choice) => {
    const existing = get().books.find((b) => b.id === bookId);
    if (!existing) return undefined;
    const currentProgress = getOrCreateProgress(get(), existing);
    const nowIso = new Date().toISOString();
    const outcome = applyChoice(currentProgress, choice, nowIso);

    if (outcome.needsConfirm) {
      return outcome;
    }

    const bookUpdate: Book = {
      ...existing,
      startedAt: existing.startedAt ?? nowIso,
      lastReadAt: nowIso,
    };
    const syncedBook = await saveProgressAndBook(outcome.progress, bookUpdate);
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? syncedBook : b)),
      progressByBook: { ...state.progressByBook, [bookId]: outcome.progress },
    }));
    return outcome;
  },

  readBookAgain: async (bookId) => {
    const existing = get().books.find((b) => b.id === bookId);
    if (!existing) return undefined;
    const currentProgress = getOrCreateProgress(get(), existing);
    const nextProgress = readAgain(currentProgress);
    const syncedBook = await saveProgressAndBook(nextProgress, {
      ...existing,
      lastReadAt: new Date().toISOString(),
    });
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? syncedBook : b)),
      progressByBook: { ...state.progressByBook, [bookId]: nextProgress },
    }));
    return nextProgress;
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
  },

  loadSampleLibrary: async () => {
    const dataset = generateSampleLibraryDataset(new Date());
    await clearAllDbData();
    await Promise.all([
      ...dataset.pdfBlobs.map((item) => putPdfBlob(item.pdfFileId, item.blob)),
      ...dataset.books.map((book) => putBook(book)),
      ...dataset.progressList.map((p) => putProgress(p)),
      ...dataset.books
        .filter((b) => b.coverDataUrl)
        .map((b) => putCoverDataUrl(b.id, b.coverDataUrl!)),
      ...dataset.highlights.map((h) => putHighlight(h)),
      ...dataset.journal.map((j) => putJournalEntry(j)),
      ...dataset.bookmarks.map((bm) => putBookmark(bm)),
      ...dataset.sessions.map((s) => putSession(s)),
    ]);

    const progressByBook: Record<string, Progress> = {};
    for (const p of dataset.progressList) {
      progressByBook[p.bookId] = p;
    }

    set({
      books: dataset.books,
      progressByBook,
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
      progressByBook: {},
      highlights: [],
      journal: [],
      bookmarks: [],
      sessions: [],
    });
  },
}));
