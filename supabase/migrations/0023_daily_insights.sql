CREATE TABLE daily_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_date date NOT NULL,
  insight_data jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  UNIQUE(user_id, insight_date)
);

CREATE INDEX idx_daily_insights_user_date
  ON daily_insights(user_id, insight_date DESC);

ALTER TABLE daily_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own insights"
  ON daily_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own insights"
  ON daily_insights FOR UPDATE
  USING (auth.uid() = user_id);
