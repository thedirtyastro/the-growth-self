import type { MouseEvent } from 'react';
import type { Book } from '../../types/models';
import {
  computeSpineWidth,
  getContrastTextColor,
  hashBookHeight,
} from '../../lib/domain/status';

import {
  getBookPatternVariant,
  getBookRuleColor,
  getBookclothCssOverlay,
} from '../../lib/bookTextures';

interface SpineProps {
  book: Book;
  isActive: boolean;
  onFocusOrHover: (book: Book) => void;
  onSelect: (book: Book, rect: DOMRect) => void;
}

export function Spine({ book, isActive, onFocusOrHover, onSelect }: SpineProps) {
  const width = computeSpineWidth(book.totalPages);
  const height = hashBookHeight(book.id);
  const textColor = getContrastTextColor(book.coverColor);
  const variant = getBookPatternVariant(book.id);
  const weaveOverlay = getBookclothCssOverlay(variant);
  const ruleColor = getBookRuleColor(book.coverColor);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSelect(book, rect);
  };

  return (
    <button
      type="button"
      data-testid={`spine-${book.id}`}
      data-active={isActive ? 'true' : 'false'}
      aria-label={`${book.title} by ${book.author}`}
      onMouseEnter={() => onFocusOrHover(book)}
      onFocus={() => onFocusOrHover(book)}
      onClick={handleClick}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: book.coverColor,
        backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 24%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.2) 100%), ${weaveOverlay}`,
        color: textColor,
      }}
      className="shelf-spine relative flex shrink-0 items-center justify-center overflow-hidden px-2 py-6 cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-[var(--foreground)] focus-visible:outline-offset-2"
    >
      {/* Top & bottom woven headband & debossed binding bands */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: ruleColor, opacity: 0.55 }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1.5 top-[14px] h-[1px]"
        style={{ backgroundColor: ruleColor }}
      />
      {(variant === 'double-rule' || variant === 'linen-frame') && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-1.5 top-[18px] h-[1px]"
          style={{ backgroundColor: ruleColor, opacity: 0.7 }}
        />
      )}
      {variant === 'atelier-grid' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[22px] h-1.5 w-1.5 -translate-x-1/2 rotate-45 border"
          style={{ borderColor: ruleColor }}
        />
      )}

      <span className="spine-title relative z-[1] max-h-[80%] overflow-hidden text-ellipsis whitespace-nowrap">
        {book.title}
      </span>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1.5 bottom-[14px] h-[1px]"
        style={{ backgroundColor: ruleColor }}
      />
      {(variant === 'double-rule' || variant === 'herringbone-arch') && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-1.5 bottom-[18px] h-[1px]"
          style={{ backgroundColor: ruleColor, opacity: 0.7 }}
        />
      )}
    </button>
  );
}
