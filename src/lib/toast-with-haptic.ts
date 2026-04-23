'use client';

import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';

// Module-level cache of the user's haptics preference.
// Updated by syncHapticsPreference() from useHaptics hook.
let hapticsCached = true;

export function syncHapticsPreference(enabled: boolean) {
  hapticsCached = enabled;
}

function fireIfEnabled(pattern: 'error' | 'medium' | 'light' | 'celebration') {
  if (!hapticsCached) return;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  haptics[pattern]();
}

export const hapticToast = {
  success: (msg: string, opts?: Parameters<typeof toast.success>[1]) => {
    fireIfEnabled('medium');
    return toast.success(msg, opts);
  },
  error: (msg: string, opts?: Parameters<typeof toast.error>[1]) => {
    fireIfEnabled('error');
    return toast.error(msg, opts);
  },
};
