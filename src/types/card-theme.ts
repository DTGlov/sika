export type CycleCardTheme =
  | 'sankofa'
  | 'gye_nyame'
  | 'adinkrahene'
  | 'copper'
  | 'emerald'
  | 'amber'
  | 'obsidian';

// Backward-compat alias
export type CardTheme = CycleCardTheme;

export interface ThemeConfig {
  id: CycleCardTheme;
  name: string;
  meaning?: string;
  palette: {
    background: string;
    motif: string;
    chipPrimary: string;
    chipSecondary: string;
    balanceText: string;
    nameText: string;
    brandText: string;
  };
}

export const CYCLE_CARD_THEMES: Record<CycleCardTheme, ThemeConfig> = {
  sankofa: {
    id: 'sankofa',
    name: 'Sankofa',
    meaning: 'Learn from the past',
    palette: {
      background: '#0D1929',
      motif: '#D4A017',
      chipPrimary: '#C9A94A',
      chipSecondary: '#A88938',
      balanceText: '#E8D9B8',
      nameText: '#E8D9B8',
      brandText: '#D4A017',
    },
  },
  gye_nyame: {
    id: 'gye_nyame',
    name: 'Gye Nyame',
    meaning: 'Except God',
    palette: {
      background: '#3E0F14',
      motif: '#C8C8D0',
      chipPrimary: '#BDBDC5',
      chipSecondary: '#9B9BA3',
      balanceText: '#E8E8EC',
      nameText: '#E8E8EC',
      brandText: '#C8C8D0',
    },
  },
  adinkrahene: {
    id: 'adinkrahene',
    name: 'Adinkrahene',
    meaning: 'Chief of symbols',
    palette: {
      background: '#2A1339',
      motif: '#D4A017',
      chipPrimary: '#C9A94A',
      chipSecondary: '#A88938',
      balanceText: '#E8D9B8',
      nameText: '#E8D9B8',
      brandText: '#D4A017',
    },
  },
  copper: {
    id: 'copper',
    name: 'Copper',
    palette: {
      background: '#1A1A1D',
      motif: '#C87533',
      chipPrimary: '#B88050',
      chipSecondary: '#8F5F3A',
      balanceText: '#E8D4B8',
      nameText: '#E8D4B8',
      brandText: '#C87533',
    },
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    palette: {
      background: '#0F2E1F',
      motif: '#E8DCB4',
      chipPrimary: '#C9A94A',
      chipSecondary: '#A88938',
      balanceText: '#EFE8D0',
      nameText: '#EFE8D0',
      brandText: '#E8DCB4',
    },
  },
  amber: {
    id: 'amber',
    name: 'Amber',
    palette: {
      background: '#0D1929',
      motif: '#E0A040',
      chipPrimary: '#C9A94A',
      chipSecondary: '#A88938',
      balanceText: '#E8D9B8',
      nameText: '#E8D9B8',
      brandText: '#E0A040',
    },
  },
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian',
    palette: {
      background: '#0E1A2E',
      motif: '#C87533',
      chipPrimary: '#B88050',
      chipSecondary: '#8F5F3A',
      balanceText: '#E8D4B8',
      nameText: '#E8D4B8',
      brandText: '#C87533',
    },
  },
};

// Backward-compat alias
export const CARD_THEMES = CYCLE_CARD_THEMES;
