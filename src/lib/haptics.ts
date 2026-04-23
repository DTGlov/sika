/**
 * Haptic feedback patterns.
 * All functions are safe to call — they no-op if:
 * - navigator.vibrate is not available (desktop, older browsers)
 * - User has disabled haptics (checked via useHaptics hook, not here)
 * - User has reduced motion preference (checked via useHaptics hook)
 *
 * These raw functions are the "how to vibrate" primitives.
 * Use useHaptics() hook in components — it handles the "should we vibrate" logic.
 */

const isAvailable = (): boolean => {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
};

export const haptics = {
  /** Light tap — FAB open, small confirmations. */
  light: () => {
    if (!isAvailable()) return;
    navigator.vibrate(10);
  },

  /** Medium confirmation — transaction logged, decision verdict. */
  medium: () => {
    if (!isAvailable()) return;
    navigator.vibrate(20);
  },

  /** Error pattern — failed action, error toast. */
  error: () => {
    if (!isAvailable()) return;
    navigator.vibrate([50, 50, 50]);
  },

  /** Celebration — tier up, streak milestone, goal reached. */
  celebration: () => {
    if (!isAvailable()) return;
    navigator.vibrate([30, 30, 30, 30, 80]);
  },
};
