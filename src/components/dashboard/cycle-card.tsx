'use client';

import { useRef, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { formatGHS, formatGHSCompact } from '@/lib/utils';
import type { CardTheme } from '@/types/card-theme';
import { CARD_THEMES, resolveAmountColor } from '@/types/card-theme';

// ── Shared card surface ───────────────────────────────────────────
// Used by both the full CycleCard and the mini preview in Settings.

interface CardSurfaceProps {
  themeId: CardTheme;
  cycleNet: number;
  cycleLabel: string;
  userName: string;
  /** animated key — when it changes, the amount ticks in */
  amountKey?: number;
  mounted?: React.RefObject<boolean>;
  mini?: boolean;
}

export function CardSurface({
  themeId,
  cycleNet,
  cycleLabel,
  userName,
  amountKey,
  mounted,
  mini = false,
}: CardSurfaceProps) {
  const theme = CARD_THEMES[themeId];
  const amountColor = resolveAmountColor(theme, cycleNet);
  const isNegative = cycleNet < 0;
  const prefix = isNegative ? '−' : '';

  const chipStyle = {
    background: `linear-gradient(135deg, ${hexWithAlpha(theme.accentColor, 0.55)} 0%, ${hexWithAlpha(theme.accentColor, 0.3)} 100%)`,
    border: `1px solid ${hexWithAlpha(theme.accentColor, 0.25)}`,
  };

  return (
    <div
      className="relative overflow-hidden select-none"
      style={{
        background: theme.background,
        border: `1px solid ${theme.border}`,
        aspectRatio: '85.6 / 54',
        borderRadius: mini ? 12 : 20,
        padding: mini ? 12 : undefined,
      }}
    >
      {/* Top-left accent glow */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: mini ? -28 : -50,
          left: mini ? -28 : -50,
          width: mini ? 100 : 180,
          height: mini ? 100 : 180,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.highlightColor} 0%, transparent 68%)`,
        }}
      />

      {/* Holographic sheen */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)',
        }}
      />

      {/* Top shadow for depth */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: mini ? 24 : 40,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, transparent 100%)',
        }}
      />

      {/* Content */}
      <div
        className="relative h-full flex flex-col justify-between z-10"
        style={{ padding: mini ? undefined : '20px 24px', height: '100%' }}
      >
        {/* Top: SIKA + cycle label */}
        <div className="flex items-start justify-between">
          <span
            style={{
              color: theme.accentColor,
              fontFamily: 'var(--font-geist-sans)',
              fontSize: mini ? 9 : 13,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            Sika
          </span>
          <span
            style={{
              color: theme.textSecondary,
              fontFamily: 'var(--font-geist-sans)',
              fontSize: mini ? 7 : 11,
              letterSpacing: '0.01em',
            }}
          >
            {cycleLabel}
          </span>
        </div>

        {/* Middle: label + amount */}
        <div>
          <div
            style={{
              color: theme.textSecondary,
              fontFamily: 'var(--font-geist-sans)',
              fontSize: mini ? 7 : 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: mini ? 2 : 4,
            }}
          >
            This Cycle
          </div>

          {amountKey !== undefined && mounted ? (
            <motion.div
              key={amountKey}
              initial={mounted.current ? { opacity: 0.35, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <AmountText cycleNet={cycleNet} prefix={prefix} amountColor={amountColor} mini={mini} />
            </motion.div>
          ) : (
            <AmountText cycleNet={cycleNet} prefix={prefix} amountColor={amountColor} mini={mini} />
          )}
        </div>

        {/* Bottom: name + chip */}
        <div className="flex items-end justify-between">
          <span
            style={{
              color: theme.textSecondary,
              fontFamily: 'var(--font-geist-mono)',
              fontSize: mini ? 8 : 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '70%',
            }}
          >
            {userName}
          </span>

          <div
            style={{
              ...chipStyle,
              width: mini ? 18 : 26,
              height: mini ? 13 : 18,
              borderRadius: mini ? 3 : 4,
              flexShrink: 0,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function AmountText({
  cycleNet,
  prefix,
  amountColor,
  mini,
}: {
  cycleNet: number;
  prefix: string;
  amountColor: string;
  mini: boolean;
}) {
  return (
    <span
      style={{
        color: amountColor,
        fontFamily: 'var(--font-geist-mono)',
        fontSize: mini ? 14 : undefined,
        fontWeight: 700,
      }}
      className={mini ? '' : 'text-3xl md:text-4xl tabular-nums font-bold'}
    >
      {prefix}{formatGHS(Math.abs(cycleNet))}
    </span>
  );
}

// ── Full CycleCard (dashboard) ────────────────────────────────────

interface CycleCardProps {
  cycleNet: number;
  cycleLabel: string;
  userName: string;
  theme: CardTheme;
  received: number;
  spent: number;
  expected: number;
}

export function CycleCard({
  cycleNet,
  cycleLabel,
  userName,
  theme,
  received,
  spent,
  expected,
}: CycleCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 180, damping: 22 });
  const springY = useSpring(rotateY, { stiffness: 180, damping: 22 });
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    const { left, top, width, height } = card.getBoundingClientRect();
    rotateY.set(((e.clientX - left) / width - 0.5) * 10);
    rotateX.set(((e.clientY - top) / height - 0.5) * -10);
  }

  function handleMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <div className="space-y-2">
      <div style={{ perspective: '1200px' }}>
        <motion.div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          whileTap={{ scale: 0.985 }}
          style={{ rotateX: springX, rotateY: springY }}
          className="w-full max-w-[440px]"
        >
          <CardSurface
            themeId={theme}
            cycleNet={cycleNet}
            cycleLabel={cycleLabel}
            userName={userName}
            amountKey={cycleNet}
            mounted={mounted}
          />
        </motion.div>
      </div>

      {/* Supporting stats */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#71717A] tabular-nums px-1">
        <span>Received <span className="text-[#A1A1AA]">{formatGHSCompact(received)}</span></span>
        <span className="text-[#3F3F46]">·</span>
        <span>Spent <span className="text-[#A1A1AA]">{formatGHSCompact(spent)}</span></span>
        <span className="text-[#3F3F46]">·</span>
        <span>Expected <span className="text-[#A1A1AA]">{formatGHSCompact(expected)}/mo</span></span>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

/** Convert #RRGGBB hex to rgba(r,g,b,alpha) string. */
function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
