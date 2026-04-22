'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, X } from 'lucide-react';

interface SikaMonthlyBannerProps {
  recapId: string; // reserved for future deep-link
}

export function SikaMonthlyBanner({ recapId: _recapId }: SikaMonthlyBannerProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-[#141416] to-[#1C1C1F] border border-[#FBBF24]/20 shadow-[0_0_20px_rgba(251,191,36,0.06)]">
      <button
        onClick={() => router.push('/monthly')}
        className="flex items-center gap-3 flex-1 min-w-0 text-left focus-visible:outline-none"
      >
        <div className="text-xl shrink-0">🔥</div>
        <div>
          <div className="text-sm font-semibold text-[#FAFAFA]">Your month in money is ready</div>
          <div className="text-xs text-[#71717A]">5–7 takeaways from your last budget cycle →</div>
        </div>
      </button>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => router.push('/monthly')}
          className="text-[#71717A] hover:text-[#FAFAFA] transition-colors p-1"
          aria-label="View recap"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-[#52525B] hover:text-[#71717A] transition-colors p-1"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
