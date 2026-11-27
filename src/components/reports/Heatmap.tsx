import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { Book, ReadingSession } from '../../types/models';
import { buildHeatmapGrid, type HeatmapCell, type HeatmapLevel } from '../../lib/domain/heatmap';
import { Panel } from '../shell/Panel';

interface HeatmapProps {
  sessions: ReadingSession[];
  books: Book[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

const LEVEL_COLORS: Record<HeatmapLevel, string> = {
  0: 'var(--heat-0)',
  1: 'var(--heat-1)',
  2: 'var(--heat-2)',
  3: 'var(--heat-3)',
  4: 'var(--heat-4)',
};

export function Heatmap({
  sessions,
  books,
  selectedDate,
  onSelectDate,
}: HeatmapProps) {
  const { cells, months, activeDaysCount } = useMemo(
    () => buildHeatmapGrid(sessions, new Date()),
    [sessions]
  );

  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const bookMap = useMemo(() => {
    const map = new Map<string, Book>();
    for (const b of books) map.set(b.id, b);
    return map;
  }, [books]);

  // Determine readout cell: hovered > selected > most recent active cell
  const readoutCell = useMemo(() => {
    if (hoveredCell && !hoveredCell.isFuture) return hoveredCell;
    if (selectedDate) {
      const match = cells.find((c) => c.date === selectedDate && !c.isFuture);
      if (match) return match;
    }
    const active = [...cells]
      .reverse()
      .find((c) => !c.isFuture && c.minutes >= 1);
    return active ?? null;
  }, [hoveredCell, selectedDate, cells]);

  const formatReadout = (cell: HeatmapCell | null): string => {
    if (!cell || sessions.length === 0) {
      return 'Start reading to see your activity';
    }
    const dateLabel = format(parseISO(cell.date), 'MMMM d, yyyy').toUpperCase();
    if (cell.minutes === 0) {
      return `${dateLabel} · No reading logged`;
    }
    const topBookId = cell.aggregate?.books[0]?.bookId;
    const topBookTitle = topBookId ? bookMap.get(topBookId)?.title : undefined;
    const parts = [
      dateLabel,
      `${cell.minutes} ${cell.minutes === 1 ? 'minute' : 'minutes'} read`,
      `${cell.pagesRead} ${cell.pagesRead === 1 ? 'page' : 'pages'}`,
    ];
    if (topBookTitle) parts.push(topBookTitle);
    return parts.join(' · ');
  };

  return (
    <Panel
      label="READING ACTIVITY"
      rightSlot={
        <span className="editorial-label text-[var(--foreground-secondary)] tabular-nums">
          {activeDaysCount} {activeDaysCount === 1 ? 'DAY' : 'DAYS'} READ IN THE LAST YEAR
        </span>
      }
    >
      <div className="relative">
        <div className="subtle-scroll overflow-x-auto pb-2">
          <div className="min-w-[680px]">
            {/* Month labels row aligned with left weekday rail */}
            <div className="mb-2 flex items-center">
              <div className="w-9 shrink-0" />
              <div className="relative h-4 flex-1">
                {months.map((m) => (
                  <span
                    key={`${m.label}-${m.col}`}
                    style={{ left: `${m.percent}%` }}
                    className="absolute top-0 text-[11px] text-[var(--foreground-secondary)] whitespace-nowrap"
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Grid: Weekday rail + 52x7 SVG */}
            <div className="flex items-stretch gap-2">
              <div
                className="grid w-7 shrink-0 grid-rows-7 items-center text-[11px] text-[var(--foreground-secondary)]"
                aria-hidden="true"
              >
                <span />
                <span>Mon</span>
                <span />
                <span>Wed</span>
                <span />
                <span>Fri</span>
                <span />
              </div>

              <div className="flex-1" style={{ aspectRatio: '728 / 98' }}>
                <svg
                  viewBox="0 0 728 98"
                  className="h-full w-full overflow-visible"
                  role="grid"
                  aria-label="Reading activity heatmap for the last 52 weeks"
                >
                  {cells.map((cell) => {
                    if (cell.isFuture) return null;
                    const x = cell.col * 14;
                    const y = cell.row * 14;
                    const isSelected = selectedDate === cell.date;
                    const fill = LEVEL_COLORS[cell.level];

                    return (
                      <rect
                        key={cell.date}
                        x={x}
                        y={y}
                        width={11}
                        height={11}
                        rx={1}
                        fill={fill}
                        stroke={isSelected ? 'var(--foreground)' : 'none'}
                        strokeWidth={isSelected ? 1.5 : 0}
                        tabIndex={0}
                        role="gridcell"
                        aria-label={`${format(parseISO(cell.date), 'MMM d, yyyy')}: ${cell.minutes} minutes read, ${cell.pagesRead} pages`}
                        className="cursor-pointer transition-opacity duration-150 hover:opacity-85 focus:outline-none"
                        onClick={() => onSelectDate(cell.date)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectDate(cell.date);
                          }
                        }}
                        onMouseEnter={(e) => {
                          setHoveredCell(cell);
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
                        }}
                        onMouseLeave={() => {
                          setHoveredCell(null);
                          setTooltipPos(null);
                        }}
                      />
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Tooltip */}
        {hoveredCell && tooltipPos && (
          <div
            role="tooltip"
            style={{
              left: `${Math.min(window.innerWidth - 220, Math.max(16, tooltipPos.x - 95))}px`,
              top: `${Math.max(12, tooltipPos.y - 62)}px`,
            }}
            className="pointer-events-none fixed z-40 w-[200px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-md transition-opacity duration-[160ms]"
          >
            <p className="editorial-label text-[var(--foreground)]">
              {format(parseISO(hoveredCell.date), 'MMM d, yyyy')}
            </p>
            <p className="mt-0.5 text-xs text-[var(--foreground-secondary)] tabular-nums">
              {hoveredCell.minutes}m read · {hoveredCell.pagesRead} pages
            </p>
            {hoveredCell.aggregate?.books[0] && (
              <p className="mt-0.5 truncate text-xs text-[var(--foreground)]">
                {bookMap.get(hoveredCell.aggregate.books[0].bookId)?.title}
              </p>
            )}
          </div>
        )}

        {/* Bottom readout & legend */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-soft)] pt-4">
          <p className="text-xs text-[var(--foreground-secondary)] tabular-nums">
            {formatReadout(readoutCell)}
          </p>

          <div className="flex items-center gap-1.5" aria-label="Activity intensity scale">
            <span className="editorial-label mr-1 text-[var(--foreground-secondary)]">
              LESS
            </span>
            {([0, 1, 2, 3, 4] as HeatmapLevel[]).map((lvl) => (
              <span
                key={lvl}
                className="inline-block h-[11px] w-[11px]"
                style={{ backgroundColor: LEVEL_COLORS[lvl] }}
              />
            ))}
            <span className="editorial-label ml-1 text-[var(--foreground-secondary)]">
              MORE
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}
