export type WeeklyCardType =
  | 'headline' | 'win' | 'side_eye' | 'trend'
  | 'goal_check' | 'next_move' | 'reflection';

export type WeeklyAccent = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

export type WeeklyCard = {
  id: string;
  type: WeeklyCardType;
  headline: string;
  body: string;
  accent_color?: WeeklyAccent;
  stat?: { label: string; value: string };
  icon?: string;
};

export type WeeklyRecap = {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  recap_data: WeeklyCard[];
  generated_at: string;
  viewed_at: string | null;
  shared_at: string | null;
};
