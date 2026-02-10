-- Add onboarding_survey JSONB to profiles (e.g. { "import_done": true, "avito_connected": false })
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_survey JSONB;

COMMENT ON COLUMN profiles.onboarding_survey IS 'Onboarding / survey state: import_done, avito_connected, etc.';
