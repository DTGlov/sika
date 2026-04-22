'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { BadgeCard } from '@/components/badges/badge-card';
import { BADGES_CATALOG } from '@/types/badge';
import type { BadgeId, BadgeWithUnlockStatus } from '@/types/badge';

const BADGE_IDS = Object.keys(BADGES_CATALOG) as BadgeId[];

export default function BadgesPage() {
  const router = useRouter();
  const { userBadges } = useAuthStore();
  useProfile();

  const unlockedMap = new Map(userBadges.map(ub => [ub.badge_id, ub.unlocked_at]));

  const allBadges: BadgeWithUnlockStatus[] = BADGE_IDS
    .map(id => {
      const catalog = BADGES_CATALOG[id];
      return {
        id,
        name: catalog.name,
        description: catalog.description,
        icon_name: catalog.iconName,
        rarity: catalog.rarity,
        sort_order: catalog.sortOrder,
        unlocked: unlockedMap.has(id),
        unlocked_at: unlockedMap.get(id) ?? null,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  const earned = allBadges.filter(b => b.unlocked);
  const locked = allBadges.filter(b => !b.unlocked);

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-page border-b border-surface">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-fg-muted hover:text-fg hover:bg-elevated transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-fg font-semibold text-base">Your Badges</h1>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-6 space-y-8">
        {/* Progress count */}
        <p className="text-sm text-fg-muted">
          Earned:{' '}
          <span className="text-fg font-semibold">{earned.length}</span>
          {' '}of{' '}
          <span className="text-fg font-semibold">{allBadges.length}</span>
        </p>

        {/* Earned section */}
        {earned.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-fg font-semibold text-sm uppercase tracking-wider">Earned</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-6">
              {earned.map(badge => (
                <BadgeCard key={badge.id} badge={badge} size="md" />
              ))}
            </div>
          </div>
        )}

        {/* Locked section */}
        {locked.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-fg-muted font-semibold text-sm uppercase tracking-wider">Locked</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-6">
              {locked.map(badge => (
                <BadgeCard key={badge.id} badge={badge} size="md" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
