-- Add audit fields to bookings table
-- Add created_by, updated_by, source (if not exists), updated_at (if not exists)

-- Add created_by column (user_id who created the booking)
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add updated_by column (user_id who last updated the booking)
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Ensure source column exists (should already exist, but adding IF NOT EXISTS for safety)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'bookings' 
    AND column_name = 'source'
  ) THEN
    ALTER TABLE bookings ADD COLUMN source TEXT DEFAULT 'manual';
  END IF;
END $$;

-- Ensure updated_at column exists and has trigger
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'bookings' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Create trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create booking_logs table for audit trail
CREATE TABLE IF NOT EXISTS booking_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'created', 'updated', 'deleted', 'status_changed', etc.
  changes_json JSONB, -- JSON object with old/new values for changed fields
  source TEXT, -- 'manual', 'avito', 'cian', 'webhook', etc.
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_booking_logs_booking_id ON booking_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_logs_property_id ON booking_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_booking_logs_user_id ON booking_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_logs_timestamp ON booking_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_booking_logs_action ON booking_logs(action);

-- Add RLS policies for booking_logs
ALTER TABLE booking_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view logs for bookings they own (through property ownership)
CREATE POLICY "Users can view booking logs for their properties"
  ON booking_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = booking_logs.property_id
      AND properties.owner_id = auth.uid()
    )
  );

-- Policy: Only system (service role) can insert logs (via Edge Function)
-- Regular users cannot insert logs directly
CREATE POLICY "Service role can insert booking logs"
  ON booking_logs
  FOR INSERT
  WITH CHECK (false); -- Disable direct inserts, use Edge Function

-- Add comments for documentation
COMMENT ON TABLE booking_logs IS 'Audit log for booking changes (created, updated, deleted)';
COMMENT ON COLUMN booking_logs.action IS 'Action type: created, updated, deleted, status_changed, etc.';
COMMENT ON COLUMN booking_logs.changes_json IS 'JSON object with field changes: {"field_name": {"old": "old_value", "new": "new_value"}}';
COMMENT ON COLUMN booking_logs.source IS 'Source of the change: manual, avito, cian, webhook, etc.';
COMMENT ON COLUMN bookings.created_by IS 'User ID who created the booking';
COMMENT ON COLUMN bookings.updated_by IS 'User ID who last updated the booking';
