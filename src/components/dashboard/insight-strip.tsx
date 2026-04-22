'use client';

import { useState } from 'react';
import { X, TrendingUp, Flame, Eye, Target, Sparkles, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import type { DailyInsightRow } from '@/types/insight';

const ICON_MAP: Record<string, React.ElementType> = {
  TrendingUp, Flame, Eye, Target, Sparkles, ArrowRight, Zap, RefreshCw,
};

const ACCENT_STYLES: Record<string, { border: string; glow: string; text: string }> = {
  green:   { border: 'border-[#00D9A3]/20', glow: 'shadow-[0_0_20px_rgba(0,217,163,0.06)]', text: 'text-[#00D9A3]' },
  amber:   { border: 'border-[#FBBF24]/20', glow: 'shadow-[0_0_20px_rgba(251,191,36,0.06)]', text: 'text-[#FBBF24]' },
  red:     { border: 'border-[#F87171]/20', glow: 'shadow-[0_0_20px_rgba(248,113,113,0.06)]', text: 'text-[#F87171]' },
  blue:    { border: 'border-[#60A5FA]/20', glow: 'shadow-[0_0_20px_rgba(96,165,250,0.06)]', text: 'text-[#60A5FA]' },
  neutral: { border: 'border-[#3F3F46]',   glow: '',                                          text: 'text-[#A1A1AA]' },
};

interface InsightStripProps {
  row: DailyInsightRow;
  onDismiss: () => void;
}

export function InsightStrip({ row, onDismiss }: InsightStripProps) {
  const [dismissing, setDismissing] = useState(false);
  const { insight_data: insight } = row;
  const accent = ACCENT_STYLES[insight.accent] ?? ACCENT_STYLES.neutral;
  const IconComponent = insight.icon ? (ICON_MAP[insight.icon] ?? Sparkles) : Sparkles;

  async function handleDismiss() {
    setDismissing(true);
    try {
      await fetch('/api/insights/dismiss', { method: 'POST' });
    } finally {
      onDismiss();
    }
  }

  if (dismissing) return null;

  return (
    <div
      className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-[#141416] to-[#1C1C1F] border ${accent.border} ${accent.glow}`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={`shrink-0 mt-0.5 ${accent.text}`}>
          <IconComponent className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#FAFAFA] leading-snug">{insight.headline}</p>
          <p className="text-xs text-[#71717A] mt-0.5 leading-snug">{insight.body}</p>
          {insight.stat && (
            <p className={`text-xs font-semibold mt-1 tabular-nums ${accent.text}`}>
              {insight.stat.label}: {insight.stat.value}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-[#52525B] hover:text-[#71717A] transition-colors p-1"
        aria-label="Dismiss insight"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
