'use client';

import Link from 'next/link';
import { subDays } from 'date-fns';
import { useAuthStore } from '@/stores/auth-store';
import { BadgeCard } from '@/components/badges/badge-card';
import { BADGES_CATALOG } from '@/types/badge';
import type { BadgeId } from '@/types/badge';

export function RecentBadges() {
  const { userBadges } = useAuthStore();

  const thirtyDaysAgo = subDays(new Date(), 30);

  const recent = userBadges
    .filter(ub => new Date(ub.unlocked_at) >= thirtyDaysAgo)
    .slice(0, 3);

  if (recent.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#FAFAFA]">Recent badges</h3>
        <Link href="/badges" className="text-xs text-[#71717A] hover:text-[#A1A1AA] transition-colors">
          View all →
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
        {recent.map(ub => {
          const catalog = BADGES_CATALOG[ub.badge_id as BadgeId];
          if (!catalog) return null;
          return (
            <BadgeCard
              key={ub.id}
              size="sm"
              badge={{
                id: ub.badge_id,
                name: catalog.name,
                description: catalog.description,
                icon_name: catalog.iconName,
                rarity: catalog.rarity,
                sort_order: catalog.sortOrder,
                unlocked: true,
                unlocked_at: ub.unlocked_at,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
