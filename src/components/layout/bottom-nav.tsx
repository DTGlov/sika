'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTransition, useState } from 'react';
import { motion } from 'framer-motion';
import { Home, Receipt, Wallet, Target, RefreshCw } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/recurring', label: 'Recurring', icon: RefreshCw },
] as const;

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  function handleNav(href: string) {
    if (pathname === href) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  // activePending is null once the transition settles — real pathname takes over
  const activePending = isPending ? pendingHref : null;

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '?');
          const showActive = isActive || activePending === href;

          return (
            <button
              key={href}
              onClick={() => handleNav(href)}
              className="relative flex flex-col items-center justify-center flex-1 gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              style={{ touchAction: 'manipulation' }}
              aria-current={isActive ? 'page' : undefined}
            >
              {showActive && (
                <motion.div
                  layoutId="bottom-nav-indicator"
                  className="absolute top-0 left-4 right-4 h-[2px] rounded-full bg-[#D4A017]"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Icon
                className={`w-5 h-5 transition-colors ${showActive ? 'text-[#D4A017]' : 'text-muted-foreground'}`}
                aria-hidden
              />
              <span
                className={`text-[10px] font-medium leading-none transition-colors ${showActive ? 'text-[#D4A017]' : 'text-muted-foreground'}`}
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
