export type BookStatus = 'not-started' | 'ongoing' | 'completed';

export type HighlightColor = 'yellow' | 'pink' | 'blue' | 'green';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  tags?: string[];
  totalPages: number;
  currentPage: number;
  furthestPage: number;
  status: BookStatus;
  pdfFileId?: string;
  coverDataUrl?: string;
  coverColor: string;
  synopsis?: string;
  publishedYear?: number;
  addedAt: string;
  startedAt?: string;
  completedAt?: string;
  lastReadAt?: string;
  isSample?: boolean;
}

export interface Highlight {
  id: string;
  bookId: string;
  pageNumber: number;
  text: string;
  rects: Rect[];
  color: HighlightColor;
  note?: string;
  keywords: string[];
  createdAt: string;
  isArea?: boolean;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  /** Local date string YYYY-MM-DD */
  date: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  pagesViewed: number[];
  pagesRead: number;
}

export interface JournalEntry {
  id: string;
  bookId: string;
  pageNumber: number;
  quote?: string;
  content: string;
  keywords: string[];
  highlightId?: string;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  bookId: string;
  pageNumber: number;
  label?: string;
  createdAt: string;
}

export type ReaderQuality = 'balanced' | 'high' | 'ultra';
export type ReaderLayout = 'spread' | 'single' | 'auto';
export type ReaderAnimation = 'full' | 'reduced' | 'off';
export type ReaderAppearance = 'white' | 'warm' | 'cream';
export type ReaderZoom = 100 | 125 | 150 | 200;

export interface Settings {
  quality: ReaderQuality;
  layout: ReaderLayout;
  animation: ReaderAnimation;
  appearance: ReaderAppearance;
  sound: boolean;
  textZoom: ReaderZoom;
  metadataLookup: boolean;
  readerEngine: '3d' | 'flat';
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  layout: 'auto',
  animation: 'full',
  appearance: 'warm',
  sound: false,
  textZoom: 100,
  metadataLookup: false,
  readerEngine: '3d',
};

export const SPINE_PALETTE = [
  '#2D4438', // Forest Green
  '#B86B4E', // Terracotta
  '#1E1E1B', // Charcoal Obsidian
  '#4F6373', // Slate Blue
  '#DEDAD0', // Warm Linen
  '#8B3835', // Deep Crimson
  '#3A4D6D', // Indigo Slate
  '#CCA03D', // Ochre Gold
  '#DCD8CD', // Stone Cream
  '#3E4F37', // Moss Olive
  '#70543E', // Umber Leather
  '#1F2D3D', // Midnight Navy
];
