import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Book } from '../../types/models';
import { useUiStore } from '../../store/ui';
import { Spine } from './Spine';
import { BookCaption } from './BookCaption';

interface ShelfProps {
  books: Book[];
  showCaption?: boolean;
}

export function Shelf({ books, showCaption = true }: ShelfProps) {
  const navigate = useNavigate();
  const setOpeningTransition = useUiStore((s) => s.setOpeningTransition);
  const shelfContainerRef = useRef<HTMLDivElement>(null);

  // Default book shown: the most recently read ongoing book, else first ongoing, else first book
  const defaultBookId = useMemo(() => {
    const ongoing = books
      .filter((b) => b.status === 'ongoing')
      .sort((a, b) => (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? ''));
    if (ongoing.length > 0) return ongoing[0].id;
    return books[0]?.id ?? '';
  }, [books]);

  const [activeId, setActiveId] = useState<string>(defaultBookId);

  useEffect(() => {
    if (!books.some((b) => b.id === activeId)) {
      setActiveId(defaultBookId);
    }
  }, [books, activeId, defaultBookId]);

  const activeBook = books.find((b) => b.id === activeId) ?? books[0];

  const handleOpenBook = (book: Book, rect?: DOMRect) => {
    const fallbackRect = rect ?? {
      left: window.innerWidth / 2 - 40,
      top: window.innerHeight / 2 - 160,
      width: 80,
      height: 320,
    };

    setOpeningTransition({
      bookId: book.id,
      coverColor: book.coverColor,
      sourceRect: {
        left: fallbackRect.left,
        top: fallbackRect.top,
        width: fallbackRect.width,
        height: fallbackRect.height,
      },
      isFirstOpen: book.status === 'not-started',
    });

    navigate(`/read/${book.id}`);
  };

  return (
    <div className="w-full">
      <div
        ref={shelfContainerRef}
        className="subtle-scroll w-full overflow-x-auto pt-9 pb-4"
      >
        <div className="w-full min-w-full">
          <div
            className="flex w-max min-w-full items-end justify-start gap-[5px] pl-1 pr-6"
            role="list"
            aria-label="Books on shelf"
          >
            {books.map((book) => (
              <div key={book.id} role="listitem">
                <Spine
                  book={book}
                  isActive={activeBook?.id === book.id}
                  onFocusOrHover={(b) => setActiveId(b.id)}
                  onSelect={(b, rect) => handleOpenBook(b, rect)}
                />
              </div>
            ))}
          </div>

          {/* 14px horizontal wooden/stone shelf plank */}
          <div
            aria-hidden="true"
            className="h-[14px] w-full"
            style={{
              background: 'linear-gradient(#CFCBC2, #BDB9B1)',
              boxShadow: '0 16px 24px -10px rgba(32, 31, 28, 0.35)',
            }}
          />
        </div>
      </div>

      {showCaption && activeBook && (
        <BookCaption
          book={activeBook}
          onRead={(b) => {
            const el = shelfContainerRef.current?.querySelector(
              `[data-testid="spine-${b.id}"]`
            ) as HTMLElement | null;
            handleOpenBook(b, el?.getBoundingClientRect());
          }}
        />
      )}
    </div>
  );
}
