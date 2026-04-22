export type CardTheme =
  | 'classic_gold'
  | 'rose_gold'
  | 'champagne'
  | 'platinum'
  | 'black_on_black'
  | 'dual_tone';

export interface CardThemeConfig {
  id: CardTheme;
  name: string;
  description: string;
  background: string;
  accentColor: string;
  textPrimary: string;
  textSecondary: string;
  highlightColor: string;
  border: string;
  isDefault?: boolean;
}

export const CARD_THEMES: Record<CardTheme, { dark: CardThemeConfig; light: CardThemeConfig }> = {
  classic_gold: {
    dark: {
      id: 'classic_gold',
      name: 'Classic Gold',
      description: 'Warm, timeless luxury',
      background: 'linear-gradient(135deg, #1A1713 0%, #2A2218 50%, #3B2F1F 100%)',
      accentColor: '#D4AF37',
      textPrimary: '#F5F0E6',
      textSecondary: '#A89885',
      highlightColor: 'rgba(212,175,55,0.15)',
      border: 'rgba(212,175,55,0.15)',
      isDefault: true,
    },
    light: {
      id: 'classic_gold',
      name: 'Classic Gold',
      description: 'Warm, timeless luxury',
      background: 'linear-gradient(135deg, #FAF6E8 0%, #F5EDD3 50%, #EDE0BD 100%)',
      accentColor: '#A8871E',
      textPrimary: '#3B2F1F',
      textSecondary: '#8B7855',
      highlightColor: 'rgba(168,135,30,0.12)',
      border: 'rgba(168,135,30,0.18)',
      isDefault: true,
    },
  },
  rose_gold: {
    dark: {
      id: 'rose_gold',
      name: 'Rose Gold',
      description: 'Modern, soft, distinctive',
      background: 'linear-gradient(135deg, #1F1418 0%, #2B1F24 50%, #3B2A30 100%)',
      accentColor: '#B76E79',
      textPrimary: '#F7ECEC',
      textSecondary: '#A8908F',
      highlightColor: 'rgba(183,110,121,0.15)',
      border: 'rgba(183,110,121,0.15)',
    },
    light: {
      id: 'rose_gold',
      name: 'Rose Gold',
      description: 'Modern, soft, distinctive',
      background: 'linear-gradient(135deg, #FAF0F0 0%, #F5E5E8 50%, #EDD8DD 100%)',
      accentColor: '#9C5260',
      textPrimary: '#3B1F24',
      textSecondary: '#8B6770',
      highlightColor: 'rgba(156,82,96,0.12)',
      border: 'rgba(156,82,96,0.18)',
    },
  },
  champagne: {
    dark: {
      id: 'champagne',
      name: 'Champagne',
      description: 'Understated, pale gold',
      background: 'linear-gradient(135deg, #1C1A15 0%, #2C2820 50%, #3A3428 100%)',
      accentColor: '#F7E7CE',
      textPrimary: '#FBF7EE',
      textSecondary: '#B8AE9A',
      highlightColor: 'rgba(247,231,206,0.12)',
      border: 'rgba(247,231,206,0.12)',
    },
    light: {
      id: 'champagne',
      name: 'Champagne',
      description: 'Understated, pale gold',
      background: 'linear-gradient(135deg, #FFFCF5 0%, #FBF6E8 50%, #F5EDD3 100%)',
      accentColor: '#B8A26E',
      textPrimary: '#2A2418',
      textSecondary: '#8B7E5A',
      highlightColor: 'rgba(184,162,110,0.10)',
      border: 'rgba(184,162,110,0.15)',
    },
  },
  platinum: {
    dark: {
      id: 'platinum',
      name: 'Platinum',
      description: 'Cool chrome, technical',
      background: 'linear-gradient(135deg, #13141A 0%, #1E1F27 50%, #2D2F3B 100%)',
      accentColor: '#D7D7D7',
      textPrimary: '#F0F2F5',
      textSecondary: '#A8A8A8',
      highlightColor: 'rgba(215,215,215,0.18)',
      border: 'rgba(215,215,215,0.12)',
    },
    light: {
      id: 'platinum',
      name: 'Platinum',
      description: 'Cool chrome, technical',
      background: 'linear-gradient(135deg, #FAFAFA 0%, #F0F0F2 50%, #E5E5E8 100%)',
      accentColor: '#6B6B6B',
      textPrimary: '#1A1A1A',
      textSecondary: '#6B6B6B',
      highlightColor: 'rgba(107,107,107,0.10)',
      border: 'rgba(107,107,107,0.15)',
    },
  },
  black_on_black: {
    dark: {
      id: 'black_on_black',
      name: 'Black on Black',
      description: 'Quiet luxury, no color',
      background: 'linear-gradient(135deg, #0A0A0B 0%, #141416 50%, #1C1C1F 100%)',
      accentColor: '#FAFAFA',
      textPrimary: '#F5F5F5',
      textSecondary: '#71717A',
      highlightColor: 'rgba(255,255,255,0.04)',
      border: 'rgba(255,255,255,0.08)',
    },
    light: {
      id: 'black_on_black',
      name: 'Black on Black',
      description: 'Quiet luxury, no color',
      background: 'linear-gradient(135deg, #FFFFFF 0%, #FAFAFA 50%, #F5F5F5 100%)',
      accentColor: '#525252',
      textPrimary: '#1A1A1A',
      textSecondary: '#999999',
      highlightColor: 'rgba(0,0,0,0.04)',
      border: 'rgba(0,0,0,0.08)',
    },
  },
  dual_tone: {
    dark: {
      id: 'dual_tone',
      name: 'Dual-tone',
      description: 'Color follows your performance',
      background: 'linear-gradient(135deg, #0A0A0B 0%, #141416 50%, #1C1C1F 100%)',
      accentColor: '#D4AF37',
      textPrimary: '#F5F5F5',
      textSecondary: '#71717A',
      highlightColor: 'rgba(255,255,255,0.04)',
      border: 'rgba(255,255,255,0.08)',
    },
    light: {
      id: 'dual_tone',
      name: 'Dual-tone',
      description: 'Color follows your performance',
      background: 'linear-gradient(135deg, #FFFFFF 0%, #FAFAFA 50%, #F5F5F5 100%)',
      accentColor: '#A8871E',
      textPrimary: '#1A1A1A',
      textSecondary: '#999999',
      highlightColor: 'rgba(0,0,0,0.04)',
      border: 'rgba(0,0,0,0.08)',
    },
  },
};

/** Convenience getter — resolves the config for current theme mode. */
export function getCardThemeConfig(theme: CardTheme, resolvedTheme: 'light' | 'dark'): CardThemeConfig {
  return CARD_THEMES[theme][resolvedTheme];
}

/** Resolve the amount display color for a given theme and cycleNet value. */
export function resolveAmountColor(theme: CardThemeConfig, cycleNet: number, resolvedTheme: 'light' | 'dark'): string {
  if (cycleNet < 0) return resolvedTheme === 'light' ? '#DC2626' : '#F43F5E';
  if (cycleNet === 0) return resolvedTheme === 'light' ? '#999999' : '#A1A1AA';
  if (theme.id === 'dual_tone') return resolvedTheme === 'light' ? '#A8871E' : '#D4AF37';
  return theme.textPrimary;
}

/** Legacy single-variant record for Settings card picker preview (dark only). */
export const CARD_THEMES_DARK: Record<CardTheme, CardThemeConfig> = Object.fromEntries(
  Object.entries(CARD_THEMES).map(([k, v]) => [k, v.dark])
) as Record<CardTheme, CardThemeConfig>;
