'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Flame, Target, TrendingUp, Award } from 'lucide-react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { useTransactionStore } from '@/stores/transaction-store';
import { computeHealthScore } from '@/lib/health-score';
import { getLabelConfig } from '@/types/health';
import type { HealthFactor } from '@/types/health';

const RELATED_LINKS = [
  { href: '/streaks',  label: 'Streaks',  Icon: Flame,      color: '#F97316' },
  { href: '/momentum', label: 'Momentum', Icon: Award,      color: '#D4AF37' },
  { href: '/goals',    label: 'Goals',    Icon: Target,     color: 'var(--accent)' },
  { href: '/badges',   label: 'Badges',   Icon: TrendingUp, color: '#A78BFA' },
];

function FactorBar({ factor }: { factor: HealthFactor }) {
  const color =
    factor.score >= 80 ? 'var(--accent)' :
    factor.score >= 60 ? '#10B981' :
    factor.score >= 40 ? '#FBBF24' :
    factor.score >= 20 ? '#F97316' : 'var(--destructive)';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-fg text-sm font-medium">{factor.name}</span>
          <span className="text-[10px] text-fg-disabled font-medium">{factor.weight}%</span>
        </div>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>{factor.score}</span>
      </div>

      <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${factor.score}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>

      <p className="text-xs text-fg-muted leading-snug">{factor.description}</p>

      {factor.tip && (
        <p className="text-xs text-fg-secondary bg-elevated rounded-xl px-3 py-2 leading-snug">
          {factor.tip}
        </p>
      )}
    </div>
  );
}

export default function HealthPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, healthScore, setHealthScore } = useAuthStore();
  const { mutationCount } = useTransactionStore();
  useProfile();

  useEffect(() => {
    if (!user) return;
    computeHealthScore(supabase, user.id).then(setHealthScore);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mutationCount]);

  const labelCfg = healthScore ? getLabelConfig(healthScore.total) : null;

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="sticky top-0 z-10 bg-page border-b border-surface">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-fg-muted hover:text-fg hover:bg-elevated transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-fg font-semibold text-base">Your Sika score</h1>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-6 space-y-6">
        {/* Score hero */}
        {healthScore && labelCfg ? (
          <div
            className="rounded-3xl p-8 text-center border"
            style={{
              background: `linear-gradient(135deg, var(--bg-page) 0%, ${labelCfg.color}12 100%)`,
              borderColor: `${labelCfg.color}30`,
            }}
          >
            <motion.p
              className="text-7xl font-black tabular-nums leading-none mb-2"
              style={{ color: labelCfg.color }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            >
              {healthScore.total}
            </motion.p>
            <p className="text-lg font-semibold" style={{ color: labelCfg.color }}>
              {labelCfg.displayName}
            </p>
            <p className="text-fg-disabled text-xs mt-1">out of 100</p>
          </div>
        ) : (
          <div className="rounded-3xl h-44 bg-surface animate-pulse" />
        )}

        {/* Factor breakdown */}
        <div>
          <h2 className="text-fg font-semibold text-sm mb-4">Score Breakdown</h2>
          {healthScore ? (
            <div className="bg-surface border border-border rounded-2xl divide-y divide-elevated">
              {healthScore.factors.map(factor => (
                <div key={factor.id} className="px-4 py-4">
                  <FactorBar factor={factor} />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-surface rounded-2xl animate-pulse" />
              ))}
            </div>
          )}
        </div>

        {/* Active tips */}
        {healthScore && healthScore.factors.some(f => f.tip) && (
          <div>
            <h2 className="text-fg font-semibold text-sm mb-3">Actions</h2>
            <div className="space-y-2">
              {healthScore.factors
                .filter(f => f.tip)
                .map(f => (
                  <div
                    key={f.id}
                    className="bg-surface border border-border rounded-2xl px-4 py-3"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-disabled mb-1">
                      {f.name}
                    </p>
                    <p className="text-sm text-fg-secondary leading-snug">{f.tip}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Related links */}
        <div>
          <h2 className="text-fg font-semibold text-sm mb-3">Explore</h2>
          <div className="grid grid-cols-2 gap-2">
            {RELATED_LINKS.map(({ href, label, Icon, color }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-between bg-surface border border-border rounded-2xl px-4 py-3 hover:border-border/60 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" style={{ color }} />
                  <span className="text-fg-secondary text-sm">{label}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-fg-disabled" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
