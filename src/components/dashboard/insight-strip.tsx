'use client';

import { useState } from 'react';
import { X, TrendingUp, Flame, Eye, Target, Sparkles, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import type { DailyInsightRow } from '@/types/insight';

const ICON_MAP: Record<string, React.ElementType> = {
  TrendingUp, Flame, Eye, Target, Sparkles, ArrowRight, Zap, RefreshCw,
};

const ACCENT_STYLES: Record<string, { border: string; glow: string; text: string }> = {
  green:   { border: 'border-[#D4A017]/20', glow: 'shadow-[0_0_20px_rgba(0,217,163,0.06)]',   text: 'text-[#D4A017]' },
  amber:   { border: 'border-[#FBBF24]/20', glow: 'shadow-[0_0_20px_rgba(251,191,36,0.06)]',  text: 'text-[#FBBF24]' },
  red:     { border: 'border-[#F87171]/20', glow: 'shadow-[0_0_20px_rgba(248,113,113,0.06)]', text: 'text-[#F87171]' },
  blue:    { border: 'border-[#60A5FA]/20', glow: 'shadow-[0_0_20px_rgba(96,165,250,0.06)]',  text: 'text-[#60A5FA]' },
  neutral: { border: 'border-border',       glow: '',                                           text: 'text-muted-foreground' },
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
      className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-card border ${accent.border} ${accent.glow}`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={`shrink-0 mt-0.5 ${accent.text}`}>
          <IconComponent className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug">{insight.headline}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{insight.body}</p>
          {insight.stat && (
            <p className={`text-xs font-semibold mt-1 tabular-nums ${accent.text}`}>
              {insight.stat.label}: {insight.stat.value}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-muted-foreground/70 hover:text-muted-foreground transition-colors p-1"
        aria-label="Dismiss insight"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
