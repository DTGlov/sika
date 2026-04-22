'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '?');
          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-col items-center justify-center flex-1 gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              aria-current={active ? 'page' : undefined}
            >
              {active && (
                <motion.div
                  layoutId="bottom-nav-indicator"
                  className="absolute top-0 left-4 right-4 h-[2px] rounded-full bg-accent"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Icon
                className="w-5 h-5 transition-colors"
                style={{ color: active ? 'var(--accent)' : 'var(--text-fg-muted)' }}
                aria-hidden
              />
              <span
                className="text-[10px] font-medium leading-none transition-colors"
                style={{ color: active ? 'var(--accent)' : 'var(--text-fg-muted)' }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
