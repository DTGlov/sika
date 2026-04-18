'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { dismissHint } from '@/lib/hints';
import type { HintId } from '@/lib/hints';

interface HintCardProps {
  hintId: HintId;
  title: string;
  body: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'banner' | 'inline';
  className?: string;
  /** If provided, renders a CTA button instead of (or alongside) the X dismiss */
  cta?: string;
}

export function HintCard({ hintId, title, body, icon: Icon, variant = 'inline', className, cta }: HintCardProps) {
  const { user, dismissedHints, addDismissedHint } = useAuthStore();
  const supabase = createClient();

  const isDismissed = dismissedHints.includes(hintId);

  async function handleDismiss() {
    if (!user) return;
    addDismissedHint(hintId);
    await dismissHint(supabase, user.id, hintId);
  }

  if (isDismissed) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={hintId}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={`bg-[#141416] border border-[#00D9A3]/30 rounded-2xl p-4 ${className ?? ''}`}
      >
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-[#00D9A3]" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[#FAFAFA] text-sm font-medium mb-1">{title}</p>
            <p className="text-[#A1A1AA] text-xs leading-relaxed">{body}</p>
            {cta && (
              <button
                onClick={handleDismiss}
                className="mt-3 h-7 px-3 rounded-lg bg-[#00D9A3] text-[#0A0A0B] text-xs font-semibold hover:bg-[#00B088] transition-colors"
              >
                {cta}
              </button>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-[#52525B] hover:text-[#A1A1AA] transition-colors mt-0.5"
            aria-label="Dismiss hint"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Always-visible ? icon that shows a popover explaining the bucket system.
 * Not a dismissible hint — just an on-demand tooltip.
 */
interface BucketsTooltipProps {
  className?: string;
}

export function BucketsTooltip({ className }: BucketsTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-block ${className ?? ''}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-5 h-5 rounded-full flex items-center justify-center text-[#52525B] hover:text-[#A1A1AA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D9A3]"
        aria-label="How do buckets work?"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 -translate-x-1/2 top-7 z-50 w-72 bg-[#1C1C1F] border border-[#27272A] rounded-2xl p-4 shadow-2xl"
          >
            <p className="text-[#FAFAFA] text-sm font-medium mb-2">How buckets work</p>
            <p className="text-[#A1A1AA] text-xs leading-relaxed">
              Your income is split 50/30/20 by default:{' '}
              <span className="text-[#00D9A3]">Needs</span> (must-haves like rent, food, transport),{' '}
              <span className="text-[#FBBF24]">Wants</span> (eating out, entertainment, gym),{' '}
              <span className="text-[#60A5FA]">Future</span> (savings, investments, emergency fund).
              Customize the split in Settings.
            </p>
            <button
              onClick={() => setOpen(false)}
              className="mt-3 text-xs text-[#52525B] hover:text-[#71717A] transition-colors"
            >
              Got it
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
