import { Link } from 'react-router-dom';
import type { Book } from '../../types/models';
import { formatPageNumber } from '../../lib/domain/status';
import { createInitialProgress, deriveStatus, stats } from '../../lib/domain/reading';
import { useLibraryStore } from '../../store/library';
import { Badge } from '../shell/Badge';
import { ProgressLine } from '../shell/ProgressLine';

interface BookCaptionProps {
  book: Book;
  onRead: (book: Book) => void;
}

export function BookCaption({ book, onRead }: BookCaptionProps) {
  const progress = useLibraryStore(
    (s) =>
      s.progressByBook[book.id] ??
      createInitialProgress(book.id, book.totalPages, book.status, book.completedAt)
  );
  const status = deriveStatus(progress);
  const s = stats(progress);
  const displayPage = status === 'not-started' ? 0 : progress.position;

  const actionLabel =
    status === 'completed'
      ? 'READ AGAIN'
      : status === 'not-started'
        ? 'START READING'
        : 'CONTINUE READING';

  return (
    <div
      className="mt-7 flex flex-wrap items-center justify-between gap-6 border-t border-[var(--border)] pt-6"
      data-testid="shelf-caption"
    >
      <div className="min-w-[220px]">
        <Link
          to={`/books/${book.id}`}
          className="font-display text-[32px] md:text-[36px] font-medium leading-[1.08] text-[var(--foreground)] hover:text-[var(--accent-hover)] transition-colors"
        >
          {book.title}
        </Link>
        <p className="mt-1 text-[15px] text-[var(--foreground-secondary)]">
          {book.author}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-5 md:gap-7">
        <Badge status={status} completionType={progress.completionType} />
        <span className="editorial-label tabular-nums text-[var(--foreground)]">
          {formatPageNumber(displayPage, book.totalPages)}
        </span>
        <div className="w-[140px] sm:w-[160px] space-y-1">
          <ProgressLine percent={s.percent} />
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--foreground-secondary)] tabular-nums">
            {s.percent}% READ
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRead(book)}
          className="inline-flex h-11 items-center editorial-label text-[var(--foreground)] underline underline-offset-[6px] decoration-[var(--foreground)] hover:text-[var(--accent-hover)] hover:decoration-[var(--accent-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
