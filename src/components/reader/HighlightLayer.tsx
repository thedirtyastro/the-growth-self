import type { Highlight, HighlightColor } from '../../types/models';

interface HighlightLayerProps {
  highlights: Highlight[];
  onSelectHighlight: (highlight: Highlight, anchorRect: DOMRect) => void;
}

const HL_BG: Record<HighlightColor, string> = {
  yellow: 'var(--hl-yellow)',
  pink: 'var(--hl-pink)',
  blue: 'var(--hl-blue)',
  green: 'var(--hl-green)',
};

export function HighlightLayer({
  highlights,
  onSelectHighlight,
}: HighlightLayerProps) {
  if (highlights.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[3]">
      {highlights.map((hl) =>
        hl.rects.map((rect, idx) => (
          <button
            key={`${hl.id}-${idx}`}
            type="button"
            aria-label={`Highlight: ${hl.text.slice(0, 40)}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectHighlight(hl, e.currentTarget.getBoundingClientRect());
            }}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
              backgroundColor: HL_BG[hl.color],
              opacity: 0.45,
            }}
            className="pdf-highlight-rect pointer-events-auto absolute cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--foreground)]"
          />
        ))
      )}
    </div>
  );
}
