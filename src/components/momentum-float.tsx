'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Medal, Award, Trophy, Crown, Gem } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TIERS } from '@/types/momentum';
import type { TierConfig, Tier } from '@/types/momentum';

const TIER_ICON_MAP = { Medal, Award, Trophy, Crown, Gem } as const;

export function TierIcon({ tier, size = 20 }: { tier: Tier; size?: number }) {
  const cfg = TIERS[tier];
  const Icon = TIER_ICON_MAP[cfg.iconName as keyof typeof TIER_ICON_MAP];
  return <Icon size={size} style={{ color: cfg.color }} />;
}

interface MomentumFloatProps {
  points: number;
  id: string;
  onDone: (id: string) => void;
}

export function MomentumFloat({ points, id, onDone }: MomentumFloatProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDone(id), 1800);
    return () => clearTimeout(timer);
  }, [id, onDone]);

  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 0, scale: 0.8 }}
      animate={{ opacity: [0, 1, 1, 0], y: -60, scale: 1 }}
      transition={{ duration: 1.6, ease: 'easeOut' }}
      className="pointer-events-none fixed bottom-28 right-4 z-[200] flex items-center gap-1 rounded-full bg-[#00D9A3]/20 border border-[#00D9A3]/40 px-3 py-1 text-sm font-semibold text-[#00D9A3] shadow-lg"
    >
      +{points} pts
    </motion.div>
  );
}

interface TierUpModalProps {
  open: boolean;
  onClose: () => void;
  tier: TierConfig;
}

export function TierUpModal({ open, onClose, tier }: TierUpModalProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (open && !firedRef.current) {
      firedRef.current = true;
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: [tier.color, '#00D9A3', '#FBBF24', '#FAFAFA'],
      });
    }
    if (!open) firedRef.current = false;
  }, [open, tier.color]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        showCloseButton
        className="max-w-[calc(100vw-32px)] sm:max-w-sm bg-[#0A0A0B] border-[#27272A] p-6 text-center"
        style={{ boxShadow: `0 0 60px ${tier.color}40, 0 0 20px ${tier.color}20` }}
      >
        <DialogTitle className="sr-only">Tier up!</DialogTitle>
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="flex justify-center mb-4"
        >
          <TierIcon tier={tier.id} size={64} />
        </motion.div>
        <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: tier.color }}>
          Tier Up!
        </p>
        <h2 className="text-2xl font-bold text-[#FAFAFA] mb-2">{tier.name}</h2>
        <p className="text-sm text-[#A1A1AA] leading-relaxed">
          You&apos;ve reached <span style={{ color: tier.color }}>{tier.name}</span>. Keep going — the next tier is waiting.
        </p>
        <button
          onClick={onClose}
          className="mt-6 w-full h-11 rounded-xl font-semibold text-sm text-[#0A0A0B] transition-colors hover:opacity-90"
          style={{ background: tier.color }}
        >
          Let&apos;s go!
        </button>
      </DialogContent>
    </Dialog>
  );
}

export function MomentumFloatContainer({
  floats,
  onDone,
}: {
  floats: Array<{ id: string; points: number }>;
  onDone: (id: string) => void;
}) {
  return (
    <AnimatePresence>
      {floats.map(f => (
        <MomentumFloat key={f.id} id={f.id} points={f.points} onDone={onDone} />
      ))}
    </AnimatePresence>
  );
}
