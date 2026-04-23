-- 0028_heritage_cards.sql (corrected)

-- DROP old constraint first so UPDATE can succeed
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_card_theme_check;

-- Now migrate values freely
UPDATE profiles 
SET card_theme = 'sankofa' 
WHERE card_theme IS NULL 
   OR card_theme NOT IN (
     'sankofa', 'gye_nyame', 'adinkrahene',
     'copper', 'emerald', 'amber', 'obsidian'
   );

-- Add new constraint with NULL tolerance
ALTER TABLE profiles 
ADD CONSTRAINT profiles_card_theme_check 
CHECK (card_theme IS NULL OR card_theme IN (
  'sankofa', 'gye_nyame', 'adinkrahene',
  'copper', 'emerald', 'amber', 'obsidian'
));

-- Default + NOT NULL
ALTER TABLE profiles 
ALTER COLUMN card_theme SET DEFAULT 'sankofa';

ALTER TABLE profiles 
ALTER COLUMN card_theme SET NOT NULL;