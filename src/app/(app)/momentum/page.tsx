'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { getTierProgress, calculateTier } from '@/lib/momentum';
import { TIERS, MOMENTUM_AMOUNTS } from '@/types/momentum';
import type { MomentumEvent } from '@/types/momentum';
import { formatDistanceToNow } from 'date-fns';

const EVENT_LABELS: Record<string, string> = {
  transaction_logged: 'Logged a transaction',
  transaction_logged_via_nudge: 'Logged via income nudge',
  goal_contribution: 'Contributed to a goal',
  goal_completed: 'Completed a goal',
  account_reconciled: 'Reconciled an account',
  logging_streak_7_days: '7-day logging streak',
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
      <div className="sticky top-0 z-10 bg-[#0A0A0B] border-b border-[#141416]">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#1C1C1F] transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-[#FAFAFA] font-semibold text-base">Momentum</h1>
        </div>
      </div>

      <div className="px-4 md:px-8 space-y-6 pt-6">
        {/* Tier card */}
        <div
          className="rounded-3xl p-6 text-center border"
          style={{
            background: `linear-gradient(135deg, #0A0A0B 0%, ${tier.color}15 100%)`,
            borderColor: `${tier.color}40`,
            boxShadow: `0 0 40px ${tier.color}20`,
          }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="text-7xl mb-3"
          >
            {tier.emoji}
          </motion.div>
          <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: tier.color }}>
            Current Tier
          </p>
          <h2 className="text-3xl font-bold text-[#FAFAFA] mb-1">{tier.label}</h2>
          <p className="text-[#A1A1AA] text-sm tabular-nums">{totalPoints.toLocaleString()} total points</p>

          {nextTier && (
            <div className="mt-5">
              <div className="flex justify-between text-xs text-[#52525B] mb-1.5">
                <span>{tier.label}</span>
                <span>{nextTier.emoji} {nextTier.label}</span>
              </div>
              <div className="h-2 bg-[#1C1C1F] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: tier.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                />
              </div>
              <p className="text-xs text-[#52525B] mt-1.5">{pointsNeeded} pts to next tier</p>
            </div>
          )}
        </div>

        {/* Tier ladder */}
        <div>
          <h3 className="text-[#FAFAFA] font-semibold text-sm mb-3">All Tiers</h3>
          <div className="bg-[#141416] border border-[#27272A] rounded-2xl divide-y divide-[#1C1C1F]">
            {TIERS.map(t => {
              const isCurrent = t.id === tier.id;
              const isUnlocked = totalPoints >= t.minPoints;
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`text-xl ${!isUnlocked ? 'opacity-30' : ''}`}>{t.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium"
                      style={{ color: isUnlocked ? t.color : '#52525B' }}
                    >
                      {t.label}
                    </p>
                    <p className="text-xs text-[#52525B]">{t.minPoints.toLocaleString()} pts</p>
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
          <h3 className="text-[#FAFAFA] font-semibold text-sm mb-3">How to Earn Points</h3>
          <div className="bg-[#141416] border border-[#27272A] rounded-2xl divide-y divide-[#1C1C1F]">
            {(Object.entries(MOMENTUM_AMOUNTS) as [string, number][]).map(([key, pts]) => (
              <div key={key} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm text-[#A1A1AA]">{EVENT_LABELS[key] ?? key}</p>
                <span className="text-sm font-semibold text-[#00D9A3] tabular-nums">+{pts}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent events */}
        {events.length > 0 && (
          <div>
            <h3 className="text-[#FAFAFA] font-semibold text-sm mb-3">Recent Activity</h3>
            <div className="bg-[#141416] border border-[#27272A] rounded-2xl divide-y divide-[#1C1C1F]">
              {events.map(e => (
                <div key={e.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#A1A1AA]">{EVENT_LABELS[e.event_type] ?? e.event_type}</p>
                    <p className="text-xs text-[#52525B]">
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
