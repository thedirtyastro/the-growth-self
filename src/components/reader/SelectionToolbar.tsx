import { useEffect, useState } from 'react';
import type { HighlightColor } from '../../types/models';

interface SelectionToolbarProps {
  anchorRect: DOMRect;
  selectedColor?: HighlightColor;
  isExistingHighlight: boolean;
  onPickColor: (color: HighlightColor) => void;
  onAddNote: (noteText: string) => void;
  onCopy: () => void;
  onRemove?: () => void;
  onClose: () => void;
}

const COLORS: Array<{ id: HighlightColor; label: string; bg: string }> = [
  { id: 'yellow', label: 'Yellow highlight', bg: 'var(--hl-yellow)' },
  { id: 'pink', label: 'Pink highlight', bg: 'var(--hl-pink)' },
  { id: 'blue', label: 'Blue highlight', bg: 'var(--hl-blue)' },
  { id: 'green', label: 'Green highlight', bg: 'var(--hl-green)' },
];

export function SelectionToolbar({
  anchorRect,
  selectedColor,
  isExistingHighlight,
  onPickColor,
  onAddNote,
  onCopy,
  onRemove,
  onClose,
}: SelectionToolbarProps) {
  const [noteInputOpen, setNoteInputOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Position cleanly above the selection (or below if near top of viewport)
  const toolbarWidth = isExistingHighlight ? 310 : 260;
  const left = Math.max(
    12,
    Math.min(
      window.innerWidth - toolbarWidth - 12,
      anchorRect.left + anchorRect.width / 2 - toolbarWidth / 2
    )
  );
  const preferTop = anchorRect.top - 60;
  const top = preferTop < 70 ? anchorRect.bottom + 10 : preferTop;

  return (
    <div
      role="toolbar"
      aria-label="Highlight and note actions"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        boxShadow: '0 8px 20px rgba(32, 31, 28, 0.16)',
      }}
      className="fixed z-50 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 transition-opacity duration-[160ms]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2.5">
        {/* Four 26px color dots */}
        <div className="flex items-center gap-2">
          {COLORS.map((c) => {
            const active = selectedColor === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-label={c.label}
                aria-pressed={active}
                onClick={() => onPickColor(c.id)}
                style={{ backgroundColor: c.bg }}
                className={`h-[26px] w-[26px] rounded-full cursor-pointer transition-transform hover:scale-105 ${
                  active
                    ? 'ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--surface)]'
                    : 'border border-black/15'
                }`}
              />
            );
          })}
        </div>

        <span aria-hidden="true" className="h-5 w-[1px] bg-[var(--border)]" />

        <button
          type="button"
          onClick={() => setNoteInputOpen((v) => !v)}
          className="px-1.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--foreground)] hover:text-[var(--accent-hover)] cursor-pointer"
        >
          NOTE
        </button>

        <button
          type="button"
          onClick={onCopy}
          className="px-1.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--foreground)] hover:text-[var(--accent-hover)] cursor-pointer"
        >
          COPY
        </button>

        {isExistingHighlight && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="px-1.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[#8B3835] hover:underline cursor-pointer"
          >
            REMOVE
          </button>
        )}
      </div>

      {noteInputOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (noteText.trim()) {
              onAddNote(noteText.trim());
              setNoteText('');
              setNoteInputOpen(false);
            }
          }}
          className="mt-2.5 flex items-center gap-2 border-t border-[var(--border-soft)] pt-2"
        >
          <input
            type="text"
            autoFocus
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Write a note..."
            className="h-8 flex-1 border border-[var(--border)] bg-[var(--paper)] px-2.5 text-xs text-[var(--foreground)]"
          />
          <button
            type="submit"
            className="h-8 bg-[var(--foreground)] px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--surface)] cursor-pointer"
          >
            SAVE
          </button>
        </form>
      )}
    </div>
  );
}
