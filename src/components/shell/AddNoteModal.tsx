import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useUiStore } from '../../store/ui';
import { useLibraryStore } from '../../store/library';
import { Button } from './Button';

export function AddNoteModal() {
  const bookId = useUiStore((s) => s.noteModalBookId);
  const initialPage = useUiStore((s) => s.noteModalPage);
  const initialQuote = useUiStore((s) => s.noteModalQuote);
  const close = useUiStore((s) => s.closeNoteModal);
  const showBanner = useUiStore((s) => s.showBanner);

  const books = useLibraryStore((s) => s.books);
  const addJournalEntry = useLibraryStore((s) => s.addJournalEntry);

  const [selectedBookId, setSelectedBookId] = useState(bookId ?? '');
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [quote, setQuote] = useState(initialQuote);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bookId) {
      setSelectedBookId(bookId === 'choose' ? books[0]?.id ?? '' : bookId);
      setPageNumber(initialPage || 1);
      setQuote(initialQuote || '');
      setContent('');
      setError(null);
    }
  }, [bookId, initialPage, initialQuote, books]);

  useEffect(() => {
    if (!bookId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bookId, close]);

  if (!bookId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookId) {
      setError('Please select a book.');
      return;
    }
    if (!content.trim()) {
      setError('Please write a note before saving.');
      return;
    }
    await addJournalEntry({
      bookId: selectedBookId,
      pageNumber: Math.max(1, pageNumber),
      quote: quote.trim() || undefined,
      content: content.trim(),
    });
    showBanner('Note saved to journal.');
    close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(32,31,28,0.42)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-note-heading"
    >
      <div className="w-full max-w-[540px] border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-between border-b border-[var(--border-soft)] pb-4">
          <div>
            <p className="editorial-label text-[var(--foreground-secondary)]">
              READING JOURNAL
            </p>
            <h2
              id="add-note-heading"
              className="mt-1 font-display text-3xl font-semibold text-[var(--foreground)]"
            >
              Add Reflection
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close note dialog"
            className="inline-flex h-11 w-11 items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label
                htmlFor="note-book"
                className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
              >
                BOOK
              </label>
              <select
                id="note-book"
                value={selectedBookId}
                onChange={(e) => setSelectedBookId(e.target.value)}
                className="h-11 w-full border border-[var(--border)] bg-[var(--paper)] px-3 text-sm text-[var(--foreground)]"
              >
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="note-page"
                className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
              >
                PAGE
              </label>
              <input
                id="note-page"
                type="number"
                min={1}
                value={pageNumber}
                onChange={(e) => setPageNumber(Math.max(1, Number(e.target.value) || 1))}
                className="h-11 w-full border border-[var(--border)] bg-[var(--paper)] px-3 text-sm text-[var(--foreground)] tabular-nums"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="note-quote"
              className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
            >
              PASSAGE OR QUOTE (OPTIONAL)
            </label>
            <textarea
              id="note-quote"
              rows={2}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              placeholder="A passage worth remembering..."
              className="w-full border border-[var(--border)] bg-[var(--paper)] p-3 font-prose text-sm text-[var(--foreground)]"
            />
          </div>

          <div>
            <label
              htmlFor="note-content"
              className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
            >
              YOUR NOTE
            </label>
            <textarea
              id="note-content"
              rows={4}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your reflection, question, or takeaway..."
              className="w-full border border-[var(--border)] bg-[var(--paper)] p-3 text-sm text-[var(--foreground)]"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[#8B3835]">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-4 border-t border-[var(--border-soft)] pt-5">
            <Button variant="tertiary" onClick={close}>
              CANCEL
            </Button>
            <Button type="submit">SAVE NOTE</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
