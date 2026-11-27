import { Plus, Sparkles } from 'lucide-react';
import { useLibraryStore } from '../store/library';
import { useUiStore } from '../store/ui';
import { PageTransition } from '../components/shell/PageTransition';
import { Shelf } from '../components/shelf/Shelf';
import { Button } from '../components/shell/Button';

export function HomePage() {
  const books = useLibraryStore((s) => s.books);
  const hydrated = useLibraryStore((s) => s.hydrated);
  const loadSampleLibrary = useLibraryStore((s) => s.loadSampleLibrary);
  const openAddBook = useUiStore((s) => s.openAddBook);
  const showBanner = useUiStore((s) => s.showBanner);

  const currentYear = new Date().getFullYear();

  const handleLoadSample = async () => {
    await loadSampleLibrary();
    showBanner('Sample library loaded for demonstration.');
  };

  return (
    <PageTransition>
      <main className="mx-auto max-w-[1440px] px-5 pt-7 pb-12 md:px-8 md:pt-10 lg:px-12">
        {/* Editorial Hero Header */}
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="editorial-label text-[var(--foreground-secondary)]">
              PERSONAL LIBRARY / {currentYear}
            </p>
            <h1 className="mt-3 font-display text-[clamp(52px,8.2vw,116px)] font-semibold uppercase leading-[0.92] tracking-[-0.02em] text-[var(--foreground)]">
              MY READING
              <br />
              COLLECTION
            </h1>
          </div>

          <div className="max-w-[260px] md:pb-2">
            <p className="text-[15px] leading-relaxed text-[var(--foreground-secondary)]">
              {books.length > 0
                ? `${books.length} ${books.length === 1 ? 'book' : 'books'}. A journey toward a better self.`
                : 'Your shelf is ready. Add a PDF to begin reading and tracking.'}
            </p>
          </div>
        </div>

        {/* Hydration Skeleton */}
        {!hydrated ? (
          <div className="mt-16 space-y-6" aria-busy="true" aria-label="Loading library">
            <div className="flex items-end justify-center gap-2 pt-14">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[310px] w-[76px] animate-pulse bg-[var(--surface-secondary)]"
                />
              ))}
            </div>
            <div className="h-[14px] w-full bg-[var(--border)]" />
          </div>
        ) : books.length > 0 ? (
          <div className="mt-4">
            <Shelf books={books} showCaption />
          </div>
        ) : (
          <div className="mt-20">
            <div className="mx-auto max-w-[960px] text-center">
              <div className="py-12">
                <p className="font-display text-3xl font-medium text-[var(--foreground)]">
                  An empty shelf awaits its first volume.
                </p>
                <p className="mt-2 text-sm text-[var(--foreground-secondary)]">
                  Import a PDF from your device or load the sample library to explore.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                  <Button variant="primary" onClick={openAddBook}>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    ADD YOUR FIRST BOOK
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void handleLoadSample()}
                  >
                    <Sparkles className="mr-2 h-3.5 w-3.5" />
                    LOAD SAMPLE LIBRARY
                  </Button>
                </div>
              </div>
              <div
                aria-hidden="true"
                className="h-[14px] w-full"
                style={{
                  background: 'linear-gradient(#CFCBC2, #BDB9B1)',
                  boxShadow: '0 16px 24px -10px rgba(32, 31, 28, 0.35)',
                }}
              />
            </div>
          </div>
        )}
      </main>
    </PageTransition>
  );
}
