'use client';

import { cn } from '@/lib/utils';
import type { Category } from '@/types';

function getIconEmoji(icon: string | null): string {
  if (!icon) return '💸';
  const map: Record<string, string> = {
    home: '🏠', 'shopping-cart': '🛒', zap: '⚡', droplet: '💧', wifi: '📶',
    car: '🚗', utensils: '🍽️', 'heart-pulse': '💊', pizza: '🍕', film: '🎬',
    'shopping-bag': '🛍️', repeat: '🔄', dumbbell: '🏋️', sparkles: '✨',
    'piggy-bank': '🐷', 'trending-up': '📈', shield: '🛡️', briefcase: '💼',
    gift: '🎁',
  };
  return map[icon] ?? '💸';
}

interface CategoryGridProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  transactionType: string;
}

export function CategoryGrid({ categories, selectedId, onSelect, transactionType }: CategoryGridProps) {
  const filtered = categories.filter((c) => {
    const ctype = c.category_type ?? (c.bucket_id ? 'expense' : 'income');
    if (transactionType === 'income') return ctype === 'income' || ctype === 'adjustment';
    return ctype === 'expense' || ctype === 'adjustment';
  });

  return (
    <div className="grid grid-cols-3 gap-2">
      {filtered.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={cn(
            'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all',
            selectedId === cat.id
              ? 'border-accent bg-accent/10'
              : 'border-border bg-elevated hover:border-border/60'
          )}
        >
          <span className="text-xl">{getIconEmoji(cat.icon)}</span>
          <span className="text-xs text-fg-secondary text-center leading-tight font-medium line-clamp-2">
            {cat.name}
          </span>
        </button>
      ))}
    </div>
  );
}
