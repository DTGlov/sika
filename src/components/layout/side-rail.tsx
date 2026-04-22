'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTransition, useState } from 'react';
import { motion } from 'framer-motion';
import { Home, Receipt, Wallet, Target, RefreshCw, Settings, TrendingUp } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/recurring', label: 'Recurring', icon: RefreshCw },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function SideRail() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  function handleNav(href: string) {
    if (pathname === href || pathname.startsWith(href + '/')) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  const activePending = isPending ? pendingHref : null;

  return (
    <nav
      aria-label="Main navigation"
      className="hidden md:flex fixed left-0 top-0 bottom-0 z-30 flex-col bg-card border-r border-border w-16 lg:w-60 transition-[width] duration-200"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#00D9A3] flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-[#0A0A0B]" aria-hidden />
        </div>
        <span className="text-[#00D9A3] font-bold text-xl hidden lg:block tracking-tight">
          Sika
        </span>
      </div>

      {/* Nav items */}
      <div className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '?') || pathname.startsWith(href + '/');
          const showActive = isActive || activePending === href;

          return (
            <button
              key={href}
              onClick={() => handleNav(href)}
              aria-current={isActive ? 'page' : undefined}
              style={{ touchAction: 'manipulation' }}
              className="relative w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {showActive && (
                <>
                  <motion.div
                    layoutId="side-nav-bg"
                    className="absolute inset-0 rounded-xl bg-[#00D9A3]/10"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                  <div className="absolute left-0 top-2.5 bottom-2.5 w-[3px] bg-[#00D9A3] rounded-r-full" />
                </>
              )}
              <Icon
                className={`w-5 h-5 shrink-0 relative z-10 transition-colors ${showActive ? 'text-[#00D9A3]' : 'text-muted-foreground'}`}
                aria-hidden
              />
              <span
                className={`text-sm font-medium relative z-10 transition-colors hidden lg:block ${showActive ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
