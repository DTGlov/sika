'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import type { Streaks } from '@/types/streak';
import { hasLoggedToday, hasSavedThisWeek } from '@/lib/streaks';

interface StreakStripProps {
  streaks: Streaks;
}

export function StreakStrip({ streaks }: StreakStripProps) {
  const router = useRouter();
  const loggedToday = hasLoggedToday(streaks);
  const savedThisWeek = hasSavedThisWeek(streaks);

  const hasLogging = streaks.logging_current > 0;
  const hasSavings = streaks.savings_current > 0;

  return (
    <button
      onClick={() => router.push('/streaks')}
      className="w-full text-left bg-[#141416] border border-[#27272A] rounded-2xl px-4 py-3 hover:border-[#3F3F46] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D9A3]"
    >
      <div className="flex items-center gap-3 flex-wrap">
        {/* Logging streak */}
        {hasLogging && (
          <div className="flex items-center gap-1.5">
            <motion.span
              className="text-base"
              animate={!loggedToday ? { scale: [1, 1.15, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
            >
              🔥
            </motion.span>
            <span className="text-[#FAFAFA] text-sm font-semibold tabular-nums">
              {streaks.logging_current}-day
            </span>
            <span className="text-[#71717A] text-sm">logging</span>
          </div>
        )}

        {/* Divider */}
        {hasLogging && hasSavings && (
          <span className="text-[#3F3F46] text-sm">·</span>
        )}

        {/* Savings streak */}
        {hasSavings && (
          <div className="flex items-center gap-1.5">
            <motion.span
              className="text-base"
              animate={!savedThisWeek ? { scale: [1, 1.15, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut', delay: 0.3 }}
            >
              💰
            </motion.span>
            <span className="text-[#FAFAFA] text-sm font-semibold tabular-nums">
              {streaks.savings_current}-week
            </span>
            <span className="text-[#71717A] text-sm">saving</span>
          </div>
        )}

        {/* Freezes badge */}
        {streaks.freezes_banked > 0 && (
          <span className="ml-auto text-xs text-[#52525B] shrink-0">
            ❄️ {streaks.freezes_banked} freeze{streaks.freezes_banked !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Nudge line */}
      {(!loggedToday && hasLogging) || (!savedThisWeek && hasSavings) ? (
        <p className="mt-1 text-[10px] text-[#71717A] leading-tight">
          {!loggedToday && hasLogging && !savedThisWeek && hasSavings
            ? 'Log & contribute today to keep both streaks'
            : !loggedToday && hasLogging
            ? 'Log a transaction today to keep your streak'
            : 'Contribute to a goal this week to keep your saving streak'}
        </p>
      ) : null}
    </button>
  );
}
