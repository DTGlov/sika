'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { CARD_THEMES } from '@/types/card-theme';
import { CardSurface } from '@/components/dashboard/cycle-card';
import type { CardTheme } from '@/types/card-theme';

const THEME_ORDER: CardTheme[] = [
  'classic_gold',
  'rose_gold',
  'champagne',
  'platinum',
  'black_on_black',
  'dual_tone',
];

const SAMPLE_NET = 2426;
const SAMPLE_LABEL = 'Apr 27 — May 26';

interface CardThemePickerProps {
  currentTheme: CardTheme;
}

export function CardThemePicker({ currentTheme }: CardThemePickerProps) {
  const supabase = createClient();
  const { user, profile, setProfile } = useAuthStore();
  const [selected, setSelected] = useState<CardTheme>(currentTheme);
  const [saving, setSaving] = useState<CardTheme | null>(null);

  const userName = profile?.full_name?.toUpperCase() ?? 'YOUR NAME';

  async function handleSelect(themeId: CardTheme) {
    if (themeId === selected || !user) return;
    const prev = selected;
    setSelected(themeId);
    setSaving(themeId);

    const { error } = await supabase
      .from('profiles')
      .update({ card_theme: themeId })
      .eq('id', user.id);

    setSaving(null);

    if (error) {
      setSelected(prev);
      toast.error('Failed to update card style');
      return;
    }

    if (profile) setProfile({ ...profile, card_theme: themeId });
    toast.success('Card style updated');
  }

  const defaultTheme = THEME_ORDER[0];
  const otherThemes = THEME_ORDER.slice(1);

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <h2 className="text-fg font-semibold mb-1">Card Style</h2>
      <p className="text-fg-muted text-xs mb-4">
        Choose how your month card looks on the dashboard.
      </p>

      <ThemeRow
        themeId={defaultTheme}
        selected={selected}
        saving={saving}
        userName={userName}
        onSelect={handleSelect}
        isDefault
      />

      <p className="text-fg-disabled text-xs font-medium uppercase tracking-wider mt-5 mb-3">
        Or try
      </p>

      <div className="space-y-4">
        {otherThemes.map(id => (
          <ThemeRow
            key={id}
            themeId={id}
            selected={selected}
            saving={saving}
            userName={userName}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}

function ThemeRow({
  themeId,
  selected,
  saving,
  userName,
  onSelect,
  isDefault = false,
}: {
  themeId: CardTheme;
  selected: CardTheme;
  saving: CardTheme | null;
  userName: string;
  onSelect: (id: CardTheme) => void;
  isDefault?: boolean;
}) {
  const config = CARD_THEMES[themeId].dark; // use dark variant for the label/description
  const isSelected = selected === themeId;
  const isSaving = saving === themeId;

  return (
    <button
      onClick={() => onSelect(themeId)}
      disabled={isSaving}
      className="w-full text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
    >
      <div
        className="border rounded-2xl p-3 transition-colors"
        style={{
          borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
          background: isSelected ? 'color-mix(in srgb, var(--accent) 4%, transparent)' : 'transparent',
        }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-fg">{config.name}</span>
            {isDefault && (
              <span className="text-[10px] font-medium text-fg-muted bg-elevated rounded px-1.5 py-0.5">
                Default
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {isSelected && (
              <span className="text-[10px] font-medium text-accent">
                {isSaving ? 'Saving…' : 'Selected'}
              </span>
            )}
            {isSelected && <Check className="w-3.5 h-3.5 text-accent" />}
          </div>
        </div>

        <div className="w-[200px]">
          <CardSurface
            themeId={themeId}
            cycleNet={SAMPLE_NET}
            cycleLabel={SAMPLE_LABEL}
            userName={userName}
            mini
          />
        </div>

        <p className="mt-2 text-fg-muted text-xs">{config.description}</p>
      </div>
    </button>
  );
}
