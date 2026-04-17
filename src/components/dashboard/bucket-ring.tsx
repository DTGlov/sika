'use client';

import { motion } from 'framer-motion';
import { clampPercent, formatGHS, getProgressColor } from '@/lib/utils';
import type { BucketName } from '@/types';
import { BUCKET_CONFIG } from '@/lib/constants';

interface BucketRingProps {
  bucket: BucketName;
  spent: number;
  limit: number;
  index: number;
}

const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function BucketRing({ bucket, spent, limit, index }: BucketRingProps) {
  const config = BUCKET_CONFIG[bucket];
  const rawPercent = limit > 0 ? (spent / limit) * 100 : 0;
  const percent = clampPercent(rawPercent);
  const progressColor = getProgressColor(percent);
  const dashOffset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.1, ease: 'easeOut' }}
      className="bg-[#141416] border border-[#27272A] rounded-2xl p-4 flex flex-col items-center gap-3 hover:bg-[#1C1C1F] transition-colors"
    >
      <div className="relative w-20 h-20">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
          <circle
            cx="44"
            cy="44"
            r={RADIUS}
            fill="none"
            stroke="#27272A"
            strokeWidth="6"
          />
          <motion.circle
            cx="44"
            cy="44"
            r={RADIUS}
            fill="none"
            stroke={progressColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.8, delay: index * 0.1 + 0.2, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="amount text-base font-bold" style={{ color: progressColor }}>
            {Math.round(percent)}%
          </span>
        </div>
      </div>

      <div className="text-center w-full">
        <p className="font-semibold text-[#FAFAFA] text-sm mb-0.5" style={{ color: config.color }}>
          {config.label}
        </p>
        <p className="amount text-xs text-[#FAFAFA] font-medium">{formatGHS(spent)}</p>
        <p className="text-xs text-[#71717A]">of {formatGHS(limit)}</p>
      </div>
    </motion.div>
  );
}
