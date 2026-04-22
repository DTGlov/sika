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
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-accent-foreground" />
        </div>
        <div>
          <p className="text-sm text-fg-secondary">
            {getGreeting()}, {firstName}
          </p>
          <p className="text-xs text-fg-muted">{format(new Date(), 'MMMM yyyy')}</p>
        </div>
      </div>

      <Link
        href="/settings"
        className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center text-fg-secondary hover:text-fg hover:border-border/60 transition-colors"
      >
        <Settings className="w-4 h-4" />
      </Link>
    </div>
  );
}
