'use client';

import { useRef, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { formatGHS, formatGHSCompact } from '@/lib/utils';
import { CYCLE_CARD_THEMES, type CycleCardTheme } from '@/types/card-theme';
import { MOTIF_COMPONENTS } from '@/components/cycle-card/motifs';
import { EmvChip } from '@/components/cycle-card/chip';

// ── Card surface ──────────────────────────────────────────────────
// Anatomy: chip top-left | motif right | balance center | name + SIKA bottom

interface CardSurfaceProps {
  themeId: CycleCardTheme;
  cycleNet: number;
  userName: string;
  amountKey?: number;
  mounted?: React.RefObject<boolean>;
}

export function CardSurface({ themeId, cycleNet, userName, amountKey, mounted }: CardSurfaceProps) {
  const config = CYCLE_CARD_THEMES[themeId] ?? CYCLE_CARD_THEMES.sankofa;
  const { palette } = config;
  const Motif = MOTIF_COMPONENTS[themeId] ?? MOTIF_COMPONENTS.sankofa;

  const isNegative = cycleNet < 0;
  const prefix = isNegative ? '−' : '';
  const balanceColor = isNegative ? '#F43F5E' : cycleNet === 0 ? '#A1A1AA' : palette.balanceText;

  const balanceNode = (
    <span
      style={{
        color: balanceColor,
        fontFamily: 'var(--font-geist-mono)',
        fontWeight: 700,
      }}
      className="text-3xl md:text-4xl tabular-nums"
    >
      {prefix}{formatGHS(Math.abs(cycleNet))}
    </span>
  );

  return (
    <div
      className="relative overflow-hidden select-none"
      style={{
        backgroundColor: palette.background,
        aspectRatio: '85.6 / 54',
        borderRadius: 20,
      }}
    >
      {/* Motif layer */}
      <Motif color={palette.motif} />

      {/* Content layer */}
      <div
        className="relative z-10 h-full flex flex-col justify-between"
        style={{ padding: '20px 24px' }}
      >
        {/* Top: EMV Chip */}
        <div>
          <EmvChip primary={palette.chipPrimary} secondary={palette.chipSecondary} />
        </div>

        {/* Center: Balance */}
        <div>
          {amountKey !== undefined && mounted ? (
            <motion.div
              key={amountKey}
              initial={mounted.current ? { opacity: 0.35, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {balanceNode}
            </motion.div>
          ) : balanceNode}
        </div>

        {/* Bottom: Name + SIKA brand */}
        <div className="flex items-baseline justify-between">
          <span
            style={{
              color: palette.nameText,
              fontFamily: 'var(--font-geist-mono)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '65%',
            }}
          >
            {userName}
          </span>
          <span
            style={{
              color: palette.brandText,
              fontFamily: 'var(--font-geist-sans)',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.18em',
            }}
          >
            SIKA
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Full CycleCard (dashboard) ────────────────────────────────────

interface CycleCardProps {
  cycleNet: number;
  cycleLabel: string;
  userName: string;
  theme: CycleCardTheme;
  received: number;
  spent: number;
  expected: number;
}

export function CycleCard({
  cycleNet,
  cycleLabel: _cycleLabel, // kept for API compat, no longer displayed on card
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
            userName={userName}
            amountKey={cycleNet}
            mounted={mounted}
          />
        </motion.div>
      </div>

      {/* Supporting stats */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums px-1">
        <span>Received <span className="text-muted-foreground">{formatGHSCompact(received)}</span></span>
        <span className="text-muted-foreground/60">·</span>
        <span>Spent <span className="text-muted-foreground">{formatGHSCompact(spent)}</span></span>
        <span className="text-muted-foreground/60">·</span>
        <span>Expected <span className="text-muted-foreground">{formatGHSCompact(expected)}/mo</span></span>
      </div>
    </div>
  );
}
