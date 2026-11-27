import { Link } from 'react-router-dom';
import type { Book } from '../../types/models';
import { computeBookProgress, formatPageNumber } from '../../lib/domain/status';
import { Badge } from '../shell/Badge';
import { ProgressLine } from '../shell/ProgressLine';

interface BookCaptionProps {
  book: Book;
  onRead: (book: Book) => void;
}

export function BookCaption({ book, onRead }: BookCaptionProps) {
  const progress =
    book.status === 'completed'
      ? 100
      : book.status === 'not-started'
        ? 0
        : computeBookProgress(book.currentPage, book.totalPages);

  const actionLabel =
    book.status === 'completed'
      ? 'READ AGAIN'
      : book.status === 'not-started'
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
        <Badge status={book.status} />
        <span className="editorial-label tabular-nums text-[var(--foreground)]">
          {formatPageNumber(book.currentPage, book.totalPages)}
        </span>
        <div className="w-[140px] sm:w-[160px]">
          <ProgressLine percent={progress} />
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
