import type { ReactNode } from 'react';

interface PanelProps {
  label?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ label, rightSlot, children, className = '' }: PanelProps) {
  return (
    <section
      className={`bg-[var(--surface)] border border-[var(--border)] p-6 md:p-8 ${className}`}
    >
      {(label || rightSlot) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          {label ? (
            <h2 className="editorial-label text-[var(--foreground)]">{label}</h2>
          ) : (
            <span />
          )}
          {rightSlot && <div className="flex items-center gap-4">{rightSlot}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
