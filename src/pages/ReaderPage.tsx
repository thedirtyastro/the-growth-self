import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Highlight, HighlightColor, Progress, Rect } from '../types/models';
import { getPdfBlob } from '../lib/db';
import { extractPageWordCount, openPdfDocument } from '../lib/pdf/loader';
import { PdfRenderQueue } from '../lib/pdf/renderQueue';
import {
  CFG,
  DwellTracker,
  applyContentRange,
  createInitialProgress,
  detectContentRange,
  isJump,
  promptReason,
  type FinishChoice,
  type NavSource,
  type PromptReason,
} from '../lib/domain/reading';
import { playPageTurnSound } from '../lib/audio';
import { useLibraryStore } from '../store/library';
import { useSettingsStore } from '../store/settings';
import { useReaderStore } from '../store/reader';
import { useUiStore } from '../store/ui';
import { ProgressLine } from '../components/shell/ProgressLine';
import { Button } from '../components/shell/Button';
import { FlatReader } from '../components/reader/FlatReader';
import { ReaderControls } from '../components/reader/ReaderControls';
import { SelectionToolbar } from '../components/reader/SelectionToolbar';
import { NotesPanel } from '../components/reader/NotesPanel';
import { SettingsPanel } from '../components/reader/SettingsPanel';
import { JumpChip } from '../components/reader/JumpChip';
import { FinishPrompt } from '../components/reader/FinishPrompt';

const LazyBookScene = lazy(() =>
  import('../components/reader/BookScene').then((m) => ({ default: m.BookScene }))
);

interface ActiveSelectionState {
  pageNumber: number;
  text: string;
  rects: Rect[];
  anchorRect: DOMRect;
  highlightId?: string;
  color?: HighlightColor;
  isArea?: boolean;
}

