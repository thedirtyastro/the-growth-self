import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Book,
  Highlight,
  ReaderAppearance,
  Rect,
} from '../../types/models';
import {
  getQualityScale,
  type PdfRenderQueue,
  type RenderedPageResult,
} from '../../lib/pdf/renderQueue';
import { useSettingsStore } from '../../store/settings';
import { HighlightLayer } from './HighlightLayer';
import { TextLayer } from './TextLayer';

import {
  getBookPatternVariant,
  getBookRuleColor,
  getBookclothCssOverlay,
} from '../../lib/bookTextures';

interface FlatReaderProps {
  book: Book;
  renderQueue: PdfRenderQueue;
  currentPage: number;
  totalPages: number;
  isSpread: boolean;
  isFullscreen?: boolean;
  highlights: Highlight[];
  areaHighlightMode: boolean;
  onTextLayerDetected: (hasText: boolean) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onTextSelected: (payload: {
    pageNumber: number;
    text: string;
    rects: Rect[];
    anchorRect: DOMRect;
  }) => void;
  onAreaSelected: (payload: {
    pageNumber: number;
    rects: Rect[];
    anchorRect: DOMRect;
  }) => void;
  onSelectHighlight: (highlight: Highlight, anchorRect: DOMRect) => void;
  onSettledChange?: (settled: boolean) => void;
}

const PAPER_BG: Record<ReaderAppearance, string> = {
  white: '#FFFFFF',
  warm: '#FFFDF8',
  cream: '#FAF3E3',
};

interface PageCanvasViewProps {
  pageNumber: number;
  rendered?: RenderedPageResult;
  paperBg: string;
  highlights: Highlight[];
  areaHighlightMode: boolean;
  side: 'left' | 'right' | 'single';
  onTextSelected: FlatReaderProps['onTextSelected'];
  onAreaSelected: FlatReaderProps['onAreaSelected'];
  onSelectHighlight: FlatReaderProps['onSelectHighlight'];
  onCornerNext?: () => void;
  onCornerPrev?: () => void;
}

function PageCanvasView({
  pageNumber,
  rendered,
  paperBg,
  highlights,
  areaHighlightMode,
  side,
  onTextSelected,
  onAreaSelected,
  onSelectHighlight,
  onCornerNext,
  onCornerPrev,
}: PageCanvasViewProps) {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const [curlHover, setCurlHover] = useState(false);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    host.innerHTML = '';
    if (rendered) {
      const displayCanvas = rendered.canvas;
      displayCanvas.style.width = '100%';
      displayCanvas.style.height = '100%';
      displayCanvas.style.display = 'block';
      host.appendChild(displayCanvas);
    }
  }, [rendered]);

  const aspect = rendered?.aspectRatio ?? 0.707;

  return (
    <div
      className="relative flex-1 overflow-hidden select-none"
      style={{
        backgroundColor: paperBg,
        aspectRatio: String(aspect),
        containerType: 'size',
      }}
    >
      {/* Rendered PDF Bitmap */}
      <div
        ref={canvasHostRef}
        className="h-full w-full pointer-events-none"
        style={{
          filter:
            paperBg === '#FAF3E3'
              ? 'sepia(0.08)'
              : paperBg === '#FFFDF8'
                ? 'sepia(0.02)'
                : 'none',
        }}
      />

      {/* Loading shimmer if page hasn't arrived yet */}
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="editorial-label text-[var(--foreground-secondary)]">
            RENDERING PAGE {pageNumber}...
          </span>
        </div>
      )}

      {/* Spine gutter shadow (48px) */}
      {side === 'left' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-12 z-[4]"
          style={{
            background:
              'linear-gradient(to right, rgba(32,31,28,0), rgba(32,31,28,0.13))',
          }}
        />
      )}
      {side === 'right' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-12 z-[4]"
          style={{
            background:
              'linear-gradient(to left, rgba(32,31,28,0), rgba(32,31,28,0.13))',
          }}
        />
      )}

      {/* Highlights & Text Selection */}
      <HighlightLayer
        highlights={highlights}
        onSelectHighlight={onSelectHighlight}
      />

      {rendered && (
        <TextLayer
          pageNumber={pageNumber}
          textItems={rendered.textItems}
          hasTextLayer={rendered.hasTextLayer}
          areaMode={areaHighlightMode}
          onTextSelected={onTextSelected}
          onAreaSelected={onAreaSelected}
        />
      )}

      {/* 72px lower-right corner curl affordance on hover */}
      {side !== 'left' && onCornerNext && (
        <button
          type="button"
          aria-label="Turn to next page"
          onMouseEnter={() => setCurlHover(true)}
          onMouseLeave={() => setCurlHover(false)}
          onClick={onCornerNext}
          className="absolute bottom-0 right-0 z-[5] h-[72px] w-[72px] cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--foreground)]"
        >
          <span
            aria-hidden="true"
            className="block h-full w-full transition-opacity duration-200"
            style={{
              opacity: curlHover ? 1 : 0.45,
              background:
                'linear-gradient(135deg, transparent 50%, rgba(32,31,28,0.08) 51%, #EDE8DC 55%, #F7F4EB 100%)',
              boxShadow: curlHover ? '-4px -4px 10px rgba(32,31,28,0.14)' : 'none',
            }}
          />
        </button>
      )}

      {/* Outer edge tap targets for turning pages */}
      {side !== 'left' && onCornerNext && (
        <button
          type="button"
          aria-label="Next page edge"
          onClick={onCornerNext}
          className="absolute inset-y-0 right-0 bottom-[72px] z-[4] w-9 cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
          style={{
            background: 'linear-gradient(to left, rgba(32,31,28,0.05), transparent)',
          }}
        />
      )}
      {side !== 'right' && onCornerPrev && (
        <button
          type="button"
          aria-label="Turn to previous page"
          onClick={onCornerPrev}
          className="absolute inset-y-0 left-0 z-[5] w-9 cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
          style={{
            background: 'linear-gradient(to right, rgba(32,31,28,0.05), transparent)',
          }}
        />
      )}
    </div>
  );
}

