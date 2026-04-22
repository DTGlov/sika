export type InsightKind =
  | 'budget_pacing'
  | 'category_trend'
  | 'goal_nudge'
  | 'streak_boost'
  | 'subscription_alert'
  | 'reflection'
  | 'quick_win';

export type InsightAccent = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

export type DailyInsight = {
  kind: InsightKind;
  headline: string;
  body: string;
  accent: InsightAccent;
  stat?: { label: string; value: string };
  icon?: string;
};

export type DailyInsightRow = {
  id: string;
  user_id: string;
  insight_date: string;
  insight_data: DailyInsight;
  generated_at: string;
  dismissed_at: string | null;
};
