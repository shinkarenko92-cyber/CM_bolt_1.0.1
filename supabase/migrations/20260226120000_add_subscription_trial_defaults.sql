-- Ensure subscription_tier and subscription_expires_at exist on profiles (for trial and paid tiers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'subscription_tier'
  ) THEN
    ALTER TABLE profiles ADD COLUMN subscription_tier text DEFAULT 'free' NOT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'subscription_expires_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN subscription_expires_at timestamptz;
  END IF;
END $$;

COMMENT ON COLUMN profiles.subscription_tier IS 'free | trial | starter | pro | enterprise';
COMMENT ON COLUMN profiles.subscription_expires_at IS 'When trial or subscription period ends; null for unlimited';
