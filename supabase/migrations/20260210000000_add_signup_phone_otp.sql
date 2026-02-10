-- Add first_name, last_name, phone, phone_confirmed_at to profiles (if not exist)
-- Create phone_otp table for OTP verification (stub flow)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'first_name') THEN
    ALTER TABLE profiles ADD COLUMN first_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_name') THEN
    ALTER TABLE profiles ADD COLUMN last_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone') THEN
    ALTER TABLE profiles ADD COLUMN phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone_confirmed_at') THEN
    ALTER TABLE profiles ADD COLUMN phone_confirmed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Table for OTP codes (stub: no real SMS)
CREATE TABLE IF NOT EXISTS phone_otp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_otp_user_phone ON phone_otp(user_id, phone);
CREATE INDEX IF NOT EXISTS idx_phone_otp_expires_at ON phone_otp(expires_at);

ALTER TABLE phone_otp ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent)
DROP POLICY IF EXISTS "Users can read own phone_otp" ON phone_otp;
CREATE POLICY "Users can read own phone_otp"
  ON phone_otp FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own phone_otp" ON phone_otp;
CREATE POLICY "Users can delete own phone_otp"
  ON phone_otp FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
