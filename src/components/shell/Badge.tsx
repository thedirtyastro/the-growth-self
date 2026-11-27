import type { BookStatus } from '../../types/models';

interface BadgeProps {
  status: BookStatus;
  className?: string;
}

const STATUS_CONFIG: Record<BookStatus, { label: string; classes: string }> = {
  ongoing: {
    label: 'ONGOING',
    classes: 'bg-[var(--info-soft)] text-[var(--info-text)]',
  },
  completed: {
    label: 'COMPLETED',
    classes: 'bg-[var(--success-soft)] text-[var(--success-text)]',
  },
  'not-started': {
    label: 'NOT STARTED',
    classes: 'bg-[var(--neutral-soft)] text-[var(--neutral-text)]',
  },
};

export function Badge({ status, className = '' }: BadgeProps) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex min-w-[88px] items-center justify-center px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] whitespace-nowrap shrink-0 transition-colors duration-[140ms] ${cfg.classes} ${className}`}
    >
      {cfg.label}
    </span>
  );
}
