'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { DailyDigest } from '@/types/daily';

interface SikaDailyBannerProps {
  digest: DailyDigest;
}

export function SikaDailyBanner({ digest }: SikaDailyBannerProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push('/daily')}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-[#141416] to-[#1C1C1F] border border-[#00D9A3]/20 shadow-[0_0_20px_rgba(0,217,163,0.08)] hover:border-[#00D9A3]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D9A3]"
    >
      <div className="flex items-center gap-3">
        <div className="text-xl">📰</div>
        <div className="text-left">
          <div className="text-sm font-semibold text-[#FAFAFA]">
            Today&apos;s Sika Daily
          </div>
          <div className="text-xs text-[#71717A]">
            {digest.stories.length} {digest.stories.length === 1 ? 'story' : 'stories'} · {digest.is_fallback ? 'Catch up' : 'Fresh picks'}
          </div>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-[#71717A]" />
    </button>
  );
}
