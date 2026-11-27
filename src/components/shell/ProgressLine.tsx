interface ProgressLineProps {
  percent: number;
  className?: string;
}

export function ProgressLine({ percent, className = '' }: ProgressLineProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={`h-[3px] w-full bg-[var(--border-soft)] overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-[var(--foreground)] transition-[width] duration-[250ms] ease-[var(--ease-standard)]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
