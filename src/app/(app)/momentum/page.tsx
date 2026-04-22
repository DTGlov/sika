'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { getTierProgress } from '@/lib/momentum';
import { TIERS, TIER_ORDER, MOMENTUM_AMOUNTS } from '@/types/momentum';
import { TierIcon } from '@/components/momentum-float';
import type { MomentumEvent } from '@/types/momentum';
import { formatDistanceToNow } from 'date-fns';

const EVENT_LABELS: Record<string, string> = {
  transaction_logged:              'Logged a transaction',
  transaction_logged_via_nudge:    'Logged via income nudge',
  goal_contribution:               'Contributed to a goal',
  goal_completed:                  'Completed a goal',
  account_reconciled:              'Reconciled an account',
  logging_streak_7_days:           '7-day logging streak',
  bucket_within_limit_full_month:  'All buckets within limit (full month)',
};

export default function MomentumPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, momentum } = useAuthStore();
  useProfile();

  const [events, setEvents] = useState<MomentumEvent[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('momentum_events')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (data) setEvents(data as MomentumEvent[]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const totalPoints = momentum?.total_points ?? 0;
  const { tier, nextTier, progressPercent, pointsNeeded } = getTierProgress(totalPoints);

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-card">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-foreground font-semibold text-base">Momentum</h1>
        </div>
      </div>

      <div className="px-4 md:px-8 space-y-6 pt-6">
        {/* Tier card */}
        <div
          className="rounded-3xl p-6 text-center border"
          style={{
            background: `linear-gradient(135deg, var(--background) 0%, ${tier.color}15 100%)`,
            borderColor: `${tier.color}40`,
            boxShadow: `0 0 40px ${tier.color}20`,
          }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="flex justify-center mb-3"
          >
            <TierIcon tier={tier.id} size={72} />
          </motion.div>
          <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: tier.color }}>
            Current Tier
          </p>
          <h2 className="text-3xl font-bold text-foreground mb-1">{tier.name}</h2>
          <p className="text-muted-foreground text-sm tabular-nums">{totalPoints.toLocaleString()} total points</p>

          {nextTier && (
            <div className="mt-5">
              <div className="flex justify-between items-center text-xs text-muted-foreground/70 mb-1.5">
                <span>{tier.name}</span>
                <div className="flex items-center gap-1">
                  <TierIcon tier={nextTier.id} size={12} />
                  <span>{nextTier.name}</span>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: tier.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                />
              </div>
              <p className="text-xs text-muted-foreground/70 mt-1.5">{pointsNeeded} pts to next tier</p>
            </div>
          )}
        </div>

        {/* Tier ladder */}
        <div>
          <h3 className="text-foreground font-semibold text-sm mb-3">All Tiers</h3>
          <div className="bg-card border border-border rounded-2xl divide-y divide-muted">
            {TIER_ORDER.map(tierId => {
              const t = TIERS[tierId];
              const isCurrent = t.id === tier.id;
              const isUnlocked = totalPoints >= t.threshold;
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={isUnlocked ? '' : 'opacity-30'}>
                    <TierIcon tier={t.id} size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: isUnlocked ? t.color : 'var(--muted-foreground)' }}>
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground/70">{t.threshold.toLocaleString()} pts</p>
                  </div>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${t.color}20`, color: t.color }}>
                      Current
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* How to earn */}
        <div>
          <h3 className="text-foreground font-semibold text-sm mb-3">How to Earn Points</h3>
          <div className="bg-card border border-border rounded-2xl divide-y divide-muted">
            {(Object.entries(MOMENTUM_AMOUNTS) as [string, number][]).map(([key, pts]) => (
              <div key={key} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm text-muted-foreground">{EVENT_LABELS[key] ?? key}</p>
                <span className="text-sm font-semibold text-[#00D9A3] tabular-nums">+{pts}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent events */}
        {events.length > 0 && (
          <div>
            <h3 className="text-foreground font-semibold text-sm mb-3">Recent Activity</h3>
            <div className="bg-card border border-border rounded-2xl divide-y divide-muted">
              {events.map(e => (
                <div key={e.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">{EVENT_LABELS[e.event_type] ?? e.event_type}</p>
                    <p className="text-xs text-muted-foreground/70">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-[#00D9A3] tabular-nums ml-3">+{e.points}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
