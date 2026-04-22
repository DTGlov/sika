export type MonthlyCardType =
  | 'headline' | 'win' | 'side_eye' | 'trend'
  | 'goal_check' | 'next_move' | 'reflection';

export type MonthlyAccent = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

export type MonthlyCard = {
  id: string;
  type: MonthlyCardType;
  headline: string;
  body: string;
  accent_color?: MonthlyAccent;
  stat?: { label: string; value: string };
  icon?: string;
};

export type MonthlyRecap = {
  id: string;
  user_id: string;
  month_start: string;
  month_end: string;
  recap_data: MonthlyCard[];
  generated_at: string;
  viewed_at: string | null;
  shared_at: string | null;
};
