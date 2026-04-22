'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BADGES_CATALOG, RARITY_CONFIG } from '@/types/badge';
import type { BadgeId } from '@/types/badge';

interface BadgeUnlockModalProps {
  open: boolean;
  badgeId: BadgeId;
  onClose: () => void;
}

const AUTO_DISMISS_MS = 5000;

export function BadgeUnlockModal({ open, badgeId, onClose }: BadgeUnlockModalProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const badge = BADGES_CATALOG[badgeId];
  const config = RARITY_CONFIG[badge.rarity];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (LucideIcons as any)[badge.iconName] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

  useEffect(() => {
    if (open) {
      timerRef.current = setTimeout(onClose, AUTO_DISMISS_MS);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton
        className="max-w-[calc(100vw-32px)] sm:max-w-sm bg-card p-6 text-center"
        style={{
          borderColor: `${config.frameColor}40`,
          boxShadow: `0 0 60px ${config.frameColor}30, 0 0 20px ${config.frameColor}15`,
        }}
      >
        <DialogTitle className="sr-only">Badge Unlocked</DialogTitle>

        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="flex justify-center mb-4"
        >
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center"
            style={{
              background: config.frameGradient,
              border: `3px solid ${config.frameColor}`,
              boxShadow: `0 0 30px ${config.frameColor}40`,
            }}
          >
            {Icon && <Icon className="w-12 h-12" style={{ color: config.frameColor }} />}
          </div>
        </motion.div>

        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-muted-foreground">
          Badge Unlocked
        </p>
        <h2 className="text-2xl font-bold mb-1" style={{ color: config.frameColor }}>
          {badge.name}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">{badge.description}</p>

        <button
          onClick={onClose}
          className="w-full h-11 rounded-xl font-semibold text-sm transition-colors hover:opacity-90"
          style={{ background: config.frameColor, color: '#0A0A0B' }}
        >
          Continue
        </button>
      </DialogContent>
    </Dialog>
  );
}
