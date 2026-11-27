import { useRef, useState } from 'react';
import type { Rect } from '../../types/models';
import type { TextSpanItem } from '../../lib/pdf/renderQueue';

interface TextLayerProps {
  pageNumber: number;
  textItems: TextSpanItem[];
  hasTextLayer: boolean;
  areaMode: boolean;
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
}

export function TextLayer({
  pageNumber,
  textItems,
  hasTextLayer,
  areaMode,
  onTextSelected,
  onAreaSelected,
}: TextLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  const handleMouseUp = () => {
    if (areaMode) return;
    const container = containerRef.current;
    const sel = window.getSelection();
    if (!container || !sel || sel.isCollapsed) return;

    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    const containerRect = container.getBoundingClientRect();
    if (containerRect.width <= 0 || containerRect.height <= 0) return;

    const rawRects = Array.from(range.getClientRects()).filter(
      (r) => r.width > 1 && r.height > 1
    );
    if (rawRects.length === 0) return;

    // Merge rects that lie on the same line to avoid fragmented boxes
    const normalizedRects: Rect[] = [];
    for (const r of rawRects) {
      const nx = Math.max(0, Math.min(1, (r.left - containerRect.left) / containerRect.width));
      const ny = Math.max(0, Math.min(1, (r.top - containerRect.top) / containerRect.height));
      const nw = Math.max(0.005, Math.min(1 - nx, r.width / containerRect.width));
      const nh = Math.max(0.008, Math.min(1 - ny, r.height / containerRect.height));

      const prev = normalizedRects[normalizedRects.length - 1];
      if (prev && Math.abs(prev.y - ny) < 0.012 && Math.abs(prev.height - nh) < 0.015) {
        const right = Math.max(prev.x + prev.width, nx + nw);
        prev.x = Math.min(prev.x, nx);
        prev.width = right - prev.x;
        prev.height = Math.max(prev.height, nh);
      } else {
        normalizedRects.push({ x: nx, y: ny, width: nw, height: nh });
      }
    }

    const bounding = range.getBoundingClientRect();
    onTextSelected({
      pageNumber,
      text,
      rects: normalizedRects,
      anchorRect: bounding,
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!areaMode || !containerRef.current) return;
    e.stopPropagation();
    const bounds = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height));
    setDragStart({ x, y });
    setDragCurrent({ x, y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!areaMode || !dragStart || !containerRef.current) return;
    const bounds = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height));
    setDragCurrent({ x, y });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!areaMode || !dragStart || !dragCurrent || !containerRef.current) return;
    const bounds = containerRef.current.getBoundingClientRect();
    const x = Math.min(dragStart.x, dragCurrent.x);
    const y = Math.min(dragStart.y, dragCurrent.y);
    const width = Math.abs(dragCurrent.x - dragStart.x);
    const height = Math.abs(dragCurrent.y - dragStart.y);

    setDragStart(null);
    setDragCurrent(null);

    if (width < 0.02 || height < 0.015) return;

    const anchorRect = new DOMRect(
      bounds.left + x * bounds.width,
      bounds.top + y * bounds.height,
      width * bounds.width,
      height * bounds.height
    );

    onAreaSelected({
      pageNumber,
      rects: [{ x, y, width, height }],
      anchorRect,
    });
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const previewRect =
    dragStart && dragCurrent
      ? {
          x: Math.min(dragStart.x, dragCurrent.x),
          y: Math.min(dragStart.y, dragCurrent.y),
          w: Math.abs(dragCurrent.x - dragStart.x),
          h: Math.abs(dragCurrent.y - dragStart.y),
        }
      : null;

  return (
    <div
      ref={containerRef}
      data-testid={`text-layer-${pageNumber}`}
      onMouseUp={handleMouseUp}
      onTouchEnd={handleMouseUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`pdf-text-layer ${areaMode ? 'cursor-crosshair' : ''}`}
    >
      {!areaMode &&
        hasTextLayer &&
        textItems.map((item, idx) => (
          <span
            key={idx}
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              fontSize: `calc(${item.fontSize * 100}cqh)`,
              width: `${item.width * 100}%`,
              height: `${item.height * 100}%`,
              transform: item.angle ? `rotate(${item.angle}rad)` : undefined,
            }}
          >
            {item.str}
          </span>
        ))}

      {previewRect && (
        <div
          className="pointer-events-none absolute border border-[var(--accent)] bg-[var(--hl-yellow)]/40"
          style={{
            left: `${previewRect.x * 100}%`,
            top: `${previewRect.y * 100}%`,
            width: `${previewRect.w * 100}%`,
            height: `${previewRect.h * 100}%`,
          }}
        />
      )}
    </div>
  );
}
