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

export const CARD_THEMES: Record<CardTheme, CardThemeConfig> = {
  classic_gold: {
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
  rose_gold: {
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
  champagne: {
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
  platinum: {
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
  black_on_black: {
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
  dual_tone: {
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
};

/** Resolve the amount display color for a given theme and cycleNet value. */
export function resolveAmountColor(theme: CardThemeConfig, cycleNet: number): string {
  if (cycleNet < 0) return '#F43F5E';
  if (cycleNet === 0) return '#A1A1AA';
  if (theme.id === 'dual_tone') return '#D4AF37';
  return theme.textPrimary;
}
