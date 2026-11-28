import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Library, Menu, NotebookPen, User, X } from 'lucide-react';
import { useUiStore } from '../../store/ui';
import { BrandMark } from './BrandMark';

export function TopNav() {
  const { pathname } = useLocation();
  const openProfile = useUiStore((s) => s.openProfile);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isBooksActive = pathname.startsWith('/books');
  const isJournalActive = pathname.startsWith('/journal');
  const isReportsActive = pathname.startsWith('/reports');

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  const linkClass = (active: boolean) =>
    [
      'group relative inline-flex items-center gap-2 h-16 px-1 text-[11px] font-medium uppercase tracking-[0.14em] whitespace-nowrap shrink-0 transition-colors duration-150',
      active
        ? 'text-[var(--foreground)] border-b border-[var(--foreground)] -mb-[1px]'
        : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] border-b border-transparent hover:border-[var(--border-strong)] -mb-[1px]',
    ].join(' ');

  const mobileLinkClass = (active: boolean) =>
    [
      'flex h-11 items-center gap-3 border-b border-[var(--border-soft)] px-2 text-xs font-medium uppercase tracking-[0.14em] transition-colors',
      active
        ? 'text-[var(--foreground)] bg-[var(--surface)]'
        : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface)]',
    ].join(' ');

  return (
    <header className="w-full border-b border-[var(--border)] bg-[var(--background)]">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 md:px-8 lg:px-12">
        <Link
          to="/"
          className="group inline-flex h-11 min-w-0 items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--foreground)] whitespace-nowrap shrink-0 transition-colors duration-150 hover:text-[var(--accent-hover)]"
        >
          <BrandMark
            size={22}
            className="shrink-0 group-hover:-translate-y-0.5 group-hover:scale-[1.03]"
          />
          <span className="truncate">THE GROWTH SHELF</span>
        </Link>

        {/* Tablet & Desktop Horizontal Nav */}
        <nav
          aria-label="Primary"
          className="hidden sm:flex items-center gap-4 md:gap-7 lg:gap-8"
        >
          <Link to="/books" className={linkClass(isBooksActive)}>
            <Library
              className={`h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-y-0.5 ${
                isBooksActive ? 'text-[var(--accent-hover)]' : ''
              }`}
              strokeWidth={1.75}
            />
            <span>BOOKS</span>
          </Link>
          <Link to="/journal" className={linkClass(isJournalActive)}>
            <NotebookPen
              className={`h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-y-0.5 ${
                isJournalActive ? 'text-[var(--accent-hover)]' : ''
              }`}
              strokeWidth={1.75}
            />
            <span>JOURNAL</span>
          </Link>
          <Link to="/reports" className={linkClass(isReportsActive)}>
            <BarChart3
              className={`h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-y-0.5 ${
                isReportsActive ? 'text-[var(--accent-hover)]' : ''
              }`}
              strokeWidth={1.75}
            />
            <span>REPORTS</span>
          </Link>
          <button
            type="button"
            onClick={openProfile}
            aria-label="Library preferences and account"
            className="inline-flex h-11 w-11 items-center justify-center border border-transparent text-[var(--foreground-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--foreground)] transition-all duration-150 active:scale-95 shrink-0 cursor-pointer"
          >
            <User className="h-[18px] w-[18px]" strokeWidth={1.6} />
          </button>
        </nav>

        {/* Mobile Actions */}
        <div className="flex items-center gap-1 sm:hidden shrink-0">
          <button
            type="button"
            onClick={openProfile}
            aria-label="Library preferences and account"
            className="inline-flex h-11 w-11 items-center justify-center border border-transparent text-[var(--foreground-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            <User className="h-[18px] w-[18px]" strokeWidth={1.6} />
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-primary-nav"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex h-11 w-11 items-center justify-center border border-transparent text-[var(--foreground)] hover:border-[var(--border)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" strokeWidth={1.6} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.6} />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <nav
          id="mobile-primary-nav"
          aria-label="Mobile navigation"
          className="border-t border-[var(--border)] bg-[var(--background)] px-4 py-2 sm:hidden"
        >
          <Link
            to="/books"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileLinkClass(isBooksActive)}
          >
            <Library
              className={`h-4 w-4 ${isBooksActive ? 'text-[var(--accent-hover)]' : ''}`}
              strokeWidth={1.75}
            />
            <span>BOOKS</span>
          </Link>
          <Link
            to="/journal"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileLinkClass(isJournalActive)}
          >
            <NotebookPen
              className={`h-4 w-4 ${isJournalActive ? 'text-[var(--accent-hover)]' : ''}`}
              strokeWidth={1.75}
            />
            <span>JOURNAL</span>
          </Link>
          <Link
            to="/reports"
            onClick={() => setMobileMenuOpen(false)}
            className={`${mobileLinkClass(isReportsActive)} border-b-0`}
          >
            <BarChart3
              className={`h-4 w-4 ${isReportsActive ? 'text-[var(--accent-hover)]' : ''}`}
              strokeWidth={1.75}
            />
            <span>REPORTS</span>
          </Link>
        </nav>
      )}
    </header>
  );
}

