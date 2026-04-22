-- Rename table
ALTER TABLE weekly_recaps RENAME TO monthly_recaps;

-- Rename columns for clarity
ALTER TABLE monthly_recaps RENAME COLUMN week_start TO month_start;
ALTER TABLE monthly_recaps RENAME COLUMN week_end TO month_end;

-- Drop old index, add new
DROP INDEX IF EXISTS idx_weekly_recaps_user_week;
CREATE INDEX idx_monthly_recaps_user_month
  ON monthly_recaps(user_id, month_start DESC);

-- Update RLS policy names (drop + recreate)
DROP POLICY IF EXISTS "Users can read their own recaps" ON monthly_recaps;
DROP POLICY IF EXISTS "Users can update their own recaps (view/share tracking)" ON monthly_recaps;

CREATE POLICY "Users can read their own monthly recaps"
  ON monthly_recaps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own monthly recaps"
  ON monthly_recaps FOR UPDATE
  USING (auth.uid() = user_id);

-- Update unique constraint
ALTER TABLE monthly_recaps DROP CONSTRAINT IF EXISTS weekly_recaps_user_id_week_start_key;
ALTER TABLE monthly_recaps ADD CONSTRAINT monthly_recaps_user_id_month_start_key
  UNIQUE(user_id, month_start);
