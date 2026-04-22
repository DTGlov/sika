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
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-surface to-elevated border border-accent/20 hover:border-accent/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ boxShadow: '0 0 20px color-mix(in srgb, var(--accent) 8%, transparent)' }}
    >
      <div className="flex items-center gap-3">
        <div className="text-xl">📰</div>
        <div className="text-left">
          <div className="text-sm font-semibold text-fg">
            Today&apos;s Sika Daily
          </div>
          <div className="text-xs text-fg-muted">
            {digest.stories.length} {digest.stories.length === 1 ? 'story' : 'stories'} · {digest.is_fallback ? 'Catch up' : 'Fresh picks'}
          </div>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-fg-muted" />
    </button>
  );
}