export function FlatReader({
  book,
  renderQueue,
  currentPage,
  totalPages,
  isSpread,
  isFullscreen = false,
  highlights,
  areaHighlightMode,
  onTextLayerDetected,
  onPrevPage,
  onNextPage,
  onTextSelected,
  onAreaSelected,
  onSelectHighlight,
  onSettledChange,
}: FlatReaderProps) {
  const settings = useSettingsStore((s) => s.settings);
  const [renderedPages, setRenderedPages] = useState<Record<number, RenderedPageResult>>({});
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const prevPageRef = useRef<number>(currentPage);
  const [flipSweep, setFlipSweep] = useState<'forward' | 'backward' | null>(null);

  useEffect(() => {
    const prev = prevPageRef.current;
    prevPageRef.current = currentPage;
    if (prev === currentPage || settings.animation === 'off') {
      onSettledChange?.(true);
      return;
    }
    onSettledChange?.(false);
    setFlipSweep(currentPage > prev ? 'forward' : 'backward');
    const timer = window.setTimeout(() => {
      setFlipSweep(null);
      onSettledChange?.(true);
    }, 320);
    return () => clearTimeout(timer);
  }, [currentPage, settings.animation, onSettledChange]);

  const leftPageNum = isSpread ? (currentPage % 2 === 0 ? currentPage - 1 : currentPage) : currentPage;
  const rightPageNum = isSpread && leftPageNum + 1 <= totalPages ? leftPageNum + 1 : null;

  const zoomFactor = settings.textZoom / 100;
  const targetScale = getQualityScale(settings.quality, Math.min(1.5, zoomFactor));

  useEffect(() => {
    let active = true;
    const needed = new Set<number>([leftPageNum]);
    if (rightPageNum) needed.add(rightPageNum);
    renderQueue.cancelExcept(needed);

    const loadCurrent = async () => {
      try {
        const tasks: Array<Promise<RenderedPageResult>> = [
          renderQueue.renderPage(leftPageNum, targetScale),
        ];
        if (rightPageNum) {
          tasks.push(renderQueue.renderPage(rightPageNum, targetScale));
        }
        const results = await Promise.all(tasks);
        if (!active) return;

        setRenderedPages((prev) => {
          const next = { ...prev };
          for (const res of results) {
            next[res.pageNumber] = res;
          }
          return next;
        });

        onTextLayerDetected(results.some((r) => r.hasTextLayer));

        // Preload adjacent pages at lighter scale
        const neighbors = [
          leftPageNum - 1,
          leftPageNum - 2,
          (rightPageNum ?? leftPageNum) + 1,
          (rightPageNum ?? leftPageNum) + 2,
        ].filter((p) => p >= 1 && p <= totalPages);

        for (const np of neighbors) {
          void renderQueue.renderPage(np, 1.0, { skipText: true }).catch(() => {});
        }
      } catch {
        // Cancelled or failed individual render
      }
    };

    void loadCurrent();
    return () => {
      active = false;
    };
  }, [leftPageNum, rightPageNum, totalPages, targetScale, renderQueue, onTextLayerDetected]);

  const leftHighlights = useMemo(
    () => highlights.filter((h) => h.pageNumber === leftPageNum),
    [highlights, leftPageNum]
  );
  const rightHighlights = useMemo(
    () => (rightPageNum ? highlights.filter((h) => h.pageNumber === rightPageNum) : []),
    [highlights, rightPageNum]
  );

  // Page edge thickness reflects progress
  const progressRatio = Math.max(0.1, Math.min(1, currentPage / Math.max(1, totalPages)));
  const leftEdgeStyle =
    leftPageNum > 1
      ? `-3px 0 0 var(--paper-edge), -6px 0 0 var(--paper)${
          progressRatio > 0.35 ? ', -9px 0 0 var(--paper-edge)' : ''
        }`
      : 'none';
  const rightEdgeStyle =
    (rightPageNum ?? leftPageNum) < totalPages
      ? `3px 0 0 var(--paper-edge), 6px 0 0 var(--paper)${
          progressRatio < 0.75 ? ', 9px 0 0 var(--paper-edge)' : ''
        }`
      : 'none';

  const paperBg = PAPER_BG[settings.appearance];
  const spreadScale =
    settings.textZoom === 100
      ? 1
      : settings.textZoom === 125
        ? 1.12
        : settings.textZoom === 150
          ? 1.24
          : 1.38;

  const pageAspect = renderedPages[leftPageNum]?.aspectRatio ?? 0.707;
  const spreadAspect = isSpread ? pageAspect * 2 : pageAspect;
  const maxHeightVh = isFullscreen ? 94 : settings.textZoom > 100 ? 84 : 76;
  const maxVw = isFullscreen ? (isSpread ? '97vw' : '96vw') : isSpread ? '88vw' : '92vw';
  const maxBasePx = isFullscreen
    ? Math.round((isSpread ? 1480 : 780) * spreadScale)
    : Math.round((isSpread ? 1080 : 560) * spreadScale);
  const patternVariant = getBookPatternVariant(book.id);
  const clothWeave = getBookclothCssOverlay(patternVariant);
  const clothRule = getBookRuleColor(book.coverColor);

  return (
    <div
      data-testid="flat-reader"
      className={`flex min-h-screen w-full items-center justify-center overflow-auto ${
        isFullscreen ? 'p-2 md:p-4' : 'px-4 py-14 md:px-10'
      }`}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchStartRef.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        if (!touchStartRef.current) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartRef.current.x;
        const dy = t.clientY - touchStartRef.current.y;
        touchStartRef.current = null;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (dx < 0) onNextPage();
          else onPrevPage();
        }
      }}
    >
      {/* Hardcover Outer Board with Bookcloth Weave */}
      <div
        className="relative box-border shrink-0 transition-all duration-300"
        style={{
          width: `min(${maxVw}, ${maxBasePx}px, calc(${maxHeightVh}vh * ${spreadAspect.toFixed(4)} + 18px))`,
          backgroundColor: book.coverColor,
          backgroundImage: clothWeave,
          padding: isFullscreen ? '7px' : '9px',
          borderRadius: '3px',
          border: `1px solid ${clothRule}`,
          boxShadow: isFullscreen
            ? '0 20px 44px -16px rgba(32, 31, 28, 0.3)'
            : '0 26px 48px -18px rgba(32, 31, 28, 0.35)',
        }}
      >
        <div
          className="relative flex w-full overflow-hidden"
          style={{
            boxShadow: `${leftEdgeStyle !== 'none' ? leftEdgeStyle : ''}${
              leftEdgeStyle !== 'none' && rightEdgeStyle !== 'none' ? ', ' : ''
            }${rightEdgeStyle !== 'none' ? rightEdgeStyle : ''}`,
          }}
        >
          {/* Tactile leaf sweep overlay during page flip */}
          {flipSweep && (
            <div
              key={`${flipSweep}-${currentPage}`}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-20 w-1/2"
              style={{
                left: flipSweep === 'forward' ? '50%' : '0%',
                transformOrigin: flipSweep === 'forward' ? 'left center' : 'right center',
                background:
                  'linear-gradient(90deg, rgba(255,253,248,0.85), rgba(232,225,213,0.45))',
                boxShadow: '0 0 28px rgba(32, 31, 28, 0.22)',
                animation:
                  flipSweep === 'forward'
                    ? 'flat-flip-forward 300ms cubic-bezier(0.2, 0, 0, 1) forwards'
                    : 'flat-flip-backward 300ms cubic-bezier(0.2, 0, 0, 1) forwards',
              }}
            />
          )}
          <PageCanvasView
            pageNumber={leftPageNum}
            rendered={renderedPages[leftPageNum]}
            paperBg={paperBg}
            highlights={leftHighlights}
            areaHighlightMode={areaHighlightMode}
            side={isSpread ? 'left' : 'single'}
            onTextSelected={onTextSelected}
            onAreaSelected={onAreaSelected}
            onSelectHighlight={onSelectHighlight}
            onCornerPrev={currentPage > 1 ? onPrevPage : undefined}
            onCornerNext={!isSpread && currentPage < totalPages ? onNextPage : undefined}
          />

          {isSpread && rightPageNum && (
            <PageCanvasView
              pageNumber={rightPageNum}
              rendered={renderedPages[rightPageNum]}
              paperBg={paperBg}
              highlights={rightHighlights}
              areaHighlightMode={areaHighlightMode}
              side="right"
              onTextSelected={onTextSelected}
              onAreaSelected={onAreaSelected}
              onSelectHighlight={onSelectHighlight}
              onCornerNext={rightPageNum < totalPages ? onNextPage : undefined}
            />
          )}

          {isSpread && !rightPageNum && (
            <div
              className="flex-1 flex items-center justify-center"
              style={{
                backgroundColor: paperBg,
                aspectRatio: String(renderedPages[leftPageNum]?.aspectRatio ?? 0.707),
              }}
            >
              <span className="editorial-label text-[var(--foreground-secondary)]">
                END OF VOLUME
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
