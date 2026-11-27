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
import type { Highlight, HighlightColor, Rect } from '../types/models';
import { getPdfBlob } from '../lib/db';
import { openPdfDocument } from '../lib/pdf/loader';
import { PdfRenderQueue } from '../lib/pdf/renderQueue';
import {
  changeTrackerPage,
  createSessionTracker,
  markTrackerActivity,
  snapshotSession,
  tickSessionTracker,
  type SessionTrackerState,
} from '../lib/domain/sessions';
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
  const hydrated = useLibraryStore((s) => s.hydrated);
  const highlights = useLibraryStore((s) => s.highlights);
  const bookmarks = useLibraryStore((s) => s.bookmarks);
  const journal = useLibraryStore((s) => s.journal);
  const recordReadingProgress = useLibraryStore((s) => s.recordReadingProgress);
  const addHighlight = useLibraryStore((s) => s.addHighlight);
  const updateHighlight = useLibraryStore((s) => s.updateHighlight);
  const removeHighlight = useLibraryStore((s) => s.removeHighlight);
  const toggleBookmark = useLibraryStore((s) => s.toggleBookmark);
  const upsertSession = useLibraryStore((s) => s.upsertSession);
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
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const queueRef = useRef<PdfRenderQueue | null>(null);
  const trackerRef = useRef<SessionTrackerState | null>(null);
  const idleTimerRef = useRef<number | null>(null);

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

  // Initialize reader page state & load PDF from IndexedDB
  useEffect(() => {
    if (!hydrated) return;
    if (!book) {
      setLoadingPdf(false);
      setLoadError(true);
      return;
    }

    const queryPage = Number(searchParams.get('page'));
    const startPage =
      Number.isFinite(queryPage) && queryPage >= 1
        ? Math.min(queryPage, book.totalPages)
        : Math.max(1, book.currentPage || 1);

    initReader(book.id, startPage, book.totalPages);

    let cancelled = false;
    setLoadingPdf(true);
    setLoadError(false);
    setSlowLoadHint(false);
    setLoadProgress(15);

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

        const queue = new PdfRenderQueue(pdf, 16, 2048);
        queueRef.current = queue;
        setRenderQueue(queue);
        setTotalPages(actualTotal);
        setPage(clampedStart);
        setLoadProgress(100);
        setLoadingPdf(false);

        await recordReadingProgress(book.id, clampedStart, actualTotal);
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

  // Reading session tracker (ticks every 1s, persists every 30s and on close/unmount)
  useEffect(() => {
    if (!book || loadingPdf || loadError) return;

    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    trackerRef.current = createSessionTracker(sessionId, book.id, currentPage);

    const tickInterval = window.setInterval(() => {
      if (!trackerRef.current) return;
      trackerRef.current = tickSessionTracker(
        trackerRef.current,
        document.visibilityState === 'visible'
      );
    }, 1000);

    const persistInterval = window.setInterval(() => {
      if (!trackerRef.current) return;
      const snap = snapshotSession(trackerRef.current);
      if (snap.durationSeconds >= 5) {
        void upsertSession(snap);
      }
    }, 30_000);

    const onActivity = () => {
      if (trackerRef.current) {
        trackerRef.current = markTrackerActivity(trackerRef.current);
      }
    };

    const onVisibility = () => {
      if (trackerRef.current) {
        trackerRef.current = tickSessionTracker(
          trackerRef.current,
          document.visibilityState === 'visible'
        );
        if (document.visibilityState === 'hidden') {
          const snap = snapshotSession(trackerRef.current);
          if (snap.durationSeconds >= 5) {
            void upsertSession(snap);
          }
        }
      }
    };

    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(tickInterval);
      clearInterval(persistInterval);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      if (trackerRef.current) {
        const finalSnap = snapshotSession(trackerRef.current);
        if (finalSnap.durationSeconds >= 3) {
          void upsertSession(finalSnap);
        }
        trackerRef.current = null;
      }
    };
  }, [book?.id, loadingPdf, loadError]);

  // Auto-hide controls after 2.5s of inactivity
  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      const state = useReaderStore.getState();
      if (!state.notesOpen && !state.settingsOpen) {
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
    if (notesOpen || settingsOpen || selection) {
      setControlsVisible(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    }
  }, [notesOpen, settingsOpen, selection, setControlsVisible]);

  const navigateToPage = useCallback(
    (nextPage: number) => {
      if (!book) return;
      const clamped = Math.max(1, Math.min(nextPage, totalPages));
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      setPage(clamped);

      if (settings.sound) {
        playPageTurnSound();
      }
      if (trackerRef.current) {
        trackerRef.current = changeTrackerPage(trackerRef.current, clamped);
      }
      void recordReadingProgress(book.id, clamped, totalPages);
    },
    [book, totalPages, setPage, settings.sound, recordReadingProgress]
  );

  const handlePrevPage = useCallback(() => {
    const step = isSpread ? 2 : 1;
    if (currentPage <= 1) return;
    if (use3dEngine && settings.animation === 'full') {
      window.dispatchEvent(new CustomEvent('growth-shelf-3d-turn', { detail: { dir: -1 } }));
    } else {
      navigateToPage(Math.max(1, currentPage - step));
    }
  }, [currentPage, isSpread, use3dEngine, settings.animation, navigateToPage]);

  const handleNextPage = useCallback(() => {
    const step = isSpread ? 2 : 1;
    if (currentPage >= totalPages) return;
    if (use3dEngine && settings.animation === 'full') {
      window.dispatchEvent(new CustomEvent('growth-shelf-3d-turn', { detail: { dir: 1 } }));
    } else {
      navigateToPage(Math.min(totalPages, currentPage + step));
    }
  }, [currentPage, totalPages, isSpread, use3dEngine, settings.animation, navigateToPage]);

  const finishClose = useCallback(() => {
    if (trackerRef.current) {
      const snap = snapshotSession(trackerRef.current);
      if (snap.durationSeconds >= 3) {
        void upsertSession(snap);
      }
    }
    navigate('/');
  }, [navigate, upsertSession]);

  const handleCloseReader = useCallback(() => {
    if (use3dEngine && settings.animation !== 'off') {
      setClosing3d(true);
      window.setTimeout(() => {
        finishClose();
      }, 950);
    } else {
      finishClose();
    }
  }, [use3dEngine, settings.animation, finishClose]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        // Keep state synced when user exits native fullscreen with browser Esc
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
      // Browser fullscreen API may be blocked in embedded iframe; visual full-screen book mode stays active
    }
  }, [isFullscreen]);

  const handleToggleBookmark = useCallback(async () => {
    if (!book) return;
    const added = await toggleBookmark(book.id, currentPage);
    showBanner(added ? `Bookmarked page ${currentPage}.` : `Removed bookmark on page ${currentPage}.`);
  }, [book, currentPage, toggleBookmark, showBanner]);

  // Global keyboard shortcuts (Section 8.5)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
          handleCloseReader();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
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

      {/* Error State (Section 7) */}
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
                onPageChangeRequest={navigateToPage}
                onTextLayerDetected={setHasTextLayer}
                onWebglFailure={() => setWebglFailed(true)}
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

          <ReaderControls
            visible={controlsVisible}
            currentPage={currentPage}
            totalPages={totalPages}
            isSpread={isSpread}
            isBookmarked={isCurrentBookmarked}
            isFullscreen={isFullscreen}
            hasTextLayer={hasTextLayer}
            areaHighlightMode={areaHighlightMode}
            onToggleAreaHighlight={() => setAreaHighlightMode(!areaHighlightMode)}
            onToggleNotes={() => setNotesOpen(!notesOpen)}
            onToggleBookmark={() => void handleToggleBookmark()}
            onToggleSettings={() => setSettingsOpen(!settingsOpen)}
            onToggleFullscreen={() => void handleToggleFullscreen()}
            onClose={handleCloseReader}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
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
              navigateToPage(p);
            }}
            onClose={() => setNotesOpen(false)}
          />

          <SettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
        </>
      )}
    </div>
  );
}
