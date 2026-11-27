import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search } from 'lucide-react';
import { SPINE_PALETTE, type Book, type BookStatus } from '../../types/models';
import { useLibraryStore } from '../../store/library';
import { useSettingsStore } from '../../store/settings';
import { useUiStore } from '../../store/ui';
import { processUploadedCoverFile } from '../../lib/pdf/cover';
import { lookupBookMetadata } from '../../lib/openLibrary';
import {
  collectLibraryTags,
  DEFAULT_GENRE_OPTIONS,
  mergeUniqueTags,
} from '../../lib/domain/tags';
import { Button } from '../shell/Button';
import { TagEditor } from '../shell/TagEditor';

interface EditBookModalProps {
  book: Book;
  open: boolean;
  onClose: () => void;
}

export function EditBookModal({ book, open, onClose }: EditBookModalProps) {
  const books = useLibraryStore((s) => s.books);
  const updateBook = useLibraryStore((s) => s.updateBook);
  const setBookStatus = useLibraryStore((s) => s.setBookStatus);
  const metadataLookup = useSettingsStore((s) => s.settings.metadataLookup);
  const showBanner = useUiStore((s) => s.showBanner);

  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [category, setCategory] = useState(book.category);
  const [status, setStatus] = useState<BookStatus>(book.status);
  const [tags, setTags] = useState<string[]>(book.tags ?? []);
  const [publishedYear, setPublishedYear] = useState(book.publishedYear ? String(book.publishedYear) : '');
  const [totalPages, setTotalPages] = useState(book.totalPages);
  const [synopsis, setSynopsis] = useState(book.synopsis ?? '');
  const [coverColor, setCoverColor] = useState(book.coverColor);
  const [coverDataUrl, setCoverDataUrl] = useState<string | undefined>(book.coverDataUrl);
  const [lookingUp, setLookingUp] = useState(false);

  const coverRef = useRef<HTMLInputElement>(null);

  const libraryTagSummary = useMemo(() => collectLibraryTags(books), [books]);
  const genreSuggestions = useMemo(
    () =>
      mergeUniqueTags([
        ...libraryTagSummary.genres.map((g) => g.tag),
        ...DEFAULT_GENRE_OPTIONS,
      ]).slice(0, 10),
    [libraryTagSummary]
  );
  const tagSuggestions = useMemo(
    () =>
      mergeUniqueTags([
        ...libraryTagSummary.customTags.map((t) => t.tag),
        'Classic',
        'Must Read',
        'Reference',
      ]),
    [libraryTagSummary]
  );

  useEffect(() => {
    if (open) {
      setTitle(book.title);
      setAuthor(book.author);
      setCategory(book.category);
      setStatus(book.status);
      setTags(book.tags ?? []);
      setPublishedYear(book.publishedYear ? String(book.publishedYear) : '');
      setTotalPages(book.totalPages);
      setSynopsis(book.synopsis ?? '');
      setCoverColor(book.coverColor);
      setCoverDataUrl(book.coverDataUrl);
    }
  }, [open, book]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleCoverFile = async (file: File) => {
    const res = await processUploadedCoverFile(file, title);
    setCoverDataUrl(res.coverDataUrl);
    setCoverColor(res.coverColor);
  };

  const handleLookup = async () => {
    setLookingUp(true);
    const res = await lookupBookMetadata(title, author);
    setLookingUp(false);
    if (!res) {
      showBanner('No matching Open Library metadata found.');
      return;
    }
    if (res.title) setTitle(res.title);
    if (res.author) setAuthor(res.author);
    if (res.category) setCategory(res.category);
    if (res.publishedYear) setPublishedYear(String(res.publishedYear));
    if (res.synopsis && !synopsis) setSynopsis(res.synopsis);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const yr = publishedYear.trim() ? Number(publishedYear.trim()) : undefined;
    await updateBook(book.id, {
      title: title.trim() || book.title,
      author: author.trim() || 'Unknown Author',
      category: category.trim() || 'General',
      tags,
      publishedYear: yr && Number.isFinite(yr) ? yr : undefined,
      totalPages: Math.max(1, Number(totalPages) || book.totalPages),
      synopsis: synopsis.trim() || undefined,
      coverColor,
      coverDataUrl,
    });
    if (status !== book.status) {
      await setBookStatus(book.id, status);
    }
    showBanner('Book details updated.');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(32,31,28,0.42)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-book-title"
    >
      <div className="animate-modal-in max-h-[90vh] w-full max-w-[620px] overflow-y-auto border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-between border-b border-[var(--border-soft)] pb-4">
          <h2
            id="edit-book-title"
            className="font-display text-3xl font-semibold text-[var(--foreground)]"
          >
            Edit Book Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit book dialog"
            className="inline-flex h-11 w-11 items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="edit-title"
                className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
              >
                TITLE
              </label>
              <input
                id="edit-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-11 w-full border border-[var(--border)] bg-[var(--paper)] px-3 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="edit-author"
                className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
              >
                AUTHOR
              </label>
              <input
                id="edit-author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="h-11 w-full border border-[var(--border)] bg-[var(--paper)] px-3 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="edit-category"
                className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
              >
                GENRE
              </label>
              <input
                id="edit-category"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-11 w-full border border-[var(--border)] bg-[var(--paper)] px-3 text-sm"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {genreSuggestions.slice(0, 6).map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => setCategory(genre)}
                    className={`border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] transition-colors cursor-pointer ${
                      category.trim().toLowerCase() === genre.toLowerCase()
                        ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--surface)]'
                        : 'border-[var(--border)] bg-[var(--background)] text-[var(--foreground-secondary)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 self-start">
              <div>
                <label
                  htmlFor="edit-year"
                  className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
                >
                  PUBLISHED
                </label>
                <input
                  id="edit-year"
                  type="number"
                  value={publishedYear}
                  onChange={(e) => setPublishedYear(e.target.value)}
                  className="h-11 w-full border border-[var(--border)] bg-[var(--paper)] px-3 text-sm tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-pages"
                  className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
                >
                  PAGES
                </label>
                <input
                  id="edit-pages"
                  type="number"
                  min={1}
                  value={totalPages}
                  onChange={(e) => setTotalPages(Math.max(1, Number(e.target.value) || 1))}
                  className="h-11 w-full border border-[var(--border)] bg-[var(--paper)] px-3 text-sm tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-[var(--border-soft)] pt-4">
            <div>
              <span className="editorial-label mb-2 block text-[var(--foreground-secondary)]">
                READING STATUS
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Book reading status">
                {(
                  [
                    { id: 'not-started', label: 'NOT STARTED' },
                    { id: 'ongoing', label: 'ONGOING' },
                    { id: 'completed', label: 'COMPLETED' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={status === item.id}
                    onClick={() => setStatus(item.id)}
                    className={`h-10 border px-3.5 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors cursor-pointer ${
                      status === item.id
                        ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--surface)]'
                        : 'border-[var(--border)] bg-[var(--paper)] text-[var(--foreground-secondary)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-book-tag-input"
                className="editorial-label mb-2 block text-[var(--foreground-secondary)]"
              >
                TAGS
              </label>
              <TagEditor
                inputId="edit-book-tag-input"
                tags={tags}
                onChange={setTags}
                suggestions={tagSuggestions}
                compact
              />
            </div>
          </div>

          {metadataLookup && (
            <div className="flex items-center justify-between border border-[var(--border-soft)] bg-[var(--background)] px-4 py-2">
              <span className="text-xs text-[var(--foreground-secondary)]">
                Lookup via Open Library (title & author only)
              </span>
              <Button
                variant="tertiary"
                onClick={() => void handleLookup()}
                disabled={lookingUp}
              >
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {lookingUp ? 'SEARCHING...' : 'FILL DETAILS'}
              </Button>
            </div>
          )}

          <div>
            <label
              htmlFor="edit-synopsis"
              className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
            >
              SYNOPSIS
            </label>
            <textarea
              id="edit-synopsis"
              rows={4}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              className="w-full border border-[var(--border)] bg-[var(--paper)] p-3 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-center">
            <div>
              <span className="editorial-label mb-2 block text-[var(--foreground-secondary)]">
                SPINE COLOR
              </span>
              <div className="flex flex-wrap gap-2">
                {SPINE_PALETTE.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Color ${hex}`}
                    onClick={() => setCoverColor(hex)}
                    className={`h-6 w-6 border ${
                      coverColor.toLowerCase() === hex.toLowerCase()
                        ? 'ring-2 ring-[var(--foreground)] ring-offset-2'
                        : 'border-[var(--border)]'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>

            <div>
              <span className="editorial-label mb-2 block text-[var(--foreground-secondary)]">
                COVER IMAGE
              </span>
              <input
                ref={coverRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleCoverFile(f);
                }}
              />
              <Button
                variant="secondary"
                className="h-10 px-4"
                onClick={() => coverRef.current?.click()}
              >
                REPLACE COVER
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 border-t border-[var(--border-soft)] pt-5">
            <Button variant="tertiary" onClick={onClose}>
              CANCEL
            </Button>
            <Button type="submit">SAVE CHANGES</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
