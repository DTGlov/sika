'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { haptics } from '@/lib/haptics';
import { syncHapticsPreference } from '@/lib/toast-with-haptic';

/**
 * Returns haptic functions that respect user preference + system reduced motion.
 * Call these instead of haptics.* directly in components.
 */
export function useHaptics() {
  const { user } = useAuthStore();
  const [enabled, setEnabledState] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('haptics_enabled')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (typeof data?.haptics_enabled === 'boolean') {
          setEnabledState(data.haptics_enabled);
          syncHapticsPreference(data.haptics_enabled);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const setEnabled = (val: boolean) => {
    setEnabledState(val);
    syncHapticsPreference(val);
  };

  const shouldFire = enabled && !reducedMotion;

  return {
    light: () => shouldFire && haptics.light(),
    medium: () => shouldFire && haptics.medium(),
    error: () => shouldFire && haptics.error(),
    celebration: () => shouldFire && haptics.celebration(),
    enabled,
    setEnabled,
  };
}
