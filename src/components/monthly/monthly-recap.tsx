'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Flame, Eye, Target, ArrowRight, Sparkles, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { shareMonthly } from '@/lib/share-monthly';
import type { MonthlyCard, MonthlyAccent } from '@/types/monthly';

const ICON_MAP: Record<string, React.ElementType> = {
  TrendingUp, Flame, Eye, Target, ArrowRight, Sparkles,
};

const ACCENT_CLASS: Record<MonthlyAccent, string> = {
  green: 'text-[#00D9A3]',
  amber: 'text-[#FBBF24]',
  red: 'text-[#F43F5E]',
  blue: 'text-[#60A5FA]',
  neutral: 'text-foreground',
};

const ACCENT_BG: Record<MonthlyAccent, string> = {
  green: 'bg-[#00D9A3]/10 border-[#00D9A3]/20',
  amber: 'bg-[#FBBF24]/10 border-[#FBBF24]/20',
  red: 'bg-[#F43F5E]/10 border-[#F43F5E]/20',
  blue: 'bg-[#60A5FA]/10 border-[#60A5FA]/20',
  neutral: 'bg-muted border-border',
};

interface MonthlyCardItemProps {
  card: MonthlyCard;
  index: number;
}

function MonthlyCardItem({ card, index }: MonthlyCardItemProps) {
  const accent: MonthlyAccent = card.accent_color ?? 'neutral';
  const Icon = card.icon ? (ICON_MAP[card.icon] ?? Sparkles) : Sparkles;
  const isHeadline = card.type === 'headline';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay: index * 0.08 }}
      className={`rounded-3xl border p-6 ${ACCENT_BG[accent]}`}
    >
      {isHeadline ? (
        <div className="text-center space-y-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mx-auto ${ACCENT_BG[accent]}`}>
            <Icon className={`w-5 h-5 ${ACCENT_CLASS[accent]}`} />
          </div>
          <p className={`text-2xl font-bold leading-tight ${ACCENT_CLASS[accent]} amount`}>
            {card.headline}
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">{card.body}</p>
          {card.stat && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border">
              <span className="text-muted-foreground text-xs">{card.stat.label}</span>
              <span className={`text-sm font-bold amount ${ACCENT_CLASS[accent]}`}>{card.stat.value}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${ACCENT_BG[accent]}`}>
              <Icon className={`w-4 h-4 ${ACCENT_CLASS[accent]}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-base font-bold leading-snug ${ACCENT_CLASS[accent]}`}>
                {card.headline}
              </p>
            </div>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">{card.body}</p>
          {card.stat && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-muted-foreground text-xs">{card.stat.label}</span>
              <span className={`text-sm font-bold amount ${ACCENT_CLASS[accent]}`}>{card.stat.value}</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

interface MonthlyRecapProps {
  cards: MonthlyCard[];
  recapId: string;
  monthStart: string;
  monthEnd: string;
}

export function MonthlyRecap({ cards, recapId, monthStart, monthEnd }: MonthlyRecapProps) {
  const [shared, setShared] = useState(false);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    fetch('/api/monthly/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recap_id: recapId }),
    });
  }, [recapId]);

  const formatMonthRange = () => {
    const s = new Date(monthStart);
    const e = new Date(monthEnd);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${s.toLocaleDateString('en-GB', opts)} — ${e.toLocaleDateString('en-GB', opts)}`;
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/monthly-share/${recapId}`;
    const shareText = `My month in money 🔥 — tracked with Sika`;

    const result = await shareMonthly({
      recapId,
      title: 'My Sika Month',
      text: shareText,
      url: shareUrl,
    });

    if (result.success) {
      if (result.method === 'clipboard') {
        toast.success('Link copied');
      }
      // Mark as shared in DB for all successful share methods
      await fetch('/api/monthly/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recap_id: recapId }),
      }).catch(() => {});
      setShared(true);
    } else if (result.reason === 'error') {
      toast.error('Share failed');
    }
    // user-cancelled: no toast
  };

  return (
    <div className="space-y-3">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-muted-foreground text-xs text-center pb-1"
      >
        {formatMonthRange()}
      </motion.p>

      {cards.map((card, i) => (
        <MonthlyCardItem key={card.id} card={card} index={i} />
      ))}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: cards.length * 0.08 + 0.1 }}
        className="pt-2"
      >
        <button
          onClick={handleShare}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-card border border-border text-muted-foreground hover:border-[#00D9A3]/40 hover:text-[#00D9A3] transition-colors text-sm font-medium"
        >
          <Share2 className="w-4 h-4" />
          {shared ? 'Shared ✓' : 'Share my month'}
        </button>
      </motion.div>
    </div>
  );
}
