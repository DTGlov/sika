'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { dismissHint } from '@/lib/hints';
import type { HintId } from '@/lib/hints';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { BUCKET_CONFIG } from '@/lib/constants';

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
  const { user, dismissedHints, hintsLoaded, addDismissedHint } = useAuthStore();
  const supabase = createClient();

  if (!hintsLoaded) {
    return <Skeleton className={`h-[72px] rounded-2xl bg-surface ${className ?? ''}`} />;
  }

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
        className={`bg-surface border border-accent/30 rounded-2xl p-4 ${className ?? ''}`}
      >
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-accent" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-fg text-sm font-medium mb-1">{title}</p>
            <p className="text-fg-secondary text-xs leading-relaxed">{body}</p>
            {cta && (
              <button
                onClick={handleDismiss}
                className="mt-3 h-7 px-3 rounded-lg bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent/90 transition-colors"
              >
                {cta}
              </button>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-fg-disabled hover:text-fg-secondary transition-colors mt-0.5"
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
 * Always-visible ? icon that opens a dialog explaining the bucket system.
 * Not a dismissible hint — just an on-demand info dialog.
 */
interface BucketsTooltipProps {
  className?: string;
}

const BUCKET_ROWS = [
  { key: 'needs', color: 'var(--color-sika-needs)' },
  { key: 'wants', color: 'var(--color-sika-wants)' },
  { key: 'future', color: 'var(--color-sika-future)' },
] as const;

export function BucketsTooltip({ className }: BucketsTooltipProps) {
  const [open, setOpen] = useState(false);
  const { profile } = useAuthStore();

  const percents = {
    needs: profile?.needs_percent ?? 50,
    wants: profile?.wants_percent ?? 30,
    future: profile?.future_percent ?? 20,
  };

  return (
    <div className={className}>
      <button
        onClick={() => setOpen(true)}
        className="w-5 h-5 rounded-full flex items-center justify-center text-fg-disabled hover:text-fg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="How do buckets work?"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="max-w-[calc(100vw-32px)] sm:max-w-md bg-page border-accent/30 p-6"
          style={{ boxShadow: '0 0 60px color-mix(in srgb, var(--accent) 25%, transparent), 0 0 20px color-mix(in srgb, var(--accent) 15%, transparent)' }}
        >
          <DialogTitle className="text-xl font-semibold text-fg mb-4">
            Your buckets
          </DialogTitle>
          <div className="space-y-5">
            {BUCKET_ROWS.map(({ key, color }) => {
              const cfg = BUCKET_CONFIG[key];
              return (
                <div key={key}>
                  <h4 className="text-base font-semibold mb-1.5" style={{ color }}>
                    {cfg.label} ({percents[key]}%)
                  </h4>
                  <p className="text-sm text-fg-secondary leading-relaxed">{cfg.explanation}</p>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
