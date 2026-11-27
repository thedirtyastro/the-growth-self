import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Code2,
  Globe,
  Mail,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useUiStore } from '../../store/ui';
import { useLibraryStore } from '../../store/library';
import { useSettingsStore } from '../../store/settings';
import { Button } from './Button';

export function ProfileDrawer() {
  const open = useUiStore((s) => s.profileOpen);
  const close = useUiStore((s) => s.closeProfile);
  const openAddBook = useUiStore((s) => s.openAddBook);
  const showBanner = useUiStore((s) => s.showBanner);

  const books = useLibraryStore((s) => s.books);
  const loadSampleLibrary = useLibraryStore((s) => s.loadSampleLibrary);
  const clearLibrary = useLibraryStore((s) => s.clearLibrary);

  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [busySample, setBusySample] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmClear(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const handleLoadSample = async () => {
    setBusySample(true);
    try {
      await loadSampleLibrary();
      showBanner('Sample library loaded for demonstration.');
      close();
    } finally {
      setBusySample(false);
    }
  };

  const handleClear = async () => {
    await clearLibrary();
    setConfirmClear(false);
    showBanner('Local library cleared.');
    close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[rgba(32,31,28,0.34)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <aside className="animate-drawer-in flex h-full w-full max-w-[380px] flex-col border-l border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 overflow-y-auto">
        <div className="mb-8 flex items-center justify-between border-b border-[var(--border-soft)] pb-4">
          <div>
            <p className="editorial-label text-[var(--foreground-secondary)]">
              LOCAL DEVICE LIBRARY
            </p>
            <h2
              id="profile-drawer-title"
              className="mt-1 font-display text-3xl font-semibold text-[var(--foreground)]"
            >
              Preferences
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close preferences"
            className="inline-flex h-11 w-11 items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-8 flex-1">
          {/* Reader engine */}
          <div>
            <p className="editorial-label mb-3 text-[var(--foreground-secondary)]">
              READER PRESENTATION
            </p>
            <div className="grid grid-cols-2 border border-[var(--border)]">
              <button
                type="button"
                onClick={() => void updateSettings({ readerEngine: '3d' })}
                className={`h-11 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${
                  settings.readerEngine === '3d'
                    ? 'bg-[var(--foreground)] text-[var(--surface)]'
                    : 'bg-transparent text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                3D Hardcover
              </button>
              <button
                type="button"
                onClick={() => void updateSettings({ readerEngine: 'flat' })}
                className={`h-11 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${
                  settings.readerEngine === 'flat'
                    ? 'bg-[var(--foreground)] text-[var(--surface)]'
                    : 'bg-transparent text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                Flat Editorial
              </button>
            </div>
          </div>

          {/* Open Library lookup toggle */}
          <div className="border-t border-[var(--border-soft)] pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="editorial-label text-[var(--foreground)]">
                  OPEN LIBRARY METADATA LOOKUP
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--foreground-secondary)]">
                  Off by default. When enabled, lets you look up book details by title and author only. PDFs never leave your device.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.metadataLookup}
                aria-label="Toggle Open Library metadata lookup"
                onClick={() => void updateSettings({ metadataLookup: !settings.metadataLookup })}
                className={`relative mt-0.5 h-6 w-11 shrink-0 border transition-colors ${
                  settings.metadataLookup
                    ? 'border-[var(--foreground)] bg-[var(--foreground)]'
                    : 'border-[var(--border-strong)] bg-[var(--surface-secondary)]'
                }`}
              >
                <span
                  className={`block h-4 w-4 bg-[var(--surface)] transition-transform ${
                    settings.metadataLookup ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Library actions */}
          <div className="border-t border-[var(--border-soft)] pt-6 space-y-3">
            <p className="editorial-label text-[var(--foreground-secondary)]">
              LIBRARY ACTIONS ({books.length} {books.length === 1 ? 'BOOK' : 'BOOKS'})
            </p>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                close();
                openAddBook();
              }}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              ADD PDF OR BOOK
            </Button>

            <Button
              variant="secondary"
              className="w-full"
              disabled={busySample}
              onClick={() => void handleLoadSample()}
            >
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              {busySample ? 'LOADING SAMPLE LIBRARY...' : 'LOAD SAMPLE LIBRARY (DEMO)'}
            </Button>

            {books.length > 0 && !confirmClear && (
              <Button
                variant="tertiary"
                className="w-full text-[var(--foreground-secondary)]"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                CLEAR LOCAL LIBRARY
              </Button>
            )}

            {confirmClear && (
              <div className="border border-[var(--border)] bg-[var(--background)] p-4 space-y-3">
                <p className="text-xs text-[var(--foreground)]">
                  Remove all books, PDFs, highlights, notes, and reading sessions from this device?
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="primary"
                    className="h-10 flex-1"
                    onClick={() => void handleClear()}
                  >
                    CONFIRM CLEAR
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-10 flex-1"
                    onClick={() => setConfirmClear(false)}
                  >
                    CANCEL
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 border-t border-[var(--border-soft)] pt-5 space-y-3">
          <div className="flex items-center gap-2 text-[var(--foreground-secondary)]">
            <BookOpen className="h-3.5 w-3.5" />
            <p className="text-xs leading-relaxed">
              All PDFs and reading data stay privately in your browser&apos;s IndexedDB.
            </p>
          </div>

          <div className="border border-[var(--border-soft)] bg-[var(--background)] p-3.5 space-y-2">
            <div className="flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-[var(--accent-hover)]" />
              <span className="editorial-label text-[var(--foreground-secondary)]">
                DEVELOPED BY
              </span>
            </div>
            <p className="font-display text-lg font-medium text-[var(--foreground)]">
              Sarukhan Muthuraman
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <a
                href="https://sarukhanmuthuraman.online"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1 font-medium text-[var(--foreground)] hover:text-[var(--accent-hover)] transition-colors"
              >
                <Globe className="h-3 w-3" />
                <span className="editorial-link-underline">sarukhanmuthuraman.online</span>
                <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
              <a
                href="mailto:sarukhanmuthuraman@gmail.com"
                className="inline-flex items-center gap-1 text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
              >
                <Mail className="h-3 w-3" />
                <span>Email</span>
              </a>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
