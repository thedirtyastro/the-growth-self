import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Code2,
  Globe,
  Library,
  Mail,
  NotebookPen,
  ShieldCheck,
} from 'lucide-react';
import { BrandMark } from './BrandMark';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-[1440px] px-5 py-10 md:px-8 lg:px-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.4fr_1fr_1.2fr] md:items-start">
          {/* Brand Colophon */}
          <div>
            <Link
              to="/"
              className="group inline-flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-[var(--foreground)] focus-visible:outline-offset-4"
            >
              <BrandMark size={28} className="group-hover:-translate-y-0.5" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]">
                THE GROWTH SHELF
              </span>
            </Link>
            <p className="mt-3 max-w-[38ch] text-sm leading-relaxed text-[var(--foreground-secondary)]">
              A local-first personal bookshelf and 3D hardcover PDF studio. Books,
              notes, and reading habits remain privately on your device.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--foreground-secondary)]">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--success-text)]" />
              100% LOCAL INDEXEDDB STORAGE
            </div>
          </div>

          {/* Studio Navigation */}
          <div>
            <p className="editorial-label text-[var(--foreground-secondary)]">
              READING STUDIO
            </p>
            <ul className="mt-3 space-y-2">
              {[
                { to: '/', label: 'Bookshelf Home', icon: BookOpen },
                { to: '/books', label: 'The Collection', icon: Library },
                { to: '/journal', label: 'Reading Journal', icon: NotebookPen },
                { to: '/reports', label: 'Progress Reports', icon: BarChart3 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className="group inline-flex items-center gap-2.5 py-1 text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors duration-150"
                    >
                      <Icon className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--accent-hover)]" />
                      <span className="editorial-link-underline">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Developer Details */}
          <div className="border-t border-[var(--border-soft)] pt-6 md:border-t-0 md:border-l md:pl-8 md:pt-0">
            <div className="flex items-center gap-2">
              <Code2 className="h-3.5 w-3.5 text-[var(--accent-hover)]" />
              <p className="editorial-label text-[var(--foreground-secondary)]">
                DEVELOPER DETAILS
              </p>
            </div>
            <p className="mt-2.5 font-display text-2xl font-medium leading-tight text-[var(--foreground)]">
              Sarukhan Muthuraman
            </p>
            <p className="mt-1 text-xs text-[var(--foreground-secondary)]">
              Design &amp; Engineering · Local-First Web Studio
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <a
                href="https://sarukhanmuthuraman.online"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex w-fit items-center gap-2 border border-[var(--border-strong)] bg-[var(--background)] px-3 py-2 text-xs font-medium tracking-[0.04em] text-[var(--foreground)] transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--surface)]"
              >
                <Globe className="h-3.5 w-3.5 transition-transform duration-150 group-hover:rotate-12" />
                <span>sarukhanmuthuraman.online</span>
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>

              <a
                href="mailto:sarukhanmuthuraman@gmail.com"
                className="group inline-flex w-fit items-center gap-2 py-1 text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors duration-150"
              >
                <Mail className="h-3.5 w-3.5 transition-transform duration-150 group-hover:scale-110 group-hover:text-[var(--accent-hover)]" />
                <span className="editorial-link-underline">
                  sarukhanmuthuraman@gmail.com
                </span>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-soft)] pt-5 text-[11px] uppercase tracking-[0.12em] text-[var(--foreground-secondary)]">
          <span>
            &copy; {currentYear} THE GROWTH SHELF · BUILT BY SARUKHAN MUTHURAMAN
          </span>
          <a
            href="https://sarukhanmuthuraman.online"
            target="_blank"
            rel="noopener noreferrer"
            className="editorial-link-underline hover:text-[var(--foreground)] transition-colors"
          >
            SARUKHANMUTHURAMAN.ONLINE
          </a>
        </div>
      </div>
    </footer>
  );
}
