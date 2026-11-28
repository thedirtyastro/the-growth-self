import { useMemo, useState } from 'react';
import type { Progress } from '../../types/models';
import { binPageStates, type PageMapBin } from '../../lib/domain/reading';

interface PageMapProps {
  progress: Progress;
}

const STATE_LABEL: Record<0 | 1 | 2, string> = {
  0: 'Unread',
  1: 'Skimmed',
  2: 'Read',
};

const STATE_COLOR: Record<0 | 1 | 2, string> = {
  0: 'var(--border-soft)',
  1: 'var(--border-strong)',
  2: 'var(--foreground)',
};

export function PageMap({ progress }: PageMapProps) {
  const bins = useMemo(() => binPageStates(progress, 300), [progress]);
  const [hovered, setHovered] = useState<PageMapBin | null>(null);

  const label = hovered
    ? hovered.startPage === hovered.endPage
      ? `Page ${hovered.startPage}: ${STATE_LABEL[hovered.state]}`
      : `Pages ${hovered.startPage}–${hovered.endPage}: ${hovered.readCount} read, ${hovered.skimmedCount} skimmed, ${hovered.unseenCount} unread`
    : null;

  return (
    <div className="relative w-full" data-testid="page-map">
      <div
        className="flex h-[3px] w-full overflow-hidden bg-[var(--border-soft)]"
        role="img"
        aria-label={`Page coverage map from page ${progress.contentStart} to ${progress.contentEnd}`}
      >
        {bins.map((bin) => (
          <div
            key={`${bin.startPage}-${bin.endPage}`}
            title={
              bin.startPage === bin.endPage
                ? `Page ${bin.startPage} · ${STATE_LABEL[bin.state]}`
                : `Pages ${bin.startPage}–${bin.endPage} · ${STATE_LABEL[bin.state]}`
            }
            onMouseEnter={() => setHovered(bin)}
            onMouseLeave={() => setHovered(null)}
            style={{
              flex: bin.endPage - bin.startPage + 1,
              backgroundColor: STATE_COLOR[bin.state],
            }}
            className="h-full transition-colors duration-150"
          />
        ))}
      </div>
      {label && (
        <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.11em] text-[var(--foreground-secondary)] tabular-nums">
          {label}
        </p>
      )}
    </div>
  );
}
