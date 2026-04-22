'use client';

import Link from 'next/link';
import { Settings, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { getGreeting } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

export function TopBar() {
  const { profile } = useAuthStore();
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  return (
    <div
      className="flex items-center justify-between px-4 pb-4 md:px-8"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#00D9A3] flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-[#0A0A0B]" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            {getGreeting()}, {firstName}
          </p>
          <p className="text-xs text-muted-foreground/70">{format(new Date(), 'MMMM yyyy')}</p>
        </div>
      </div>

      <Link
        href="/settings"
        className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border transition-colors"
      >
        <Settings className="w-4 h-4" />
      </Link>
    </div>
  );
}
