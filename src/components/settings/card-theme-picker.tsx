'use client';

import { useAuthStore } from '@/stores/auth-store';
import { ThemePicker } from '@/components/cycle-card/theme-picker';
import { CYCLE_CARD_THEMES, type CycleCardTheme } from '@/types/card-theme';
import { CardSurface } from '@/components/dashboard/cycle-card';

export function CardThemePicker() {
  const { profile } = useAuthStore();
  const themeId = (profile?.card_theme as CycleCardTheme) ?? 'sankofa';
  const config = CYCLE_CARD_THEMES[themeId] ?? CYCLE_CARD_THEMES.sankofa;
  const userName = profile?.full_name?.toUpperCase() ?? 'YOUR NAME';

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-foreground font-semibold">Card Style</h2>
        <ThemePicker />
      </div>
      <p className="text-muted-foreground text-xs mb-4">
        {config.name}{config.meaning ? ` — ${config.meaning}` : ''}
      </p>

      <div className="w-full max-w-[440px] md:max-w-[520px]">
        <CardSurface
          themeId={themeId}
          cycleNet={2426}
          userName={userName}
        />
      </div>
    </div>
  );
}
