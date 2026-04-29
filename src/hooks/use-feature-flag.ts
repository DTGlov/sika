'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { usePostHog } from 'posthog-js/react';

/**
 * React hook for PostHog feature flags.
 *
 * Returns false until PostHog is loaded + flags resolved, then returns
 * the actual flag state. Use for gating experimental features.
 *
 * @example
 *   const pushEnabled = useFeatureFlag('experimental_push_notifications');
 *   if (pushEnabled) return <NewPushUI />;
 *   return null;
 */
export function useFeatureFlag(flagKey: string): boolean {
  const posthog = usePostHog();

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!posthog) return () => {};
      const unsubscribe = posthog.onFeatureFlags(onChange);
      return () => unsubscribe?.();
    },
    [posthog],
  );

  const getSnapshot = useCallback(
    () => posthog?.isFeatureEnabled(flagKey) ?? false,
    [posthog, flagKey],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Hook for multi-variant feature flags. Returns the variant string the
 * user is bucketed into, or null if the flag is not set / not a string.
 * Use when a flag has multiple variants beyond simple on/off.
 */
export function useFeatureFlagVariant(flagKey: string): string | null {
  const posthog = usePostHog();

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!posthog) return () => {};
      const unsubscribe = posthog.onFeatureFlags(onChange);
      return () => unsubscribe?.();
    },
    [posthog],
  );

  const getSnapshot = useCallback(() => {
    const value = posthog?.getFeatureFlag(flagKey);
    return typeof value === 'string' ? value : null;
  }, [posthog, flagKey]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