export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const books = useLibraryStore((s) => s.books);
  const progressByBook = useLibraryStore((s) => s.progressByBook);
  const hydrated = useLibraryStore((s) => s.hydrated);
  const highlights = useLibraryStore((s) => s.highlights);
  const bookmarks = useLibraryStore((s) => s.bookmarks);
  const journal = useLibraryStore((s) => s.journal);

  const syncPdfMetadata = useLibraryStore((s) => s.syncPdfMetadata);
  const updateBookWordCounts = useLibraryStore((s) => s.updateBookWordCounts);
  const commitVisitAction = useLibraryStore((s) => s.commitVisitAction);
  const setContentRange = useLibraryStore((s) => s.setContentRange);
  const applyFinishChoice = useLibraryStore((s) => s.applyFinishChoice);
  const addHighlight = useLibraryStore((s) => s.addHighlight);
  const updateHighlight = useLibraryStore((s) => s.updateHighlight);
  const removeHighlight = useLibraryStore((s) => s.removeHighlight);
  const toggleBookmark = useLibraryStore((s) => s.toggleBookmark);
  const removeBook = useLibraryStore((s) => s.removeBook);

  const settings = useSettingsStore((s) => s.settings);
  const showBanner = useUiStore((s) => s.showBanner);

  const {
    currentPage,
    totalPages,
    notesOpen,
    settingsOpen,
    controlsVisible,
    areaHighlightMode,
    webglSupported,
    webglFailed,
    initReader,
    setPage,
    setTotalPages,
    setNotesOpen,
    setSettingsOpen,
    setControlsVisible,
    setAreaHighlightMode,
    setWebglFailed,
    resetReader,
  } = useReaderStore();

  const book = books.find((b) => b.id === id);
  const progress: Progress | undefined = book
    ? progressByBook[book.id] ??
      createInitialProgress(book.id, book.totalPages, book.status, book.completedAt)
    : undefined;

  const [loadingPdf, setLoadingPdf] = useState(true);
  const [loadProgress, setLoadProgress] = useState(12);
  const [slowLoadHint, setSlowLoadHint] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [renderQueue, setRenderQueue] = useState<PdfRenderQueue | null>(null);
  const [hasTextLayer, setHasTextLayer] = useState(true);
  const [selection, setSelection] = useState<ActiveSelectionState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [closing3d, setClosing3d] = useState(false);
  const [isSettled, setIsSettled] = useState(true);
  const [jumpFromPage, setJumpFromPage] = useState<number | null>(null);
  const [finishPromptState, setFinishPromptState] = useState<{
    open: boolean;
    reason: PromptReason;
    confirmWeakCoverage: number | null;
    pendingClose: boolean;
  }>({
    open: false,
    reason: null,
    confirmWeakCoverage: null,
    pendingClose: false,
  });

  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const queueRef = useRef<PdfRenderQueue | null>(null);
  const dwellTrackerRef = useRef<DwellTracker | null>(null);
  const wordCountsRef = useRef<(number | null)[]>([]);
  const wordCountsDirtyRef = useRef(false);
  const pendingJumpRef = useRef(false);
  const jumpChipTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const lastInputSentRef = useRef(0);
  const finishPromptOpenRef = useRef(false);
  finishPromptOpenRef.current = finishPromptState.open;

  // Responsive layout resolution
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isSpread =
    settings.layout === 'spread'
      ? true
      : settings.layout === 'single'
        ? false
        : viewportWidth >= 900;

  const use3dEngine =
    settings.readerEngine === '3d' &&
    isSpread &&
    webglSupported &&
    !webglFailed;

  const visiblePages = useMemo(() => {
    if (totalPages < 1) return [1];
    if (!isSpread) return [Math.max(1, Math.min(currentPage, totalPages))];
    const left = currentPage % 2 === 0 ? Math.max(1, currentPage - 1) : currentPage;
    const right = left + 1 <= totalPages ? left + 1 : null;
    return right ? [left, right] : [left];
  }, [currentPage, totalPages, isSpread]);

  const clearJumpChip = useCallback(() => {
    if (jumpChipTimerRef.current) {
      clearTimeout(jumpChipTimerRef.current);
      jumpChipTimerRef.current = null;
    }
    setJumpFromPage(null);
  }, []);

  const showJumpChip = useCallback(
    (fromPage: number) => {
      if (jumpChipTimerRef.current) clearTimeout(jumpChipTimerRef.current);
      setJumpFromPage(fromPage);
      jumpChipTimerRef.current = window.setTimeout(() => {
        setJumpFromPage(null);
        jumpChipTimerRef.current = null;
      }, CFG.UNDO_CHIP_MS);
    },
    []
  );

  // Helper to commit active dwell safely
  const commitCurrentDwell = useCallback(
    async (now = Date.now()): Promise<Progress | undefined> => {
      if (!book) return undefined;
      const tracker = dwellTrackerRef.current;
      if (!tracker) return useLibraryStore.getState().progressByBook[book.id];
      const visit = tracker.commit(now);
      if (visit && visit.activeMs > 0) {
        return commitVisitAction(book.id, visit, wordCountsRef.current, now);
      }
      return useLibraryStore.getState().progressByBook[book.id];
    },
    [book, commitVisitAction]
  );

  // Lazy word-count extraction for visible pages + caching onto Book
  const ensureWordCountsForPages = useCallback(
    async (pdf: PDFDocumentProxy, pages: number[]) => {
      let updated = false;
      for (const pg of pages) {
        if (pg >= 1 && pg <= pdf.numPages && wordCountsRef.current[pg] === undefined) {
          const count = await extractPageWordCount(pdf, pg);
          wordCountsRef.current[pg] = count;
          updated = true;
        }
      }
      if (updated) {
        wordCountsDirtyRef.current = true;
      }
    },
    []
  );

  // Initialize reader page state, open PDF, detect content range, and check catch-up prompt
  useEffect(() => {
    if (!hydrated) return;
    if (!book) {
      setLoadingPdf(false);
      setLoadError(true);
      return;
    }

    const storeProgress = useLibraryStore.getState().progressByBook[book.id];
    const resumePage = storeProgress?.position ?? Math.max(1, book.currentPage || 1);
    const queryPage = Number(searchParams.get('page'));
    const hasQueryPage = Number.isFinite(queryPage) && queryPage >= 1;
    const startPage = hasQueryPage
      ? Math.min(queryPage, book.totalPages)
      : Math.max(1, resumePage);

    initReader(book.id, startPage, book.totalPages);
    wordCountsRef.current = book.pageWordCounts ? [...book.pageWordCounts] : [];
    wordCountsDirtyRef.current = false;

    let cancelled = false;
    setLoadingPdf(true);
    setLoadError(false);
    setSlowLoadHint(false);
    setLoadProgress(15);
    setIsSettled(true);
    clearJumpChip();

    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setSlowLoadHint(true);
    }, 3000);

    const load = async () => {
      try {
        if (!book.pdfFileId) {
          throw new Error('No PDF file attached to this book');
        }
        const blob = await getPdfBlob(book.pdfFileId);
        if (!blob) {
          throw new Error('PDF blob missing from IndexedDB');
        }
        if (cancelled) return;
        setLoadProgress(45);

        const pdf = await openPdfDocument(blob, (loaded, total) => {
          if (total > 0 && !cancelled) {
            setLoadProgress(Math.min(95, 45 + Math.round((loaded / total) * 50)));
          }
        });

        if (cancelled) {
          await pdf.cleanup();
          return;
        }

        pdfDocRef.current = pdf;
        const actualTotal = Math.max(1, pdf.numPages);
        const clampedStart = Math.max(1, Math.min(startPage, actualTotal));

        let syncedProgress = await syncPdfMetadata(book.id, actualTotal);
        if (!syncedProgress) {
          syncedProgress = createInitialProgress(book.id, actualTotal, book.status, book.completedAt);
        }

        // First-open content range detection (front/back matter)
        if (!syncedProgress.rangeDetected) {
          const detected = await detectContentRange(pdf);
          if (!cancelled) {
            const updated = await setContentRange(book.id, detected.start, detected.end, true);
            if (updated) syncedProgress = updated;
          }
        }

        // Pre-warm word count for opening spread
        void ensureWordCountsForPages(pdf, [clampedStart, clampedStart + 1]);

        if (cancelled) return;

        const queue = new PdfRenderQueue(pdf, 16, 2048);
        queueRef.current = queue;
        setRenderQueue(queue);
        setTotalPages(actualTotal);
        setPage(clampedStart);
        setLoadProgress(100);
        setLoadingPdf(false);

        if (hasQueryPage && isJump(resumePage, clampedStart, 'toc')) {
          pendingJumpRef.current = true;
          showJumpChip(resumePage);
        }

        // Check catch-up finish prompt on open (>= 90% coverage, not dismissed recently)
        const reason = promptReason(syncedProgress, {
          onContentEnd: false,
          leaving: null,
          opening: true,
        });
        if (reason) {
          setFinishPromptState({
            open: true,
            reason,
            confirmWeakCoverage: null,
            pendingClose: false,
          });
        }
      } catch (err) {
        console.error('Failed to open PDF book:', err);
        if (!cancelled) {
          setLoadingPdf(false);
          setLoadError(true);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
      clearJumpChip();
      if (wordCountsDirtyRef.current) {
        void updateBookWordCounts(book.id, wordCountsRef.current);
      }
      queueRef.current?.dispose();
      queueRef.current = null;
      setRenderQueue(null);
      if (pdfDocRef.current) {
        void pdfDocRef.current.cleanup();
        pdfDocRef.current = null;
      }
      resetReader();
    };
  }, [hydrated, book?.id, retryCount]);

  // DwellTracker lifecycle: one tracker per open book, commits every 30s, visibilitychange, pagehide, unmount
  useEffect(() => {
    if (!book || loadingPdf || loadError) return;

    const tracker = new DwellTracker(document.visibilityState === 'visible');
    dwellTrackerRef.current = tracker;

    const onInputThrottled = () => {
      const now = Date.now();
      if (now - lastInputSentRef.current >= 1000) {
        lastInputSentRef.current = now;
        dwellTrackerRef.current?.input(now);
      }
    };

    const onVisibilityChange = () => {
      const now = Date.now();
      const visible = document.visibilityState === 'visible';
      if (!visible) {
        void commitCurrentDwell(now);
      }
      dwellTrackerRef.current?.setVisible(visible, now);
    };

    const onPageHide = () => {
      const now = Date.now();
      void commitCurrentDwell(now);
      if (wordCountsDirtyRef.current) {
        wordCountsDirtyRef.current = false;
        void updateBookWordCounts(book.id, wordCountsRef.current);
      }
    };

    const commitTimer = window.setInterval(() => {
      const now = Date.now();
      void commitCurrentDwell(now);
      if (wordCountsDirtyRef.current) {
        wordCountsDirtyRef.current = false;
        void updateBookWordCounts(book.id, wordCountsRef.current);
      }
    }, 30_000);

    window.addEventListener('pointerdown', onInputThrottled);
    window.addEventListener('keydown', onInputThrottled);
    window.addEventListener('wheel', onInputThrottled, { passive: true });
    window.addEventListener('touchstart', onInputThrottled, { passive: true });
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(commitTimer);
      window.removeEventListener('pointerdown', onInputThrottled);
      window.removeEventListener('keydown', onInputThrottled);
      window.removeEventListener('wheel', onInputThrottled);
      window.removeEventListener('touchstart', onInputThrottled);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);

      const finalNow = Date.now();
      const ended = dwellTrackerRef.current?.show([], finalNow) ?? null;
      if (ended && ended.activeMs > 0) {
        void commitVisitAction(book.id, ended, wordCountsRef.current, finalNow);
      }
      if (wordCountsDirtyRef.current) {
        wordCountsDirtyRef.current = false;
        void updateBookWordCounts(book.id, wordCountsRef.current);
      }
      dwellTrackerRef.current = null;
    };
  }, [book?.id, loadingPdf, loadError, commitCurrentDwell, commitVisitAction, updateBookWordCounts]);

  // Feed settled pages into DwellTracker.show() ONLY when settled (never mid-drag/mid-animation)
  useEffect(() => {
    if (!book || loadingPdf || loadError || !dwellTrackerRef.current) return;
    const now = Date.now();

    if (!isSettled || finishPromptState.open) {
      const ended = dwellTrackerRef.current.show([], now);
      if (ended && ended.activeMs > 0) {
        void commitVisitAction(book.id, ended, wordCountsRef.current, now);
      }
      return;
    }

    if (pdfDocRef.current) {
      void ensureWordCountsForPages(pdfDocRef.current, visiblePages);
    }

    const jumped = pendingJumpRef.current;
    pendingJumpRef.current = false;
    const ended = dwellTrackerRef.current.show(visiblePages, now, jumped);
    if (ended && ended.activeMs > 0) {
      void commitVisitAction(book.id, ended, wordCountsRef.current, now);
    }
  }, [
    book?.id,
    loadingPdf,
    loadError,
    isSettled,
    finishPromptState.open,
    visiblePages,
    commitVisitAction,
    ensureWordCountsForPages,
  ]);

  // Auto-hide controls after 2.5s of inactivity
  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      const state = useReaderStore.getState();
      if (!state.notesOpen && !state.settingsOpen && !finishPromptOpenRef.current) {
        state.setControlsVisible(false);
      }
    }, 2500);
  }, [setControlsVisible]);

  useEffect(() => {
    if (loadingPdf || loadError) return;
    bumpControls();
    const onMove = () => bumpControls();
    const onKey = () => bumpControls();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchstart', onMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchstart', onMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [bumpControls, loadingPdf, loadError]);

  useEffect(() => {
    if (notesOpen || settingsOpen || selection || finishPromptState.open) {
      setControlsVisible(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    }
  }, [notesOpen, settingsOpen, selection, finishPromptState.open, setControlsVisible]);

  const navigateToPage = useCallback(
    (nextPage: number, source: NavSource = 'turn') => {
      if (!book) return;
      const clamped = Math.max(1, Math.min(nextPage, totalPages));
      const latestProgress = useLibraryStore.getState().progressByBook[book.id] ?? progress;
      const currentPos = latestProgress?.position ?? currentPage;

      const jumped = isJump(currentPage, clamped, source);
      if (jumped) {
        pendingJumpRef.current = true;
        showJumpChip(currentPos);
      } else if (source === 'turn') {
        pendingJumpRef.current = false;
        clearJumpChip();
      }

      setSelection(null);
      window.getSelection()?.removeAllRanges();
      setPage(clamped);

      if (settings.sound) {
        playPageTurnSound();
      }
    },
    [book, totalPages, progress, currentPage, setPage, settings.sound, showJumpChip, clearJumpChip]
  );

  const handleGoBackFromJump = useCallback(() => {
    if (jumpFromPage === null) return;
    const target = jumpFromPage;
    pendingJumpRef.current = false;
    clearJumpChip();
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    setPage(Math.max(1, Math.min(target, totalPages)));
  }, [jumpFromPage, clearJumpChip, setPage, totalPages]);

  const isOnContentEnd = useMemo(() => {
    if (!progress) return false;
    return (
      visiblePages.includes(progress.contentEnd) ||
      visiblePages.some((p) => p >= progress.contentEnd)
    );
  }, [progress, visiblePages]);

  const handlePrevPage = useCallback(() => {
    const step = isSpread ? 2 : 1;
    if (currentPage <= 1) return;
    if (use3dEngine && settings.animation === 'full') {
      window.dispatchEvent(new CustomEvent('growth-shelf-3d-turn', { detail: { dir: -1 } }));
    } else {
      navigateToPage(Math.max(1, currentPage - step), 'turn');
    }
  }, [currentPage, isSpread, use3dEngine, settings.animation, navigateToPage]);

  const handleNextPage = useCallback(() => {
    const step = isSpread ? 2 : 1;
    const latestProgress = book
      ? useLibraryStore.getState().progressByBook[book.id] ?? progress
      : progress;

    // Leaving contentEnd moving forward checks finish prompt
    if (latestProgress && isOnContentEnd) {
      const reason = promptReason(latestProgress, {
        onContentEnd: true,
        leaving: 'forward',
        opening: false,
      });
      if (reason) {
        void commitCurrentDwell(Date.now());
        setFinishPromptState({
          open: true,
          reason,
          confirmWeakCoverage: null,
          pendingClose: false,
        });
        return;
      }
    }

    const atLastSpread = isSpread
      ? (currentPage % 2 === 0 ? currentPage : currentPage + 1) >= totalPages
      : currentPage >= totalPages;
    if (atLastSpread) return;

    if (use3dEngine && settings.animation === 'full') {
      window.dispatchEvent(new CustomEvent('growth-shelf-3d-turn', { detail: { dir: 1 } }));
    } else {
      navigateToPage(Math.min(totalPages, currentPage + step), 'turn');
    }
  }, [
    book,
    progress,
    isOnContentEnd,
    isSpread,
    currentPage,
    totalPages,
    use3dEngine,
    settings.animation,
    navigateToPage,
    commitCurrentDwell,
  ]);

  const finishClose = useCallback(() => {
    navigate(book ? `/books/${book.id}` : '/');
  }, [navigate, book]);

  const executeAnimatedClose = useCallback(() => {
    if (use3dEngine && settings.animation !== 'off') {
      setClosing3d(true);
      window.setTimeout(() => {
        finishClose();
      }, 950);
    } else {
      finishClose();
    }
  }, [use3dEngine, settings.animation, finishClose]);

  const handleCloseReader = useCallback(async () => {
    if (!book) {
      finishClose();
      return;
    }

    const now = Date.now();
    const latestProgress = (await commitCurrentDwell(now)) ??
      useLibraryStore.getState().progressByBook[book.id] ??
      progress;

    if (latestProgress) {
      const onEnd =
        visiblePages.includes(latestProgress.contentEnd) ||
        visiblePages.some((p) => p >= latestProgress.contentEnd);
      const reason = promptReason(latestProgress, {
        onContentEnd: onEnd,
        leaving: 'close',
        opening: false,
      });
      if (reason) {
        setFinishPromptState({
          open: true,
          reason,
          confirmWeakCoverage: null,
          pendingClose: true,
        });
        return;
      }
    }

    executeAnimatedClose();
  }, [book, progress, visiblePages, commitCurrentDwell, executeAnimatedClose, finishClose]);

  const handleFinishChoice = useCallback(
    async (choice: FinishChoice) => {
      if (!book) return;
      const outcome = await applyFinishChoice(book.id, choice);
      if (outcome?.needsConfirm) {
        setFinishPromptState((prev) => ({
          ...prev,
          confirmWeakCoverage: outcome.coverage ?? 0,
        }));
        return;
      }

      const shouldClose = finishPromptState.pendingClose;
      setFinishPromptState({
        open: false,
        reason: null,
        confirmWeakCoverage: null,
        pendingClose: false,
      });

      if (choice === 'read' || choice === 'anyway' || choice === 'skimmed') {
        showBanner(
          choice === 'skimmed'
            ? `"${book.title}" marked as skimmed.`
            : `"${book.title}" marked as completed.`
        );
      }

      if (shouldClose) {
        executeAnimatedClose();
      }
    },
    [book, applyFinishChoice, finishPromptState.pendingClose, executeAnimatedClose, showBanner]
  );

  const handleDismissFinishPrompt = useCallback(async () => {
    await handleFinishChoice('notyet');
  }, [handleFinishChoice]);

  const handleGoToUnread = useCallback(
    (page: number) => {
      setFinishPromptState({
        open: false,
        reason: null,
        confirmWeakCoverage: null,
        pendingClose: false,
      });
      navigateToPage(page, 'toc');
    },
    [navigateToPage]
  );

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    try {
      if (next && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback visual fullscreen remains active
    }
  }, [isFullscreen]);

  const handleToggleBookmark = useCallback(async () => {
    if (!book) return;
    const added = await toggleBookmark(book.id, currentPage);
    showBanner(added ? `Bookmarked page ${currentPage}.` : `Removed bookmark on page ${currentPage}.`);
  }, [book, currentPage, toggleBookmark, showBanner]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (finishPromptState.open) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextPage();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        void handleToggleBookmark();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        void handleToggleFullscreen();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setNotesOpen(!notesOpen);
      } else if (e.key === 'Escape') {
        if (selection) {
          setSelection(null);
        } else if (settingsOpen) {
          setSettingsOpen(false);
        } else if (notesOpen) {
          setNotesOpen(false);
        } else if (isFullscreen) {
          void handleToggleFullscreen();
        } else {
          void handleCloseReader();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    finishPromptState.open,
    handleNextPage,
    handlePrevPage,
    handleToggleBookmark,
    handleToggleFullscreen,
    handleCloseReader,
    isFullscreen,
    notesOpen,
    settingsOpen,
    selection,
    setNotesOpen,
    setSettingsOpen,
  ]);

  const bookHighlights = useMemo(
    () => (book ? highlights.filter((h) => h.bookId === book.id) : []),
    [book, highlights]
  );
  const bookBookmarks = useMemo(
    () => (book ? bookmarks.filter((b) => b.bookId === book.id) : []),
    [book, bookmarks]
  );
  const bookJournal = useMemo(
    () => (book ? journal.filter((j) => j.bookId === book.id) : []),
    [book, journal]
  );

  const isCurrentBookmarked = bookBookmarks.some((bm) => bm.pageNumber === currentPage);

  // Selection Toolbar handlers
  const handlePickHighlightColor = async (color: HighlightColor) => {
    if (!book || !selection) return;
    if (selection.highlightId) {
      await updateHighlight(selection.highlightId, { color });
      setSelection({ ...selection, color });
    } else {
      const created = await addHighlight({
        bookId: book.id,
        pageNumber: selection.pageNumber,
        text: selection.text,
        rects: selection.rects,
        color,
        isArea: selection.isArea,
      });
      setSelection({ ...selection, highlightId: created.id, color });
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleAddHighlightNote = async (noteText: string) => {
    if (!book || !selection) return;
    if (selection.highlightId) {
      await updateHighlight(selection.highlightId, { note: noteText });
      await useLibraryStore.getState().addJournalEntry({
        bookId: book.id,
        pageNumber: selection.pageNumber,
        quote: selection.text,
        content: noteText,
        highlightId: selection.highlightId,
      });
    } else {
      await addHighlight({
        bookId: book.id,
        pageNumber: selection.pageNumber,
        text: selection.text,
        rects: selection.rects,
        color: selection.color ?? 'yellow',
        note: noteText,
        isArea: selection.isArea,
      });
    }
    showBanner('Highlight and note saved.');
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleCopySelection = async () => {
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection.text);
      showBanner('Passage copied to clipboard.');
    } catch {
      showBanner('Selected text ready.');
    }
    setSelection(null);
  };

  const handleRemoveHighlight = async () => {
    if (!selection?.highlightId) return;
    await removeHighlight(selection.highlightId);
    setSelection(null);
  };

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{ backgroundColor: 'var(--reader-bg)' }}
      onClick={() => {
        if (selection) setSelection(null);
      }}
    >
      {/* Loading State */}
      {loadingPdf && (
        <div className="flex min-h-screen flex-col items-center justify-center px-6">
          <div className="w-full max-w-[360px] space-y-4 text-center">
            <p className="editorial-label text-[var(--foreground)]">
              OPENING YOUR BOOK
            </p>
            <p className="text-sm text-[var(--foreground-secondary)]">
              Preparing pages...
            </p>
            <ProgressLine percent={loadProgress} />
            {slowLoadHint && (
              <p className="pt-1 text-xs text-[var(--foreground-secondary)]">
                Preparing a high-resolution reading view...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error State */}
      {!loadingPdf && loadError && (
        <div className="flex min-h-screen flex-col items-center justify-center px-6">
          <div className="w-full max-w-[440px] border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <h1 className="editorial-label text-[var(--foreground)]">
              THIS BOOK COULD NOT BE OPENED
            </h1>
            <p className="mt-3 text-sm text-[var(--foreground-secondary)]">
              The file may be damaged or unsupported.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-4">
              <Button variant="primary" onClick={() => setRetryCount((c) => c + 1)}>
                TRY AGAIN
              </Button>
              {book && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await removeBook(book.id);
                    navigate('/books');
                  }}
                >
                  REMOVE BOOK
                </Button>
              )}
              <Button variant="tertiary" onClick={() => navigate('/books')}>
                BACK TO COLLECTION
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Active Reader Surface */}
      {!loadingPdf && !loadError && book && renderQueue && (
        <>
          {use3dEngine ? (
            <Suspense
              fallback={
                <FlatReader
                  book={book}
                  renderQueue={renderQueue}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  isSpread={isSpread}
                  isFullscreen={isFullscreen}
                  highlights={bookHighlights}
                  areaHighlightMode={areaHighlightMode}
                  onTextLayerDetected={setHasTextLayer}
                  onPrevPage={handlePrevPage}
                  onNextPage={handleNextPage}
                  onSettledChange={setIsSettled}
                  onTextSelected={(payload) => setSelection({ ...payload })}
                  onAreaSelected={(payload) =>
                    setSelection({
                      ...payload,
                      text: `Selected region on page ${payload.pageNumber}`,
                      isArea: true,
                    })
                  }
                  onSelectHighlight={(hl: Highlight, anchorRect: DOMRect) =>
                    setSelection({
                      pageNumber: hl.pageNumber,
                      text: hl.text,
                      rects: hl.rects,
                      anchorRect,
                      highlightId: hl.id,
                      color: hl.color,
                      isArea: hl.isArea,
                    })
                  }
                />
              }
            >
              <LazyBookScene
                book={book}
                renderQueue={renderQueue}
                currentPage={currentPage}
                totalPages={totalPages}
                isFullscreen={isFullscreen}
                highlights={bookHighlights}
                areaHighlightMode={areaHighlightMode}
                closingSignal={closing3d}
                onCloseComplete={finishClose}
                onPageChangeRequest={(next) => navigateToPage(next, 'turn')}
                onTextLayerDetected={setHasTextLayer}
                onWebglFailure={() => setWebglFailed(true)}
                onSettledChange={setIsSettled}
                onTextSelected={(payload) => setSelection({ ...payload })}
                onAreaSelected={(payload) =>
                  setSelection({
                    ...payload,
                    text: `Selected region on page ${payload.pageNumber}`,
                    isArea: true,
                  })
                }
                onSelectHighlight={(hl: Highlight, anchorRect: DOMRect) =>
                  setSelection({
                    pageNumber: hl.pageNumber,
                    text: hl.text,
                    rects: hl.rects,
                    anchorRect,
                    highlightId: hl.id,
                    color: hl.color,
                    isArea: hl.isArea,
                  })
                }
              />
            </Suspense>
          ) : (
            <FlatReader
              book={book}
              renderQueue={renderQueue}
              currentPage={currentPage}
              totalPages={totalPages}
              isSpread={isSpread}
              isFullscreen={isFullscreen}
              highlights={bookHighlights}
              areaHighlightMode={areaHighlightMode}
              onTextLayerDetected={setHasTextLayer}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
              onSettledChange={setIsSettled}
              onTextSelected={(payload) => setSelection({ ...payload })}
              onAreaSelected={(payload) =>
                setSelection({
                  ...payload,
                  text: `Selected region on page ${payload.pageNumber}`,
                  isArea: true,
                })
              }
              onSelectHighlight={(hl: Highlight, anchorRect: DOMRect) =>
                setSelection({
                  pageNumber: hl.pageNumber,
                  text: hl.text,
                  rects: hl.rects,
                  anchorRect,
                  highlightId: hl.id,
                  color: hl.color,
                  isArea: hl.isArea,
                })
              }
            />
          )}

          {/* Scanned PDF notice */}
          {!hasTextLayer && (
            <div className="pointer-events-none fixed left-1/2 top-16 z-20 -translate-x-1/2 border border-[var(--border)] bg-[var(--surface)] px-4 py-1.5 text-xs text-[var(--foreground-secondary)]">
              Text selection requires a text-based PDF. Use Area Highlight to mark scanned pages.
            </div>
          )}

          <JumpChip
            fromPage={jumpFromPage}
            onGoBack={handleGoBackFromJump}
          />

          <ReaderControls
            visible={controlsVisible}
            currentPage={currentPage}
            totalPages={totalPages}
            isSpread={isSpread}
            isBookmarked={isCurrentBookmarked}
            isFullscreen={isFullscreen}
            hasTextLayer={hasTextLayer}
            areaHighlightMode={areaHighlightMode}
            onContentEnd={isOnContentEnd}
            isCompleted={Boolean(progress?.completionType)}
            onToggleAreaHighlight={() => setAreaHighlightMode(!areaHighlightMode)}
            onToggleNotes={() => setNotesOpen(!notesOpen)}
            onToggleBookmark={() => void handleToggleBookmark()}
            onToggleSettings={() => setSettingsOpen(!settingsOpen)}
            onToggleFullscreen={() => void handleToggleFullscreen()}
            onClose={() => void handleCloseReader()}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
            onJumpToPage={(p) => navigateToPage(p, 'field')}
          />

          {selection && (
            <SelectionToolbar
              anchorRect={selection.anchorRect}
              selectedColor={selection.color}
              isExistingHighlight={Boolean(selection.highlightId)}
              onPickColor={(c) => void handlePickHighlightColor(c)}
              onAddNote={(txt) => void handleAddHighlightNote(txt)}
              onCopy={() => void handleCopySelection()}
              onRemove={
                selection.highlightId ? () => void handleRemoveHighlight() : undefined
              }
              onClose={() => setSelection(null)}
            />
          )}

          <NotesPanel
            open={notesOpen}
            bookId={book.id}
            currentPage={currentPage}
            bookmarks={bookBookmarks}
            highlights={bookHighlights}
            journalEntries={bookJournal}
            onNavigatePage={(p) => {
              navigateToPage(p, 'toc');
            }}
            onClose={() => setNotesOpen(false)}
          />

          <SettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />

          {progress && (
            <FinishPrompt
              open={finishPromptState.open}
              bookTitle={book.title}
              progress={applyContentRange(
                progress,
                progress.contentStart,
                Math.min(progress.contentEnd, totalPages),
                progress.rangeDetected
              )}
              reason={finishPromptState.reason}
              confirmWeakCoverage={finishPromptState.confirmWeakCoverage}
              onChoose={(c) => void handleFinishChoice(c)}
              onGoToUnread={handleGoToUnread}
              onDismiss={() => void handleDismissFinishPrompt()}
            />
          )}
        </>
      )}
    </div>
  );
}
