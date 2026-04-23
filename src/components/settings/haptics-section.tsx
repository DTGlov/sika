'use client';

import { useHaptics } from '@/hooks/use-haptics';
import { Vibrate } from 'lucide-react';

export function HapticsSection() {
  const { enabled, setEnabled, medium } = useHaptics();

  const handleToggle = async (newValue: boolean) => {
    setEnabled(newValue);
    if (newValue) medium();

    try {
      await fetch('/api/profile/haptics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newValue }),
      });
    } catch {
      // silent fail — UI already updated
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <Vibrate className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h2 className="text-foreground font-semibold mb-1">Haptic feedback</h2>
            <p className="text-muted-foreground text-xs">
              Feel a small buzz when you log, get a verdict, or hit a milestone.
            </p>
          </div>
        </div>
        <button
          onClick={() => handleToggle(!enabled)}
          role="switch"
          aria-checked={enabled}
          className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-accent' : 'bg-muted'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
