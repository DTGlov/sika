CREATE TABLE weekly_recaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  recap_data jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  shared_at timestamptz,
  UNIQUE(user_id, week_start)
);

CREATE INDEX idx_weekly_recaps_user_week
  ON weekly_recaps(user_id, week_start DESC);

ALTER TABLE weekly_recaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own recaps"
  ON weekly_recaps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own recaps (view/share tracking)"
  ON weekly_recaps FOR UPDATE
  USING (auth.uid() = user_id);
