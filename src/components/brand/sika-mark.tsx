interface SikaMarkProps {
  size?: number;
  variant?: 'gold-on-navy' | 'gold-on-cream';
  className?: string;
}

export function SikaMark({ size = 48, variant = 'gold-on-navy', className }: SikaMarkProps) {
  const stroke = variant === 'gold-on-cream' ? '#0E1A2E' : '#0E1A2E';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="Sika"
    >
      {/* Cowrie shell body */}
      <ellipse cx="24" cy="24" rx="14" ry="20" fill="#D4A017" />
      {/* Central spine */}
      <path
        d="M 24 6 Q 24 24 24 42"
        stroke={stroke}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Left ribs */}
      <path
        d="M 24 12 L 22 16 M 24 18 L 22 22 M 24 24 L 22 28 M 24 30 L 22 34"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Right ribs */}
      <path
        d="M 24 12 L 26 16 M 24 18 L 26 22 M 24 24 L 26 28 M 24 30 L 26 34"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
