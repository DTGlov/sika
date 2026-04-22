ALTER TABLE monthly_recaps
ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;
