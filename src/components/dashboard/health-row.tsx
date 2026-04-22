'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Flame, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { computeHealthScore } from '@/lib/health-score';
import { getLabelConfig } from '@/types/health';
import { hasLoggedToday } from '@/lib/streaks';
import { TierIcon } from '@/components/momentum-float';
import { getTierProgress } from '@/lib/momentum';

const TOTAL_BADGES = 8;

export function HealthRow() {
  const router = useRouter();
  const supabase = createClient();
  const { user, streaks, momentum, userBadges, healthScore, setHealthScore } = useAuthStore();
  const { mutationCount } = useTransactionStore();

  useEffect(() => {
    if (!user) return;
    computeHealthScore(supabase, user.id).then(setHealthScore);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mutationCount]);

  const tier = momentum ? getTierProgress(momentum.total_points).tier : null;
  const loggingStreak = streaks?.logging_current ?? 0;
  const loggedToday = streaks ? hasLoggedToday(streaks) : true;
  const shouldPulse = loggingStreak > 0 && !loggedToday;
  const earnedBadges = userBadges.length;

  if (!healthScore) {
    return (
      <div className="w-full bg-surface border border-border rounded-2xl px-4 py-3 h-[62px] animate-pulse" />
    );
  }

  const labelCfg = getLabelConfig(healthScore.total);

  return (
    <button
      onClick={() => router.push('/health')}
      className="w-full text-left bg-surface border border-border rounded-2xl px-4 py-3 hover:border-border/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-fg-secondary text-sm">Your Sika score:</span>
            <span className="text-fg text-sm font-bold tabular-nums">{healthScore.total}</span>
            <span className="text-fg-disabled text-sm">·</span>
            <span className="text-sm font-semibold" style={{ color: labelCfg.color }}>
              {labelCfg.displayName}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {loggingStreak > 0 && (
              <>
                <motion.div
                  animate={shouldPulse ? { scale: [1, 1.08, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                  className="flex items-center"
                >
                  <Flame className="w-3.5 h-3.5 text-orange-500" />
                </motion.div>
                <span className="text-fg-muted text-xs tabular-nums">{loggingStreak}d</span>
              </>
            )}
            {tier && (
              <>
                {loggingStreak > 0 && <span className="text-fg-disabled text-xs">·</span>}
                <TierIcon tier={tier.id} size={14} />
                <span className="text-fg-muted text-xs">{tier.name}</span>
              </>
            )}
            {earnedBadges > 0 && (
              <>
                <span className="text-fg-disabled text-xs">·</span>
                <span className="text-fg-muted text-xs">{earnedBadges}/{TOTAL_BADGES} badges</span>
              </>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-fg-disabled shrink-0 ml-2" />
      </div>
    </button>
  );
}
