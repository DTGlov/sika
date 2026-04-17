'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Home, Receipt, Settings, TrendingUp } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/settings', label: 'Settings', icon: Settings },
  // TODO(phase-2): Goals tab
  // TODO(phase-3): Invest tab
] as const;

export function SideRail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="hidden md:flex fixed left-0 top-0 bottom-0 z-30 flex-col bg-[#141416] border-r border-[#27272A] w-16 lg:w-60 transition-[width] duration-200"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-[#27272A] shrink-0">
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
          const active = pathname === href || pathname.startsWith(href + '?') || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="relative flex items-center gap-3 px-3 py-3 rounded-xl transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D9A3]"
            >
              {active && (
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
                className="w-5 h-5 shrink-0 relative z-10 transition-colors"
                style={{ color: active ? '#00D9A3' : '#71717A' }}
                aria-hidden
              />
              <span
                className="text-sm font-medium relative z-10 transition-colors hidden lg:block"
                style={{ color: active ? '#FAFAFA' : '#71717A' }}
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
