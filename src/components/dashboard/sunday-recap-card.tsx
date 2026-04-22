'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getISOWeek, getISOWeekYear, startOfISOWeek, endOfISOWeek, format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { formatGHS } from '@/lib/utils';
import { dismissHint } from '@/lib/hints';
import type { HintId } from '@/lib/hints';

function getRecapHintId(): HintId {
  const now = new Date();
  const year = getISOWeekYear(now);
  const week = getISOWeek(now);
  return `sunday_recap_${year}_W${week.toString().padStart(2, '0')}` as HintId;
}

interface RecapData {
  loggingDays: number;
  savedTotal: number;
  goalsCount: number;
}

export function SundayRecapCard() {
  const { user, dismissedHints, addDismissedHint } = useAuthStore();
  const supabase = createClient();
  const hintId = getRecapHintId();

  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);

  const isSunday = new Date().getDay() === 0;
  const isDismissed = dismissedHints.includes(hintId);

  useEffect(() => {
    if (!user || !isSunday || isDismissed) { setLoading(false); return; }

    const now = new Date();
    const weekStart = format(startOfISOWeek(now), 'yyyy-MM-dd');
    const weekEnd = format(endOfISOWeek(now), 'yyyy-MM-dd');

    Promise.all([
      supabase
        .from('transactions')
        .select('transaction_date')
        .eq('user_id', user.id)
        .gte('transaction_date', weekStart)
        .lte('transaction_date', weekEnd)
        .neq('type', 'adjustment'),
      supabase
        .from('transactions')
        .select('amount, goal_id')
        .eq('user_id', user.id)
        .eq('type', 'transfer')
        .not('goal_id', 'is', null)
        .gte('transaction_date', weekStart)
        .lte('transaction_date', weekEnd),
    ]).then(([txRes, contribRes]) => {
      const dates = new Set((txRes.data ?? []).map((r: { transaction_date: string }) => r.transaction_date));
      const contribs = contribRes.data ?? [];
      const savedTotal = contribs.reduce((s: number, r: { amount: number }) => s + r.amount, 0);
      const goalIds = new Set(contribs.map((r: { goal_id: string }) => r.goal_id).filter(Boolean));
      setData({
        loggingDays: dates.size,
        savedTotal,
        goalsCount: goalIds.size,
      });
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSunday, isDismissed]);

  if (!isSunday || isDismissed || loading || !data) return null;

  async function handleDismiss() {
    if (!user) return;
    addDismissedHint(hintId);
    await dismissHint(supabase, user.id, hintId);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="bg-gradient-to-br from-surface to-elevated border border-accent/20 rounded-2xl p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-fg text-sm font-semibold">📊 Your week in money</p>
        <button
          onClick={handleDismiss}
          className="text-fg-disabled hover:text-fg-secondary transition-colors shrink-0"
          aria-label="Dismiss weekly recap"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm">
          <span>🔥</span>
          <span className="text-fg-secondary">Logging:</span>
          <span className="text-fg font-medium">{data.loggingDays}/7 days</span>
        </div>

        {data.savedTotal > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span>💰</span>
            <span className="text-fg-secondary">Saved:</span>
            <span className="text-fg font-medium">
              {formatGHS(data.savedTotal)}
              {data.goalsCount > 0 && (
                <span className="text-fg-muted font-normal">
                  {' '}to {data.goalsCount} goal{data.goalsCount !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>
        )}

        {data.loggingDays === 0 && data.savedTotal === 0 && (
          <p className="text-fg-muted text-xs">Quiet week — that&apos;s okay. Fresh start tomorrow.</p>
        )}
      </div>
    </motion.div>
  );
}
