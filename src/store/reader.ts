import { create } from 'zustand';

interface ReaderState {
  activeBookId: string | null;
  currentPage: number;
  totalPages: number;
  notesOpen: boolean;
  settingsOpen: boolean;
  controlsVisible: boolean;
  areaHighlightMode: boolean;
  webglSupported: boolean;
  webglFailed: boolean;

  initReader: (bookId: string, startPage: number, totalPages: number) => void;
  setPage: (page: number) => void;
  setTotalPages: (total: number) => void;
  setNotesOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setControlsVisible: (visible: boolean) => void;
  setAreaHighlightMode: (active: boolean) => void;
  setWebglFailed: (failed: boolean) => void;
  resetReader: () => void;
}

function detectWebglAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export const useReaderStore = create<ReaderState>((set) => ({
  activeBookId: null,
  currentPage: 1,
  totalPages: 1,
  notesOpen: false,
  settingsOpen: false,
  controlsVisible: true,
  areaHighlightMode: false,
  webglSupported: detectWebglAvailable(),
  webglFailed: false,

  initReader: (bookId, startPage, totalPages) =>
    set({
      activeBookId: bookId,
      currentPage: Math.max(1, startPage),
      totalPages: Math.max(1, totalPages),
      notesOpen: false,
      settingsOpen: false,
      controlsVisible: true,
      areaHighlightMode: false,
      webglFailed: false,
    }),
  setPage: (page) =>
    set((s) => ({
      currentPage: Math.max(1, Math.min(page, Math.max(1, s.totalPages))),
    })),
  setTotalPages: (total) => set({ totalPages: Math.max(1, total) }),
  setNotesOpen: (open) => set({ notesOpen: open, settingsOpen: open ? false : undefined }),
  setSettingsOpen: (open) => set({ settingsOpen: open, notesOpen: open ? false : undefined }),
  setControlsVisible: (visible) => set({ controlsVisible: visible }),
  setAreaHighlightMode: (active) => set({ areaHighlightMode: active }),
  setWebglFailed: (failed) => set({ webglFailed: failed }),
  resetReader: () =>
    set({
      activeBookId: null,
      notesOpen: false,
      settingsOpen: false,
      areaHighlightMode: false,
    }),
}));
