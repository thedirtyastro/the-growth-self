import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Progress } from '../../types/models';
import {
  findFirstUnreadPage,
  formatSkippedRanges,
  stats,
  type FinishChoice,
  type PromptReason,
} from '../../lib/domain/reading';
import { formatDurationCompact } from '../../lib/domain/heatmap';
import { Button } from '../shell/Button';

interface FinishPromptProps {
  open: boolean;
  bookTitle: string;
  progress: Progress;
  reason: PromptReason;
  confirmWeakCoverage: number | null; // coverage 0..1 when needsConfirm is active
  onChoose: (choice: FinishChoice) => void;
  onGoToUnread: (page: number) => void;
  onDismiss: () => void;
}

export function FinishPrompt({
  open,
  bookTitle,
  progress,
  reason,
  confirmWeakCoverage,
  onChoose,
  onGoToUnread,
  onDismiss,
}: FinishPromptProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    const focusables = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
        return;
      }
      if (e.key === 'Tab' && focusables && focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, confirmWeakCoverage, onDismiss]);

  if (!open) return null;

  const s = stats(progress);
  const firstUnread = findFirstUnreadPage(progress);
  const skippedSummary = formatSkippedRanges(progress);
  const timeFormatted =
    s.activeMs >= 30_000
      ? formatDurationCompact(Math.round(s.activeMs / 1000))
      : `${Math.round(s.activeMs / 1000)}s`;

  const heading =
    reason === null ? 'MARK AS FINISHED' : "YOU'VE REACHED THE END";

  const subtitle =
    reason === 'catch-up'
      ? `You have covered most of ${bookTitle}.`
      : reason === 'end-of-book' || reason === 'close-at-end'
        ? `Finished your session in ${bookTitle}?`
        : `How did you finish ${bookTitle}?`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(32,31,28,0.42)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-prompt-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        ref={dialogRef}
        data-testid="finish-prompt"
        style={{ animationDuration: '220ms' }}
        className="animate-modal-in w-full max-w-[500px] border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] pb-4">
          <div>
            <p className="editorial-label text-[var(--foreground-secondary)]">
              READING CHECKPOINT
            </p>
            <h2
              id="finish-prompt-title"
              className="mt-1.5 font-display text-3xl font-semibold uppercase leading-tight text-[var(--foreground)]"
            >
              {heading}
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close finish prompt"
            className="inline-flex h-10 w-10 items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {confirmWeakCoverage !== null ? (
          <div className="mt-5 space-y-5" data-testid="finish-confirm-weak">
            <p className="font-prose text-lg text-[var(--foreground)]">
              Only {Math.round(confirmWeakCoverage * 100)}% of pages show reading time.
            </p>
            <p className="text-sm leading-relaxed text-[var(--foreground-secondary)]">
              {s.readPages} of {s.contentPages} main-text pages meet the reading time threshold
              {skippedSummary ? ` (${skippedSummary.toLowerCase()})` : ''}. Would you like to jump to the first unread page or mark this book finished anyway?
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                variant="primary"
                onClick={() => onGoToUnread(firstUnread)}
              >
                GO TO FIRST UNREAD PAGE
              </Button>
              <Button
                variant="secondary"
                onClick={() => onChoose('anyway')}
              >
                MARK FINISHED ANYWAY
              </Button>
              <Button variant="tertiary" onClick={onDismiss}>
                NOT YET
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <p className="text-sm text-[var(--foreground-secondary)]">{subtitle}</p>

            <div className="border border-[var(--border-soft)] bg-[var(--background)] p-4 space-y-1.5">
              <p className="editorial-label tabular-nums text-[var(--foreground)]">
                {s.readPages} OF {s.contentPages} MAIN-TEXT PAGES READ ({s.percent}% READ) · {timeFormatted.toUpperCase()} ACTIVE
              </p>
              {s.skimmedPages > 0 && (
                <p className="text-xs text-[var(--foreground-secondary)] tabular-nums">
                  {s.skimmedPages} {s.skimmedPages === 1 ? 'page' : 'pages'} skimmed briefly
                </p>
              )}
              {skippedSummary && (
                <p className="text-xs text-[var(--foreground-secondary)]">
                  {skippedSummary}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button variant="primary" onClick={() => onChoose('read')}>
                I READ IT
              </Button>
              <Button variant="secondary" onClick={() => onChoose('skimmed')}>
                I SKIMMED IT
              </Button>
              <Button variant="tertiary" onClick={onDismiss}>
                NOT YET
              </Button>
            </div>

            {s.unseenPages + s.skimmedPages > 0 && (
              <div className="border-t border-[var(--border-soft)] pt-3">
                <button
                  type="button"
                  onClick={() => onGoToUnread(firstUnread)}
                  className="editorial-label text-[var(--foreground-secondary)] underline underline-offset-4 hover:text-[var(--foreground)] cursor-pointer"
                >
                  GO TO FIRST UNREAD PAGE (PAGE {firstUnread})
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
