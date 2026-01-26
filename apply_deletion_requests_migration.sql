-- Применение миграции для создания таблицы deletion_requests
-- Выполнить в Supabase Dashboard → SQL Editor
-- Эта миграция создает таблицу для запросов на удаление аккаунтов

-- Create deletion_requests table for account deletion requests
-- Users request deletion, admins approve/reject

CREATE TABLE IF NOT EXISTS deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Admin who processed the request
  admin_notes TEXT, -- Admin's notes on approval/rejection
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_deletion_requests_user_id ON deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_created_at ON deletion_requests(created_at DESC);

-- Enable RLS
ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own deletion requests
DROP POLICY IF EXISTS "Users can view own deletion requests" ON deletion_requests;
CREATE POLICY "Users can view own deletion requests"
  ON deletion_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own deletion requests
DROP POLICY IF EXISTS "Users can create own deletion requests" ON deletion_requests;
CREATE POLICY "Users can create own deletion requests"
  ON deletion_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can view all deletion requests
DROP POLICY IF EXISTS "Admins can view all deletion requests" ON deletion_requests;
CREATE POLICY "Admins can view all deletion requests"
  ON deletion_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND profiles.is_active = true
    )
  );

-- Policy: Admins can update deletion requests (approve/reject)
DROP POLICY IF EXISTS "Admins can update deletion requests" ON deletion_requests;
CREATE POLICY "Admins can update deletion requests"
  ON deletion_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND profiles.is_active = true
    )
  );

-- Add comments
COMMENT ON TABLE deletion_requests IS 'Account deletion requests from users, processed by admins';
COMMENT ON COLUMN deletion_requests.status IS 'Request status: pending, approved, rejected';
COMMENT ON COLUMN deletion_requests.admin_id IS 'Admin who processed the request';
COMMENT ON COLUMN deletion_requests.admin_notes IS 'Admin notes on approval/rejection decision';
