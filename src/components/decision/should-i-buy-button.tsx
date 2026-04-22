'use client';

import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { DecisionSheet } from './decision-sheet';

export function ShouldIBuyButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-muted hover:border-border transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-xl bg-[#00D9A3]/10 flex items-center justify-center shrink-0">
          <ShoppingBag className="w-4 h-4 text-[#00D9A3]" />
        </div>
        <div className="flex-1">
          <p className="text-foreground text-sm font-semibold">Should I buy it?</p>
          <p className="text-muted-foreground text-xs leading-relaxed">Got a purchase in mind? Sika tells you if it&apos;s the right time to buy it</p>
        </div>
      </button>
      {open && <DecisionSheet onClose={() => setOpen(false)} />}
    </>
  );
}
