ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS theme_preference text DEFAULT 'dark'
CHECK (theme_preference IN ('light', 'dark'));
