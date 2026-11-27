interface BrandMarkProps {
  size?: number;
  className?: string;
}

export function BrandMark({ size = 24, className = '' }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-200 ease-[var(--ease-standard)] ${className}`}
    >
      <rect width="64" height="64" fill="#F1F0ED" />
      <rect x="1.5" y="1.5" width="61" height="61" stroke="#D9D6CF" strokeWidth="2" />
      <rect x="14" y="11" width="32" height="42" fill="#201F1C" />
      <line
        x1="20"
        y1="11"
        x2="20"
        y2="53"
        stroke="#FAF9F6"
        strokeOpacity="0.26"
        strokeWidth="1.5"
      />
      <rect x="46" y="13" width="4" height="38" fill="#FAF9F6" stroke="#201F1C" strokeWidth="1.5" />
      <path d="M34 11H41V29L37.5 25.5L34 29V11Z" fill="#B96F58" />
      <line
        x1="24"
        y1="38"
        x2="41"
        y2="38"
        stroke="#FAF9F6"
        strokeOpacity="0.85"
        strokeWidth="1.5"
      />
      <line
        x1="24"
        y1="43"
        x2="36"
        y2="43"
        stroke="#FAF9F6"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
    </svg>
  );
}
