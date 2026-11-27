import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, BookOpen, Search } from 'lucide-react';
import { useUiStore } from '../../store/ui';
import { useLibraryStore } from '../../store/library';
import { useSettingsStore } from '../../store/settings';
import { inspectPdfFile } from '../../lib/pdf/loader';
import { processUploadedCoverFile, pickFallbackSpineColor } from '../../lib/pdf/cover';
import { lookupBookMetadata } from '../../lib/openLibrary';
import {
  collectLibraryTags,
  DEFAULT_GENRE_OPTIONS,
  mergeUniqueTags,
} from '../../lib/domain/tags';
import { SPINE_PALETTE, type BookStatus } from '../../types/models';
import { Button } from './Button';
import { ProgressLine } from './ProgressLine';
import { TagEditor } from './TagEditor';

type AddMode = 'pdf' | 'manual';

export function AddBookModal() {
  const open = useUiStore((s) => s.addBookOpen);
  const close = useUiStore((s) => s.closeAddBook);
  const showBanner = useUiStore((s) => s.showBanner);
  const books = useLibraryStore((s) => s.books);
  const addBook = useLibraryStore((s) => s.addBook);
  const metadataLookup = useSettingsStore((s) => s.settings.metadataLookup);

  const [mode, setMode] = useState<AddMode>('pdf');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepProgress, setPrepProgress] = useState(0);
  const [prepStage, setPrepStage] = useState('Extracting pages...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('Discipline');
  const [status, setStatus] = useState<BookStatus>('not-started');
  const [tags, setTags] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(240);
  const [publishedYear, setPublishedYear] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [coverDataUrl, setCoverDataUrl] = useState<string | undefined>(undefined);
  const [coverColor, setCoverColor] = useState<string>(SPINE_PALETTE[0]);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);

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
        'Deep Reading',
      ]),
    [libraryTagSummary]
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const resetForm = () => {
    setMode('pdf');
    setPdfFile(null);
    setPreparing(false);
    setPrepProgress(0);
    setPrepStage('Extracting pages...');
    setErrorMsg(null);
    setTitle('');
    setAuthor('');
    setCategory('Discipline');
    setStatus('not-started');
    setTags([]);
    setTotalPages(240);
    setPublishedYear('');
    setSynopsis('');
    setCoverDataUrl(undefined);
    setCoverColor(SPINE_PALETTE[0]);
    setSaving(false);
  };

  const handleClose = () => {
    resetForm();
    close();
  };

  const handlePdfSelected = async (file: File) => {
    setErrorMsg(null);
    setPdfFile(file);
    setPreparing(true);
    setPrepProgress(0.08);
    setPrepStage('Extracting pages...');

    try {
      const info = await inspectPdfFile(file, file.name, (p, stage) => {
        setPrepProgress(Math.round(p * 100));
        setPrepStage(stage);
      });
      setTitle(info.title);
      setAuthor(info.author);
      setTotalPages(info.totalPages);
      setCoverDataUrl(info.coverDataUrl);
      setCoverColor(info.coverColor);
      setPreparing(false);
    } catch (err) {
      console.error('PDF import inspection error:', err);
      setPreparing(false);
      setErrorMsg('Could not inspect this PDF. Please verify the file is a valid PDF.');
    }
  };

  const handleCoverSelected = async (file: File) => {
    try {
      const result = await processUploadedCoverFile(file, title || file.name);
      setCoverDataUrl(result.coverDataUrl);
      setCoverColor(result.coverColor);
    } catch {
      setErrorMsg('Could not read the selected cover image.');
    }
  };

  const handleOpenLibraryLookup = async () => {
    if (!title.trim()) return;
    setLookingUp(true);
    const result = await lookupBookMetadata(title, author);
    setLookingUp(false);
    if (!result) {
      showBanner('No matching Open Library record found.');
      return;
    }
    if (result.title) setTitle(result.title);
    if (result.author) setAuthor(result.author);
    if (result.publishedYear) setPublishedYear(String(result.publishedYear));
    if (result.category) setCategory(result.category);
    if (result.synopsis && !synopsis) setSynopsis(result.synopsis);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Please enter a book title.');
      return;
    }
    if (mode === 'pdf' && !pdfFile) {
      setErrorMsg('Please choose a PDF file to add.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const parsedYear = publishedYear.trim() ? Number(publishedYear.trim()) : undefined;
      await addBook({
        title: title.trim(),
        author: author.trim() || 'Unknown Author',
        category: category.trim() || 'General',
        tags,
        status,
        totalPages: Math.max(1, Number(totalPages) || 1),
        synopsis: synopsis.trim() || undefined,
        publishedYear: parsedYear && Number.isFinite(parsedYear) ? parsedYear : undefined,
        coverDataUrl,
        coverColor: coverColor || pickFallbackSpineColor(title),
        pdfBlob: mode === 'pdf' && pdfFile ? pdfFile : undefined,
      });
      showBanner(`Added "${title.trim()}" to your shelf.`);
      handleClose();
    } catch (err) {
      console.error('Failed to add book:', err);
      setSaving(false);
      setErrorMsg('Failed to store book in local IndexedDB.');
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(32,31,28,0.42)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-book-heading"
    >
      <div className="animate-modal-in max-h-[90vh] w-full max-w-[680px] overflow-y-auto border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-between border-b border-[var(--border-soft)] pb-4">
          <div>
            <p className="editorial-label text-[var(--foreground-secondary)]">
              LOCAL LIBRARY IMPORT
            </p>
            <h2
              id="add-book-heading"
              className="mt-1 font-display text-3xl font-semibold text-[var(--foreground)]"
            >
              Add Book to Shelf
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close add book dialog"
            className="inline-flex h-11 w-11 items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode switch */}
        <div className="mb-6 flex gap-6 border-b border-[var(--border-soft)]">
          <button
            type="button"
            onClick={() => setMode('pdf')}
            className={`h-11 border-b text-[11px] font-medium uppercase tracking-[0.14em] transition-colors ${
              mode === 'pdf'
                ? 'border-[var(--foreground)] text-[var(--foreground)]'
                : 'border-transparent text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            Upload PDF
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`h-11 border-b text-[11px] font-medium uppercase tracking-[0.14em] transition-colors ${
              mode === 'manual'
                ? 'border-[var(--foreground)] text-[var(--foreground)]'
                : 'border-transparent text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            Add Book Manually
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === 'pdf' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                aria-label="Choose PDF file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handlePdfSelected(f);
                }}
              />

              {!pdfFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) void handlePdfSelected(f);
                  }}
                  className="flex w-full flex-col items-center justify-center border border-dashed border-[var(--border-strong)] bg-[var(--background)] px-6 py-10 text-center hover:bg-[var(--surface-secondary)] transition-colors cursor-pointer"
                >
                  <Upload className="mb-3 h-6 w-6 text-[var(--foreground-secondary)]" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--foreground)]">
                    SELECT OR DROP A PDF FILE
                  </span>
                  <span className="mt-2 text-xs text-[var(--foreground-secondary)]">
                    Stored privately in IndexedDB on this device. Supports text and scanned PDFs.
                  </span>
                </button>
              ) : preparing ? (
                <div className="border border-[var(--border)] bg-[var(--background)] p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="editorial-label text-[var(--foreground)]">
                      PREPARING YOUR BOOK
                    </span>
                    <span className="text-xs text-[var(--foreground-secondary)]">
                      {prepStage}
                    </span>
                  </div>
                  <ProgressLine percent={prepProgress} />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4 border border-[var(--border)] bg-[var(--background)] p-4">
                  <div className="flex items-center gap-4 min-w-0">
                    {coverDataUrl ? (
                      <img
                        src={coverDataUrl}
                        alt="PDF page 1 preview"
                        className="h-16 w-12 object-cover border border-[var(--border)] shrink-0"
                      />
                    ) : (
                      <div
                        className="flex h-16 w-12 items-center justify-center shrink-0"
                        style={{ backgroundColor: coverColor }}
                      >
                        <BookOpen className="h-4 w-4 text-white/80" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--foreground)]">
                        {pdfFile.name}
                      </p>
                      <p className="text-xs text-[var(--foreground-secondary)] tabular-nums">
                        {totalPages} pages · {(pdfFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="tertiary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    REPLACE
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="book-title"
                className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
              >
                TITLE
              </label>
              <input
                id="book-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Atomic Habits"
                className="h-11 w-full border border-[var(--border)] bg-[var(--paper)] px-3 text-sm text-[var(--foreground)]"
              />
            </div>

            <div>
              <label
                htmlFor="book-author"
                className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
              >
                AUTHOR
              </label>
              <input
                id="book-author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. James Clear"
                className="h-11 w-full border border-[var(--border)] bg-[var(--paper)] px-3 text-sm text-[var(--foreground)]"
              />
            </div>

            <div>
              <label
                htmlFor="book-category"
                className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
              >
                GENRE
              </label>
              <input
                id="book-category"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Discipline, Philosophy, Systems..."
                className="h-11 w-full border border-[var(--border)] bg-[var(--paper)] px-3 text-sm text-[var(--foreground)]"
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
                  htmlFor="book-pages"
                  className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
                >
                  PAGES
                </label>
                <input
                  id="book-pages"
                  type="number"
                  min={1}
                  value={totalPages}
                  onChange={(e) => setTotalPages(Math.max(1, Number(e.target.value) || 1))}
                  className="h-11 w-full border border-[var(--border)] bg-[var(--paper)] px-3 text-sm text-[var(--foreground)] tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="book-year"
                  className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
                >
                  PUBLISHED
                </label>
                <input
                  id="book-year"
                  type="number"
                  min={1}
                  max={2100}
                  value={publishedYear}
                  onChange={(e) => setPublishedYear(e.target.value)}
                  placeholder="2018"
                  className="h-11 w-full border border-[var(--border)] bg-[var(--paper)] px-3 text-sm text-[var(--foreground)] tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Reading Status & Custom Tags */}
          <div className="space-y-4 border-t border-[var(--border-soft)] pt-4">
            <div>
              <span className="editorial-label mb-2 block text-[var(--foreground-secondary)]">
                READING STATUS
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Initial reading status">
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
                htmlFor="add-book-tag-input"
                className="editorial-label mb-2 block text-[var(--foreground-secondary)]"
              >
                TAGS (OPTIONAL)
              </label>
              <TagEditor
                inputId="add-book-tag-input"
                tags={tags}
                onChange={setTags}
                suggestions={tagSuggestions}
                compact
              />
            </div>
          </div>

          {metadataLookup && (
            <div className="flex items-center justify-between border border-[var(--border-soft)] bg-[var(--background)] px-4 py-2.5">
              <span className="text-xs text-[var(--foreground-secondary)]">
                Optional Open Library lookup (title & author only; PDF stays on device)
              </span>
              <Button
                variant="tertiary"
                onClick={() => void handleOpenLibraryLookup()}
                disabled={lookingUp || !title.trim()}
              >
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {lookingUp ? 'SEARCHING...' : 'FILL METADATA'}
              </Button>
            </div>
          )}

          <div>
            <label
              htmlFor="book-synopsis"
              className="editorial-label mb-1.5 block text-[var(--foreground-secondary)]"
            >
              SYNOPSIS (OPTIONAL)
            </label>
            <textarea
              id="book-synopsis"
              rows={3}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="A brief summary of the book's central ideas..."
              className="w-full border border-[var(--border)] bg-[var(--paper)] p-3 text-sm text-[var(--foreground)]"
            />
          </div>

          {/* Spine Color & Custom Cover */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 items-center">
            <div>
              <span className="editorial-label mb-2 block text-[var(--foreground-secondary)]">
                SPINE & COVER COLOR
              </span>
              <div className="flex flex-wrap gap-2">
                {SPINE_PALETTE.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Select color ${hex}`}
                    onClick={() => setCoverColor(hex)}
                    className={`h-6 w-6 border transition-transform ${
                      coverColor.toLowerCase() === hex.toLowerCase()
                        ? 'scale-110 ring-2 ring-[var(--foreground)] ring-offset-2'
                        : 'border-[var(--border)]'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>

            <div>
              <span className="editorial-label mb-2 block text-[var(--foreground-secondary)]">
                COVER IMAGE (OPTIONAL)
              </span>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleCoverSelected(f);
                }}
              />
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  className="h-10 px-4"
                  onClick={() => coverInputRef.current?.click()}
                >
                  {coverDataUrl ? 'CHANGE COVER' : 'UPLOAD COVER'}
                </Button>
                {coverDataUrl && (
                  <Button variant="tertiary" onClick={() => setCoverDataUrl(undefined)}>
                    CLEAR
                  </Button>
                )}
              </div>
            </div>
          </div>

          {errorMsg && (
            <p role="alert" className="text-sm text-[#8B3835]">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center justify-end gap-4 border-t border-[var(--border-soft)] pt-5">
            <Button variant="tertiary" onClick={handleClose}>
              CANCEL
            </Button>
            <Button type="submit" disabled={preparing || saving}>
              {saving ? 'SAVING...' : 'ADD TO SHELF'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
