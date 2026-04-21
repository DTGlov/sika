'use client';

import { useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { markCelebrationShown } from '@/lib/badges';
import { BadgeUnlockModal } from './badge-unlock-modal';
import type { BadgeId } from '@/types/badge';

/**
 * Renders in AppShell. Watches the badge celebration queue in auth store
 * and shows one modal at a time. Marks celebration_shown = true on dismiss.
 */
export function BadgeCelebrationHost() {
  const supabase = createClient();
  const { badgeCelebrationQueue, shiftBadgeCelebration } = useAuthStore();

  const current = badgeCelebrationQueue[0];

  const handleClose = useCallback(async () => {
    if (!current) return;
    shiftBadgeCelebration();
    await markCelebrationShown(supabase, current.userBadgeId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, shiftBadgeCelebration]);

  if (!current) return null;

  return (
    <BadgeUnlockModal
      key={current.userBadgeId}
      open={true}
      badgeId={current.badgeId as BadgeId}
      onClose={handleClose}
    />
  );
}
