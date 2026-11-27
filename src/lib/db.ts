import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DEFAULT_SETTINGS,
  type Book,
  type Bookmark,
  type Highlight,
  type JournalEntry,
  type ReadingSession,
  type Settings,
} from '../types/models';

interface GrowthShelfDB extends DBSchema {
  books: {
    key: string;
    value: Book;
  };
  pdfs: {
    key: string;
    value: Blob;
  };
  covers: {
    key: string;
    value: string;
  };
  highlights: {
    key: string;
    value: Highlight;
    indexes: {
      'by-bookId': string;
      'by-pageNumber': [string, number];
    };
  };
  sessions: {
    key: string;
    value: ReadingSession;
    indexes: {
      'by-bookId': string;
      'by-date': string;
    };
  };
  journal: {
    key: string;
    value: JournalEntry;
    indexes: {
      'by-bookId': string;
    };
  };
  bookmarks: {
    key: string;
    value: Bookmark;
    indexes: {
      'by-bookId': string;
    };
  };
  settings: {
    key: string;
    value: Settings;
  };
}

const DB_NAME = 'growth-shelf';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GrowthShelfDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<GrowthShelfDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GrowthShelfDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('books')) {
          db.createObjectStore('books', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pdfs')) {
          db.createObjectStore('pdfs');
        }
        if (!db.objectStoreNames.contains('covers')) {
          db.createObjectStore('covers');
        }
        if (!db.objectStoreNames.contains('highlights')) {
          const hlStore = db.createObjectStore('highlights', { keyPath: 'id' });
          hlStore.createIndex('by-bookId', 'bookId');
          hlStore.createIndex('by-pageNumber', ['bookId', 'pageNumber']);
        }
        if (!db.objectStoreNames.contains('sessions')) {
          const sessStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessStore.createIndex('by-bookId', 'bookId');
          sessStore.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('journal')) {
          const jStore = db.createObjectStore('journal', { keyPath: 'id' });
          jStore.createIndex('by-bookId', 'bookId');
        }
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bStore.createIndex('by-bookId', 'bookId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  }
  return dbPromise;
}

export async function loadAllLibraryData() {
  const db = await getDb();
  const [books, highlights, sessions, journal, bookmarks, settings] = await Promise.all([
    db.getAll('books'),
    db.getAll('highlights'),
    db.getAll('sessions'),
    db.getAll('journal'),
    db.getAll('bookmarks'),
    db.get('settings', 'user'),
  ]);

  return {
    books,
    highlights,
    sessions,
    journal,
    bookmarks,
    settings: settings ? { ...DEFAULT_SETTINGS, ...settings } : DEFAULT_SETTINGS,
  };
}

export async function putBook(book: Book): Promise<void> {
  const db = await getDb();
  await db.put('books', book);
}

export async function deleteBookCascade(bookId: string, pdfFileId?: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['books', 'pdfs', 'covers', 'highlights', 'sessions', 'journal', 'bookmarks'],
    'readwrite'
  );
  await tx.objectStore('books').delete(bookId);
  if (pdfFileId) {
    await tx.objectStore('pdfs').delete(pdfFileId);
  }
  await tx.objectStore('covers').delete(bookId);

  const hlKeys = await tx.objectStore('highlights').index('by-bookId').getAllKeys(bookId);
  for (const key of hlKeys) await tx.objectStore('highlights').delete(key);

  const sessKeys = await tx.objectStore('sessions').index('by-bookId').getAllKeys(bookId);
  for (const key of sessKeys) await tx.objectStore('sessions').delete(key);

  const jKeys = await tx.objectStore('journal').index('by-bookId').getAllKeys(bookId);
  for (const key of jKeys) await tx.objectStore('journal').delete(key);

  const bKeys = await tx.objectStore('bookmarks').index('by-bookId').getAllKeys(bookId);
  for (const key of bKeys) await tx.objectStore('bookmarks').delete(key);

  await tx.done;
}

export async function putPdfBlob(pdfFileId: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put('pdfs', blob, pdfFileId);
}

export async function getPdfBlob(pdfFileId: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get('pdfs', pdfFileId);
}

export async function putCoverDataUrl(bookId: string, dataUrl: string): Promise<void> {
  const db = await getDb();
  await db.put('covers', dataUrl, bookId);
}

export async function putHighlight(highlight: Highlight): Promise<void> {
  const db = await getDb();
  await db.put('highlights', highlight);
}

export async function deleteHighlightDb(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('highlights', id);
}

export async function putSession(session: ReadingSession): Promise<void> {
  const db = await getDb();
  await db.put('sessions', session);
}

export async function putJournalEntry(entry: JournalEntry): Promise<void> {
  const db = await getDb();
  await db.put('journal', entry);
}

export async function deleteJournalEntryDb(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('journal', id);
}

export async function putBookmark(bookmark: Bookmark): Promise<void> {
  const db = await getDb();
  await db.put('bookmarks', bookmark);
}

export async function deleteBookmarkDb(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('bookmarks', id);
}

export async function saveSettingsDb(settings: Settings): Promise<void> {
  const db = await getDb();
  await db.put('settings', settings, 'user');
}

export async function clearAllDbData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['books', 'pdfs', 'covers', 'highlights', 'sessions', 'journal', 'bookmarks'],
    'readwrite'
  );
  await Promise.all([
    tx.objectStore('books').clear(),
    tx.objectStore('pdfs').clear(),
    tx.objectStore('covers').clear(),
    tx.objectStore('highlights').clear(),
    tx.objectStore('sessions').clear(),
    tx.objectStore('journal').clear(),
    tx.objectStore('bookmarks').clear(),
  ]);
  await tx.done;
}
