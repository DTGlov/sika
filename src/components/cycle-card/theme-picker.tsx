'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { CYCLE_CARD_THEMES, type CycleCardTheme } from '@/types/card-theme';
import { MOTIF_COMPONENTS } from './motifs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const THEME_ORDER: CycleCardTheme[] = [
  'sankofa', 'gye_nyame', 'adinkrahene', 'copper', 'emerald', 'amber', 'obsidian',
];

export function ThemePicker() {
  const supabase = createClient();
  const { user, profile, setProfile } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<CycleCardTheme>(
    (profile?.card_theme as CycleCardTheme) ?? 'sankofa'
  );
  const [saving, setSaving] = useState(false);

  const handleSelect = async (themeId: CycleCardTheme) => {
    if (themeId === selected || !user || saving) return;
    const prev = selected;
    setSelected(themeId);
    setSaving(true);
    setOpen(false);

    const { error } = await supabase
      .from('profiles')
      .update({ card_theme: themeId })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      setSelected(prev);
      toast.error('Failed to update card style');
      return;
    }

    if (profile) setProfile({ ...profile, card_theme: themeId });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-accent font-medium hover:opacity-80 transition-opacity"
      >
        Change card
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-full max-w-md p-0 gap-0 rounded-3xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <DialogTitle className="text-foreground font-semibold text-base">
              Choose your card
            </DialogTitle>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <span className="text-muted-foreground text-lg leading-none">×</span>
            </button>
          </div>

          <div className="p-5 grid grid-cols-2 gap-3 overflow-y-auto max-h-[70vh]">
            {THEME_ORDER.map((themeId) => {
              const config = CYCLE_CARD_THEMES[themeId];
              const Motif = MOTIF_COMPONENTS[themeId];
              const isSelected = selected === themeId;
              const { palette } = config;

              return (
                <button
                  key={themeId}
                  onClick={() => handleSelect(themeId)}
                  disabled={saving}
                  className={`relative overflow-hidden transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    isSelected
                      ? 'ring-2 ring-accent ring-offset-2 ring-offset-card'
                      : 'hover:opacity-90'
                  }`}
                  style={{
                    aspectRatio: '85.6 / 54',
                    borderRadius: 12,
                    backgroundColor: palette.background,
                  }}
                  aria-label={config.name}
                  aria-pressed={isSelected}
                >
                  <Motif color={palette.motif} />

                  {/* Mini card content */}
                  <div className="absolute inset-0 p-2 flex flex-col">
                    <div className="flex-1" />
                    <div className="flex items-baseline justify-between">
                      <span
                        style={{
                          color: palette.brandText,
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: '1px',
                        }}
                      >
                        SIKA
                      </span>
                      <span
                        style={{
                          color: palette.nameText,
                          fontSize: 7,
                          letterSpacing: '0.05em',
                        }}
                      >
                        {config.name}
                      </span>
                    </div>
                  </div>

                  {/* Selected check */}
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                      <Check className="w-3 h-3 text-black" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="px-5 pb-5 pt-1">
            <p className="text-muted-foreground text-xs text-center">
              Inspired by Adinkra symbols and Ghanaian heritage.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
