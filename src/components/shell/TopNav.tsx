import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Library, NotebookPen, User } from 'lucide-react';
import { useUiStore } from '../../store/ui';
import { BrandMark } from './BrandMark';

export function TopNav() {
  const { pathname } = useLocation();
  const openProfile = useUiStore((s) => s.openProfile);

  const isBooksActive = pathname === '/' || pathname.startsWith('/books');
  const isJournalActive = pathname.startsWith('/journal');
  const isReportsActive = pathname.startsWith('/reports');

  const linkClass = (active: boolean) =>
    [
      'group relative inline-flex items-center gap-2 h-16 px-1 text-[11px] font-medium uppercase tracking-[0.14em] whitespace-nowrap shrink-0 transition-colors duration-150',
      active
        ? 'text-[var(--foreground)] border-b border-[var(--foreground)] -mb-[1px]'
        : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] border-b border-transparent hover:border-[var(--border-strong)] -mb-[1px]',
    ].join(' ');

  return (
    <header className="w-full border-b border-[var(--border)] bg-[var(--background)]">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-5 md:px-8 lg:px-12">
        <Link
          to="/"
          className="group inline-flex h-11 items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--foreground)] whitespace-nowrap shrink-0 transition-colors duration-150 hover:text-[var(--accent-hover)]"
        >
          <BrandMark
            size={22}
            className="group-hover:-translate-y-0.5 group-hover:scale-[1.03]"
          />
          <span>THE GROWTH SHELF</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-5 md:gap-8">
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
      </div>
    </header>
  );
}
