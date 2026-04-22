export type DailyCategory = 'world_markets' | 'africa_rising' | 'tech_trends' | 'young_money';

export interface DailyStory {
  id: string;
  category: DailyCategory;
  title: string;
  summary: string; // 2-3 sentences, AI-generated
  source_name: string;
  source_url: string; // stored but NOT shown to user in v1
  emoji: string;
  published_at: string;
}

export interface DailyDigest {
  id: string;
  digest_date: string; // YYYY-MM-DD
  stories: DailyStory[];
  is_fallback: boolean;
  generated_at: string;
}

export interface UserDailyRead {
  user_id: string;
  digest_date: string;
  read_at: string;
}

export const CATEGORY_LABELS: Record<DailyCategory, string> = {
  world_markets: 'World Markets',
  africa_rising: 'Africa Rising',
  tech_trends:   'Tech & Trends',
  young_money:   'Young Money',
};

export const CATEGORY_COLORS: Record<DailyCategory, string> = {
  world_markets: '#60A5FA', // blue
  africa_rising: '#00D9A3', // Sika green
  tech_trends:   '#A78BFA', // purple
  young_money:   '#FBBF24', // amber/gold
};
