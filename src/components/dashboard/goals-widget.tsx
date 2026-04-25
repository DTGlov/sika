'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Target } from 'lucide-react';
import { formatGHSCompact } from '@/lib/utils';
import type { GoalProgress } from '@/types/goal';

interface GoalsWidgetProps {
  goals: GoalProgress[];
}

export function GoalsWidget({ goals }: GoalsWidgetProps) {
  if (goals.length === 0) return null;

  const top3 = goals.slice(0, 3);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Goals</p>
        <Link href="/goals" className="text-[#D4A017] text-xs hover:text-[#E8B520] transition-colors">
          See all
        </Link>
      </div>
      <div className="space-y-2">
        {top3.map(gp => {
          const accentColor = gp.goal.color ?? '#00D9A3';
          const isPerpetual = gp.goal.goal_type === 'perpetual';
          return (
            <Link
              key={gp.goal.id}
              href={`/goals/${gp.goal.id}`}
              className="block bg-card border border-border rounded-2xl p-3 hover:border-border hover:-translate-y-0.5 hover:shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-base shrink-0">{gp.goal.icon ?? '🎯'}</span>
                <p className="text-foreground text-sm font-medium flex-1 truncate">{gp.goal.name}</p>
                <span className="text-muted-foreground text-xs tabular-nums shrink-0">
                  {formatGHSCompact(gp.current_amount)}
                  {gp.goal.target_amount && (
                    <span className="text-muted-foreground/70"> / {formatGHSCompact(gp.goal.target_amount)}</span>
                  )}
                </span>
              </div>
              {!isPerpetual && gp.progress_percent != null ? (
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: accentColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${gp.progress_percent}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Target className="w-3 h-3" style={{ color: accentColor }} />
                  <span className="text-muted-foreground text-xs">Perpetual</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
