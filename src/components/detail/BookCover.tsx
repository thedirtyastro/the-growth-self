import type { Book } from '../../types/models';
import { getContrastTextColor } from '../../lib/domain/status';

import {
  getBookPatternVariant,
  getBookRuleColor,
  getBookclothCssOverlay,
} from '../../lib/bookTextures';

interface BookCoverProps {
  book: Book;
  size?: 'detail' | 'card';
}

export function BookCover({ book, size = 'detail' }: BookCoverProps) {
  const fg = getContrastTextColor(book.coverColor);
  const isDetail = size === 'detail';
  const variant = getBookPatternVariant(book.id);
  const weaveOverlay = getBookclothCssOverlay(variant);
  const ruleColor = getBookRuleColor(book.coverColor);

  return (
    <div className="flex flex-col items-center">
      <div
        className={`book-cover-frame relative overflow-hidden select-none ${
          isDetail
            ? 'w-[280px] sm:w-[340px] max-w-full'
            : 'w-full aspect-[340/500]'
        }`}
        style={{
          backgroundColor: book.coverColor,
          backgroundImage: weaveOverlay,
        }}
      >
        {book.coverDataUrl ? (
          <img
            src={book.coverDataUrl}
            alt={`Cover of ${book.title}`}
            className={`block w-full ${
              isDetail ? 'max-h-[500px] h-auto object-contain' : 'h-full object-cover'
            }`}
          />
        ) : (
          <div
            className={`relative flex flex-col justify-between ${
              isDetail ? 'min-h-[460px] sm:min-h-[500px] p-8 pl-10' : 'h-full p-5 pl-7'
            }`}
            style={{ color: fg }}
          >
            {/* Blind-debossed inner cover border frame & binding motif */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-3 right-3 left-[22px] border"
              style={{ borderColor: ruleColor }}
            />
            {variant === 'double-rule' && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-4 right-4 left-[26px] border"
                style={{ borderColor: ruleColor, opacity: 0.6 }}
              />
            )}
            {variant === 'herringbone-arch' && (
              <svg
                aria-hidden="true"
                viewBox="0 0 120 160"
                className="pointer-events-none absolute right-5 bottom-12 h-28 w-20 opacity-25"
                fill="none"
                stroke={fg}
                strokeWidth="1"
              >
                <path d="M20 150 V70 C20 35 100 35 100 70 V150" />
                <circle cx="60" cy="68" r="14" />
                <line x1="60" y1="30" x2="60" y2="150" />
              </svg>
            )}
            {variant === 'atelier-grid' && (
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                className="pointer-events-none absolute right-5 top-1/2 h-24 w-24 -translate-y-1/2 opacity-20"
                fill="none"
                stroke={fg}
                strokeWidth="0.9"
              >
                <rect x="14" y="14" width="72" height="72" />
                <circle cx="50" cy="50" r="26" />
                <polygon points="50,18 82,50 50,82 18,50" />
              </svg>
            )}
            {variant === 'linen-frame' && (
              <svg
                aria-hidden="true"
                viewBox="0 0 80 80"
                className="pointer-events-none absolute right-5 top-6 h-12 w-12 opacity-25"
                fill="none"
                stroke={fg}
                strokeWidth="1"
              >
                <circle cx="40" cy="40" r="24" />
                <circle cx="40" cy="40" r="8" />
                <line x1="40" y1="8" x2="40" y2="72" />
                <line x1="8" y1="40" x2="72" y2="40" />
              </svg>
            )}

            <span className="editorial-label relative z-[1] opacity-75">
              {book.category}
            </span>
            <div className="relative z-[1]">
              <h3
                className={`font-display font-semibold uppercase leading-[0.98] ${
                  isDetail ? 'text-4xl' : 'text-xl'
                }`}
              >
                {book.title}
              </h3>
            </div>
            <p className="editorial-label relative z-[1] opacity-80">{book.author}</p>
          </div>
        )}

        {/* Tactile cloth weave glaze even over image covers */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-35 mix-blend-overlay"
          style={{ backgroundImage: weaveOverlay }}
        />

        {/* Hinge line 14px from left edge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-[14px] w-[3px] flex"
        >
          <div className="h-full w-[2px] bg-black/22" />
          <div className="h-full w-[1px] bg-white/18" />
        </div>

        {/* Darker 7% gradient at left edge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-7 bg-gradient-to-r from-black/[0.11] to-transparent"
        />
      </div>

      {isDetail && (
        <div
          aria-hidden="true"
          className="mt-2 h-4 w-[240px] sm:w-[290px] rounded-full"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(32, 31, 28, 0.24) 0%, rgba(32, 31, 28, 0) 72%)',
          }}
        />
      )}
    </div>
  );
}
