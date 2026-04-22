'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Flame, Coins, Snowflake } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { hasLoggedToday, hasSavedThisWeek } from '@/lib/streaks';

function nextMilestone(current: number, milestones: number[]): number | null {
  return milestones.find(m => m > current) ?? null;
}

const LOGGING_MILESTONES = [7, 14, 30, 60, 100];
const SAVINGS_MILESTONES = [4, 12, 26, 52];

export default function StreaksPage() {
  const router = useRouter();
  const { streaks } = useAuthStore();
  useProfile();

  const loggedToday = streaks ? hasLoggedToday(streaks) : false;
  const savedThisWeek = streaks ? hasSavedThisWeek(streaks) : false;

  const loggingMilestone = streaks ? nextMilestone(streaks.logging_current, LOGGING_MILESTONES) : null;
  const savingsMilestone = streaks ? nextMilestone(streaks.savings_current, SAVINGS_MILESTONES) : null;

  const lastLoggedLabel = (() => {
    if (!streaks?.logging_last_date) return 'Never';
    if (loggedToday) return 'Today';
    const days = Math.round(
      (new Date().getTime() - new Date(streaks.logging_last_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    return days === 1 ? 'Yesterday' : `${days} days ago`;
  })();

  const lastSavedLabel = (() => {
    if (!streaks?.savings_last_week) return 'Never';
    if (savedThisWeek) return 'This week';
    const weeks = Math.round(
      (new Date().getTime() - new Date(streaks.savings_last_week).getTime()) / (1000 * 60 * 60 * 24 * 7)
    );
    return weeks === 1 ? 'Last week' : `${weeks} weeks ago`;
  })();

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 pt-6 mb-6">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center text-fg-secondary hover:text-fg hover:border-border/60 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-bold text-fg">Your Streaks</h1>
      </div>

      {/* Two stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Logging streak */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="bg-surface border border-border rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-sika-wants/10 flex items-center justify-center">
              <Flame className="w-4 h-4 text-sika-wants" />
            </div>
            <p className="text-fg-secondary text-xs font-semibold uppercase tracking-wider">Logging</p>
          </div>

          <p className="text-4xl font-bold text-fg tabular-nums mb-0.5">
            {streaks?.logging_current ?? 0}
          </p>
          <p className="text-fg-muted text-sm mb-4">
            {streaks?.logging_current === 1 ? 'day' : 'days'}
          </p>

          <div className="border-t border-border pt-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-fg-muted">Longest</span>
              <span className="text-fg">{streaks?.logging_longest ?? 0} days</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-fg-muted">Last logged</span>
              <span className={loggedToday ? 'text-accent' : 'text-fg'}>{lastLoggedLabel}</span>
            </div>
            {loggingMilestone && streaks && (
              <div className="flex justify-between text-xs">
                <span className="text-fg-muted">Next milestone</span>
                <span className="text-fg">
                  {loggingMilestone} days{' '}
                  <span className="text-fg-disabled">({loggingMilestone - streaks.logging_current} to go)</span>
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Savings streak */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut', delay: 0.08 }}
          className="bg-surface border border-border rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Coins className="w-4 h-4 text-accent" />
            </div>
            <p className="text-fg-secondary text-xs font-semibold uppercase tracking-wider">Saving</p>
          </div>

          <p className="text-4xl font-bold text-fg tabular-nums mb-0.5">
            {streaks?.savings_current ?? 0}
          </p>
          <p className="text-fg-muted text-sm mb-4">
            {streaks?.savings_current === 1 ? 'week' : 'weeks'}
          </p>

          <div className="border-t border-border pt-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-fg-muted">Longest</span>
              <span className="text-fg">{streaks?.savings_longest ?? 0} weeks</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-fg-muted">Last contributed</span>
              <span className={savedThisWeek ? 'text-accent' : 'text-fg'}>{lastSavedLabel}</span>
            </div>
            {savingsMilestone && streaks && (
              <div className="flex justify-between text-xs">
                <span className="text-fg-muted">Next milestone</span>
                <span className="text-fg">
                  {savingsMilestone} weeks{' '}
                  <span className="text-fg-disabled">({savingsMilestone - streaks.savings_current} to go)</span>
                </span>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Freezes section */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut', delay: 0.16 }}
        className="bg-surface border border-border rounded-2xl p-5"
      >
        <div className="flex items-center gap-2 mb-3">
          <Snowflake className="w-4 h-4 text-sika-future" />
          <p className="text-fg text-sm font-semibold">Streak Freezes</p>
        </div>

        <p className="text-fg text-sm mb-1">
          <span className="font-bold tabular-nums">{streaks?.freezes_banked ?? 0}</span>
          <span className="text-fg-muted"> banked · </span>
          <span className="font-bold tabular-nums">{streaks?.freezes_earned_total ?? 0}</span>
          <span className="text-fg-muted"> earned total</span>
        </p>

        {/* Visual freeze slots */}
        <div className="flex gap-2 my-3">
          {[0, 1].map(i => (
            <div
              key={i}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              style={{
                background: i < (streaks?.freezes_banked ?? 0) ? 'color-mix(in srgb, var(--color-sika-future) 15%, transparent)' : 'color-mix(in srgb, var(--border) 50%, transparent)',
                border: `1px solid ${i < (streaks?.freezes_banked ?? 0) ? 'color-mix(in srgb, var(--color-sika-future) 30%, transparent)' : 'var(--border)'}`,
              }}
            >
              {i < (streaks?.freezes_banked ?? 0) ? '❄️' : ''}
            </div>
          ))}
        </div>

        <p className="text-fg-muted text-xs leading-relaxed">
          Freezes protect your streak when life gets in the way. Earn 1 every 10 days of logging. Max 2 banked.
        </p>
      </motion.div>
    </div>
  );
}
