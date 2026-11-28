import { useState } from 'react';
import { formatPageNumber } from '../../lib/domain/status';

interface ReaderControlsProps {
  visible: boolean;
  currentPage: number;
  totalPages: number;
  isSpread: boolean;
  isBookmarked: boolean;
  isFullscreen: boolean;
  hasTextLayer: boolean;
  areaHighlightMode: boolean;
  onContentEnd?: boolean;
  isCompleted?: boolean;
  onToggleAreaHighlight: () => void;
  onToggleNotes: () => void;
  onToggleBookmark: () => void;
  onToggleSettings: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onJumpToPage?: (page: number) => void;
}

export function ReaderControls({
  visible,
  currentPage,
  totalPages,
  isSpread,
  isBookmarked,
  isFullscreen,
  hasTextLayer,
  areaHighlightMode,
  onContentEnd = false,
  isCompleted = false,
  onToggleAreaHighlight,
  onToggleNotes,
  onToggleBookmark,
  onToggleSettings,
  onToggleFullscreen,
  onClose,
  onPrevPage,
  onNextPage,
  onJumpToPage,
}: ReaderControlsProps) {
  const step = isSpread ? 2 : 1;
  const [editingPage, setEditingPage] = useState(false);
  const [pageDraft, setPageDraft] = useState('');

  const atLastSpread = isSpread
    ? (currentPage % 2 === 0 ? currentPage : currentPage + 1) >= totalPages
    : currentPage >= totalPages;

  const canAdvanceForEndPrompt = onContentEnd && !isCompleted;

  const submitPageJump = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Math.round(Number(pageDraft));
    if (Number.isFinite(num) && num >= 1 && num <= totalPages && onJumpToPage) {
      onJumpToPage(num);
    }
    setEditingPage(false);
  };

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-30 flex flex-col justify-between transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Top Bar */}
      <header
        className={`pointer-events-auto flex h-14 items-center justify-between px-5 md:px-10 transition-colors ${
          isFullscreen
            ? 'bg-gradient-to-b from-[var(--reader-bg)]/95 via-[var(--reader-bg)]/75 to-transparent'
            : ''
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--foreground)] hover:text-[var(--accent-hover)] transition-colors cursor-pointer"
        >
          THE GROWTH SHELF
        </button>

        <div className="flex items-center gap-4 md:gap-7">
          {!hasTextLayer && (
            <button
              type="button"
              onClick={onToggleAreaHighlight}
              aria-pressed={areaHighlightMode}
              className={`inline-flex h-11 items-center px-2 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors cursor-pointer ${
                areaHighlightMode
                  ? 'text-[var(--accent-hover)] underline underline-offset-4'
                  : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {areaHighlightMode ? 'AREA HIGHLIGHT: ON' : 'AREA HIGHLIGHT'}
            </button>
          )}

          <button
            type="button"
            onClick={onToggleNotes}
            className="inline-flex h-11 items-center px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--foreground)] hover:text-[var(--accent-hover)] transition-colors cursor-pointer"
          >
            NOTES
          </button>

          <button
            type="button"
            onClick={onToggleBookmark}
            aria-pressed={isBookmarked}
            className={`inline-flex h-11 items-center px-1 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors cursor-pointer ${
              isBookmarked
                ? 'text-[var(--accent-hover)] underline underline-offset-4'
                : 'text-[var(--foreground)] hover:text-[var(--accent-hover)]'
            }`}
          >
            {isBookmarked ? 'BOOKMARKED' : 'BOOKMARK'}
          </button>

          <button
            type="button"
            onClick={onToggleSettings}
            aria-label="Reader appearance and settings"
            className="inline-flex h-11 items-center px-1 text-[13px] font-medium text-[var(--foreground)] hover:text-[var(--accent-hover)] transition-colors cursor-pointer"
          >
            Aa
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            className="hidden sm:inline-flex h-11 items-center px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--foreground)] hover:text-[var(--accent-hover)] transition-colors cursor-pointer"
          >
            {isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--foreground)] hover:text-[var(--accent-hover)] transition-colors cursor-pointer"
          >
            CLOSE
          </button>
        </div>
      </header>

      {/* Bottom Center Navigation */}
      <footer
        className={`pointer-events-auto flex h-14 items-center justify-center gap-6 md:gap-10 px-4 transition-colors ${
          isFullscreen
            ? 'bg-gradient-to-t from-[var(--reader-bg)]/95 via-[var(--reader-bg)]/75 to-transparent'
            : ''
        }`}
      >
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={onPrevPage}
          className="inline-flex h-11 items-center px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--foreground)] hover:text-[var(--accent-hover)] disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          PREVIOUS PAGE
        </button>

        {editingPage && onJumpToPage ? (
          <form onSubmit={submitPageJump} className="inline-flex items-center gap-1.5">
            <label htmlFor="reader-jump-page-input" className="sr-only">
              Jump to page number
            </label>
            <input
              id="reader-jump-page-input"
              type="number"
              min={1}
              max={totalPages}
              autoFocus
              value={pageDraft}
              onChange={(e) => setPageDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setEditingPage(false);
                }
              }}
              onBlur={() => setEditingPage(false)}
              placeholder={String(currentPage)}
              className="h-8 w-20 border border-[var(--border-strong)] bg-[var(--paper)] px-2 text-center text-xs tabular-nums text-[var(--foreground)]"
            />
            <span className="editorial-label tabular-nums text-[var(--foreground-secondary)]">
              / {totalPages}
            </span>
          </form>
        ) : (
          <button
            type="button"
            data-testid="reader-page-indicator"
            aria-label={`Current page ${currentPage} of ${totalPages}. Activate to jump to page.`}
            onClick={() => {
              if (!onJumpToPage) return;
              setPageDraft(String(currentPage));
              setEditingPage(true);
            }}
            className="inline-flex h-11 items-center px-2 editorial-label tabular-nums text-[var(--foreground)] hover:text-[var(--accent-hover)] transition-colors cursor-pointer"
          >
            {formatPageNumber(currentPage, totalPages)}
          </button>
        )}

        <button
          type="button"
          disabled={atLastSpread && !canAdvanceForEndPrompt}
          onClick={onNextPage}
          className="inline-flex h-11 items-center px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--foreground)] hover:text-[var(--accent-hover)] disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          NEXT PAGE
        </button>
        <span className="sr-only">Step {step}</span>
      </footer>
    </div>
  );
}
