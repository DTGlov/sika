-- Migrate all existing card_theme values to sankofa
UPDATE profiles
SET card_theme = 'sankofa'
WHERE card_theme NOT IN (
  'sankofa', 'gye_nyame', 'adinkrahene',
  'copper', 'emerald', 'amber', 'obsidian'
);

-- Drop old check constraint (Postgres auto-names it profiles_card_theme_check)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_card_theme_check;

-- Add new check constraint for heritage themes
ALTER TABLE profiles
ADD CONSTRAINT profiles_card_theme_check
CHECK (card_theme IN (
  'sankofa', 'gye_nyame', 'adinkrahene',
  'copper', 'emerald', 'amber', 'obsidian'
));

-- Update column default
ALTER TABLE profiles
ALTER COLUMN card_theme SET DEFAULT 'sankofa';
