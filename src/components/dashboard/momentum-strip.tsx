'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { getTierProgress } from '@/lib/momentum';
import { TierIcon } from '@/components/momentum-float';
import type { Momentum } from '@/types/momentum';

interface MomentumStripProps {
  momentum: Momentum;
}

export function MomentumStrip({ momentum }: MomentumStripProps) {
  const router = useRouter();
  const { tier, nextTier, progressPercent, pointsNeeded } = getTierProgress(momentum.total_points);

  return (
    <button
      onClick={() => router.push('/momentum')}
      className="w-full text-left bg-[#141416] border border-[#27272A] rounded-2xl px-4 py-3 hover:border-[#3F3F46] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]"
    >
      <div className="flex items-center gap-2 mb-2">
        <TierIcon tier={tier.id} size={16} />
        <span className="text-sm font-semibold" style={{ color: tier.color }}>
          {tier.name}
        </span>
        <span className="text-[#52525B] text-xs ml-auto tabular-nums">
          {momentum.total_points.toLocaleString()} pts
        </span>
      </div>

      <div className="h-1.5 bg-[#27272A] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: tier.color }}
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>

      {nextTier && (
        <div className="flex items-center gap-1 mt-1.5">
          <span className="text-[10px] text-[#52525B]">{pointsNeeded} pts to</span>
          <TierIcon tier={nextTier.id} size={10} />
          <span className="text-[10px] text-[#52525B]">{nextTier.name}</span>
        </div>
      )}
    </button>
  );
}
