import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center text-[11px] font-medium uppercase tracking-[0.14em] whitespace-nowrap shrink-0 transition-[background-color,color,border-color,transform,opacity] duration-[120ms] active:duration-[90ms] active:scale-[0.99] disabled:opacity-45 disabled:pointer-events-none cursor-pointer';

  const variants: Record<ButtonVariant, string> = {
    primary:
      'h-12 px-7 bg-[var(--foreground)] text-[var(--surface)] hover:bg-[#34322D]',
    secondary:
      'h-12 px-7 border border-[var(--border-strong)] bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-secondary)]',
    tertiary:
      'h-11 px-2 bg-transparent text-[var(--foreground)] hover:text-[var(--accent-hover)] underline underline-offset-[6px] decoration-[var(--foreground)] hover:decoration-[var(--accent-hover)]',
  };

  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
