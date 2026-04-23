ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS haptics_enabled boolean DEFAULT true;
