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
    return <Skeleton className={`h-[72px] rounded-2xl bg-card ${className ?? ''}`} />;
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
        className={`bg-card border border-[#00D9A3]/30 rounded-2xl p-4 ${className ?? ''}`}
      >
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-[#00D9A3]" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-foreground text-sm font-medium mb-1">{title}</p>
            <p className="text-muted-foreground text-xs leading-relaxed">{body}</p>
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
            className="shrink-0 text-muted-foreground/70 hover:text-muted-foreground transition-colors mt-0.5"
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
  { key: 'needs', color: '#00D9A3' },
  { key: 'wants', color: '#FBBF24' },
  { key: 'future', color: '#60A5FA' },
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
        className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="How do buckets work?"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="max-w-[calc(100vw-32px)] sm:max-w-md bg-background border-[#00D9A3]/30 shadow-[0_0_60px_rgba(0,217,163,0.25),0_0_20px_rgba(0,217,163,0.15)] p-6"
        >
          <DialogTitle className="text-xl font-semibold text-foreground mb-4">
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
                  <p className="text-sm text-muted-foreground leading-relaxed">{cfg.explanation}</p>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
