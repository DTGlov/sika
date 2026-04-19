import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { checkStreakHealth } from '@/lib/streaks';

/**
 * Run once per dashboard mount. Detects passive streak breaks and shows
 * a compassionate toast if a break just occurred.
 */
export function useStreakHealth() {
  const { user, streaks, setStreaks } = useAuthStore();
  const checkedRef = useRef(false);
  const supabase = createClient();

  useEffect(() => {
    if (!user || checkedRef.current) return;
    checkedRef.current = true;

    checkStreakHealth(supabase, user.id).then(({ streaks: updated, logging_just_broken, savings_just_broken }) => {
      setStreaks(updated);

      if (logging_just_broken) {
        const days = streaks?.logging_longest ?? streaks?.logging_current ?? 0;
        toast(
          days > 0
            ? `Your ${days}-day logging streak ended. Every day's a fresh chance. 🌱`
            : `Logging streak reset. Every day's a fresh chance. 🌱`,
          { duration: 6000 }
        );
      }

      if (savings_just_broken) {
        toast(`Saving streak reset. A new week, a new start. 🌱`, { duration: 6000 });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
}
