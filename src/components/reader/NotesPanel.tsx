import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { X, Trash2 } from 'lucide-react';
import type { Bookmark, Highlight, JournalEntry } from '../../types/models';
import { useLibraryStore } from '../../store/library';

interface NotesPanelProps {
  open: boolean;
  bookId: string;
  currentPage: number;
  bookmarks: Bookmark[];
  highlights: Highlight[];
  journalEntries: JournalEntry[];
  onNavigatePage: (page: number) => void;
  onClose: () => void;
}

type TabId = 'bookmarks' | 'notes' | 'highlights';

export function NotesPanel({
  open,
  bookId,
  currentPage,
  bookmarks,
  highlights,
  journalEntries,
  onNavigatePage,
  onClose,
}: NotesPanelProps) {
  const [tab, setTab] = useState<TabId>('highlights');
  const [newNote, setNewNote] = useState('');

  const addJournalEntry = useLibraryStore((s) => s.addJournalEntry);
  const removeHighlight = useLibraryStore((s) => s.removeHighlight);
  const removeBookmark = useLibraryStore((s) => s.removeBookmark);
  const removeJournalEntry = useLibraryStore((s) => s.removeJournalEntry);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleAddQuickNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    await addJournalEntry({
      bookId,
      pageNumber: currentPage,
      content: newNote.trim(),
    });
    setNewNote('');
  };

  return (
    <aside
      role="dialog"
      aria-label="Book notes, highlights, and bookmarks"
      className="fixed inset-y-0 right-0 z-40 flex w-full sm:w-[380px] flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-xl transition-transform duration-[280ms] ease-[var(--ease-standard)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-6 py-4">
        <span className="editorial-label text-[var(--foreground)]">ANNOTATIONS</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close annotations panel"
          className="inline-flex h-10 w-10 items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div role="tablist" className="grid grid-cols-3 border-b border-[var(--border)] px-6">
        {(
          [
            { id: 'bookmarks', label: `BOOKMARKS (${bookmarks.length})` },
            { id: 'notes', label: `NOTES (${journalEntries.length})` },
            { id: 'highlights', label: `HIGHLIGHTS (${highlights.length})` },
          ] as Array<{ id: TabId; label: string }>
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-11 text-[10px] font-medium uppercase tracking-[0.11em] border-b transition-colors cursor-pointer ${
              tab === t.id
                ? 'border-[var(--foreground)] text-[var(--foreground)]'
                : 'border-transparent text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Quick note composer on Notes tab */}
      {tab === 'notes' && (
        <form
          onSubmit={(e) => void handleAddQuickNote(e)}
          className="border-b border-[var(--border-soft)] p-5 space-y-2.5"
        >
          <label
            htmlFor="reader-quick-note"
            className="editorial-label block text-[var(--foreground-secondary)]"
          >
            NOTE ON PAGE {currentPage}
          </label>
          <textarea
            id="reader-quick-note"
            rows={2}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Write a reflection for this page..."
            className="w-full border border-[var(--border)] bg-[var(--paper)] p-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={!newNote.trim()}
            className="h-9 w-full bg-[var(--foreground)] text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--surface)] disabled:opacity-40 cursor-pointer"
          >
            SAVE NOTE
          </button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {tab === 'bookmarks' &&
          (bookmarks.length === 0 ? (
            <p className="text-sm text-[var(--foreground-secondary)]">
              No bookmarks yet. Press B or click BOOKMARK in the top bar.
            </p>
          ) : (
            bookmarks
              .slice()
              .sort((a, b) => a.pageNumber - b.pageNumber)
              .map((bm) => (
                <div
                  key={bm.id}
                  className="flex items-center justify-between border border-[var(--border-soft)] bg-[var(--paper)] p-3.5"
                >
                  <button
                    type="button"
                    onClick={() => onNavigatePage(bm.pageNumber)}
                    className="text-left flex-1 cursor-pointer"
                  >
                    <p className="editorial-label text-[var(--foreground)] tabular-nums">
                      PAGE {bm.pageNumber}
                    </p>
                    <p className="mt-1 text-xs text-[var(--foreground-secondary)]">
                      {bm.label} · {format(new Date(bm.createdAt), 'MMM d')}
                    </p>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove bookmark on page ${bm.pageNumber}`}
                    onClick={() => void removeBookmark(bm.id)}
                    className="p-2 text-[var(--foreground-secondary)] hover:text-[#8B3835] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
          ))}

        {tab === 'notes' &&
          (journalEntries.length === 0 ? (
            <p className="text-sm text-[var(--foreground-secondary)]">
              No notes recorded for this book yet.
            </p>
          ) : (
            journalEntries.map((entry) => (
              <div
                key={entry.id}
                className="border border-[var(--border-soft)] bg-[var(--paper)] p-4"
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onNavigatePage(entry.pageNumber)}
                    className="editorial-label text-[var(--foreground)] hover:underline cursor-pointer tabular-nums"
                  >
                    PAGE {entry.pageNumber}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete note"
                    onClick={() => void removeJournalEntry(entry.id)}
                    className="text-[var(--foreground-secondary)] hover:text-[#8B3835] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {entry.quote && (
                  <p className="mt-2 font-prose text-xs italic text-[var(--foreground-secondary)]">
                    &ldquo;{entry.quote}&rdquo;
                  </p>
                )}
                <p className="mt-2 text-sm leading-relaxed text-[var(--foreground)]">
                  {entry.content}
                </p>
                <p className="mt-2 text-[11px] text-[var(--foreground-secondary)]">
                  {format(new Date(entry.createdAt), 'MMM d, yyyy')}
                </p>
              </div>
            ))
          ))}

        {tab === 'highlights' &&
          (highlights.length === 0 ? (
            <p className="text-sm text-[var(--foreground-secondary)]">
              Select text on any page to highlight and tag ideas.
            </p>
          ) : (
            highlights
              .slice()
              .sort((a, b) => a.pageNumber - b.pageNumber)
              .map((hl) => (
                <div
                  key={hl.id}
                  className="border border-[var(--border-soft)] bg-[var(--paper)] p-4"
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onNavigatePage(hl.pageNumber)}
                      className="editorial-label text-[var(--foreground)] hover:underline cursor-pointer tabular-nums"
                    >
                      PAGE {hl.pageNumber}
                    </button>
                    <button
                      type="button"
                      aria-label="Delete highlight"
                      onClick={() => void removeHighlight(hl.id)}
                      className="text-[var(--foreground-secondary)] hover:text-[#8B3835] cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigatePage(hl.pageNumber)}
                    className="mt-2 block text-left font-prose text-sm leading-relaxed text-[var(--foreground)] cursor-pointer"
                  >
                    &ldquo;{hl.text}&rdquo;
                  </button>
                  {hl.note && (
                    <p className="mt-2 text-xs text-[var(--foreground-secondary)]">
                      {hl.note}
                    </p>
                  )}
                  {hl.keywords.length > 0 && (
                    <p className="mt-2 text-[11px] text-[var(--foreground-secondary)]">
                      {hl.keywords.slice(0, 4).join(' · ')}
                    </p>
                  )}
                </div>
              ))
          ))}
      </div>
    </aside>
  );
}
