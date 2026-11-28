interface JumpChipProps {
  fromPage: number | null;
  onGoBack: () => void;
}

export function JumpChip({ fromPage, onGoBack }: JumpChipProps) {
  if (fromPage === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="jump-chip"
      className="pointer-events-auto animate-banner-in fixed bottom-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-xs text-[var(--foreground)] shadow-md"
    >
      <span className="tabular-nums text-[var(--foreground-secondary)]">
        Jumped from page {fromPage}.
      </span>
      <button
        type="button"
        onClick={onGoBack}
        className="editorial-label text-[var(--accent-hover)] underline underline-offset-4 hover:text-[var(--foreground)] cursor-pointer"
      >
        Go back
      </button>
    </div>
  );
}
