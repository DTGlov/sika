'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, X } from 'lucide-react';

interface SikaMonthlyBannerProps {
  recapId: string;
}

export function SikaMonthlyBanner({ recapId }: SikaMonthlyBannerProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    fetch('/api/monthly/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recap_id: recapId }),
    }).catch(() => {});
  }

  return (
    <div className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-card border border-[#FBBF24]/20 shadow-[0_0_20px_rgba(251,191,36,0.06)]">
      <button
        onClick={() => router.push('/monthly')}
        className="flex items-center gap-3 flex-1 min-w-0 text-left focus-visible:outline-none"
      >
        <div className="text-xl shrink-0">🔥</div>
        <div>
          <div className="text-sm font-display font-semibold text-foreground">Your month in money is ready</div>
          <div className="text-xs text-muted-foreground">5–7 takeaways from your last budget cycle →</div>
        </div>
      </button>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => router.push('/monthly')}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label="View recap"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground/70 hover:text-muted-foreground transition-colors p-1"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
