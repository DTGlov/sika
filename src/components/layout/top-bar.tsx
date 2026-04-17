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
    <div className="flex items-center justify-between px-4 pt-6 pb-4 md:px-8">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#00D9A3] flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-[#0A0A0B]" />
        </div>
        <div>
          <p className="text-sm text-[#A1A1AA]">
            {getGreeting()}, {firstName}
          </p>
          <p className="text-xs text-[#71717A]">{format(new Date(), 'MMMM yyyy')}</p>
        </div>
      </div>

      <Link
        href="/settings"
        className="w-9 h-9 rounded-xl bg-[#141416] border border-[#27272A] flex items-center justify-center text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3F3F46] transition-colors"
      >
        <Settings className="w-4 h-4" />
      </Link>
    </div>
  );
}
