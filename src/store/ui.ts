import { create } from 'zustand';

export interface OpeningTransitionData {
  bookId: string;
  coverColor: string;
  sourceRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  isFirstOpen: boolean;
}

interface UiState {
  addBookOpen: boolean;
  profileOpen: boolean;
  noteModalBookId: string | null;
  noteModalPage: number;
  noteModalQuote: string;
  openingTransition: OpeningTransitionData | null;
  bannerMessage: string | null;

  openAddBook: () => void;
  closeAddBook: () => void;
  openProfile: () => void;
  closeProfile: () => void;
  openNoteModal: (bookId: string, pageNumber?: number, quote?: string) => void;
  closeNoteModal: () => void;
  setOpeningTransition: (data: OpeningTransitionData | null) => void;
  showBanner: (msg: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  addBookOpen: false,
  profileOpen: false,
  noteModalBookId: null,
  noteModalPage: 1,
  noteModalQuote: '',
  openingTransition: null,
  bannerMessage: null,

  openAddBook: () => set({ addBookOpen: true }),
  closeAddBook: () => set({ addBookOpen: false }),
  openProfile: () => set({ profileOpen: true }),
  closeProfile: () => set({ profileOpen: false }),
  openNoteModal: (bookId, pageNumber = 1, quote = '') =>
    set({
      noteModalBookId: bookId,
      noteModalPage: pageNumber,
      noteModalQuote: quote,
    }),
  closeNoteModal: () =>
    set({
      noteModalBookId: null,
      noteModalPage: 1,
      noteModalQuote: '',
    }),
  setOpeningTransition: (data) => set({ openingTransition: data }),
  showBanner: (msg) => {
    set({ bannerMessage: msg });
    window.setTimeout(() => {
      set((s) => (s.bannerMessage === msg ? { bannerMessage: null } : s));
    }, 3200);
  },
}));
