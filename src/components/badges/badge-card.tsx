'use client';

import * as LucideIcons from 'lucide-react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RARITY_CONFIG } from '@/types/badge';
import type { BadgeWithUnlockStatus } from '@/types/badge';

interface BadgeCardProps {
  badge: BadgeWithUnlockStatus;
  size?: 'sm' | 'md' | 'lg';
}

export function BadgeCard({ badge, size = 'md' }: BadgeCardProps) {
  const config = RARITY_CONFIG[badge.rarity];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (LucideIcons as any)[badge.icon_name] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

  const frameSizeClass = {
    sm: 'w-12 h-12',
    md: badge.rarity === 'rare' ? 'w-20 h-20' : 'w-16 h-16',
    lg: 'w-28 h-28',
  }[size];

  const iconSizeClass = {
    sm: 'w-5 h-5',
    md: 'w-7 h-7',
    lg: 'w-12 h-12',
  }[size];

  const glowHex = Math.round(config.glowIntensity * 255).toString(16).padStart(2, '0');

  return (
    <div className="flex flex-col items-center text-center gap-2">
      <div
        className={cn(
          'relative rounded-full flex items-center justify-center transition-transform',
          frameSizeClass,
          badge.unlocked ? 'hover:scale-105' : 'opacity-60 grayscale'
        )}
        style={{
          background: badge.unlocked ? config.frameGradient : 'rgba(82,82,91,0.1)',
          border: `2px solid ${badge.unlocked ? config.frameColor : '#52525B'}`,
          boxShadow: badge.unlocked
            ? `0 0 20px ${config.frameColor}${glowHex}`
            : 'none',
        }}
      >
        {Icon && (
          <Icon
            className={iconSizeClass}
            style={{ color: badge.unlocked ? config.frameColor : '#52525B' }}
          />
        )}
        {!badge.unlocked && (
          <Lock className="absolute -bottom-1 -right-1 w-3 h-3 text-[#52525B] bg-[#0A0A0B] rounded-full p-0.5" />
        )}
      </div>
      <div className="space-y-0.5">
        <p className={cn('text-xs font-semibold', badge.unlocked ? 'text-[#FAFAFA]' : 'text-[#71717A]')}>
          {badge.name}
        </p>
        <p className="text-[10px] text-[#52525B] leading-tight max-w-[120px]">
          {badge.description}
        </p>
      </div>
    </div>
  );
}
