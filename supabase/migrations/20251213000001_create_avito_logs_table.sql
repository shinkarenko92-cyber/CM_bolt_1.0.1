-- Create avito_logs table for logging Avito API operations
-- This table stores logs of all Avito API calls for debugging and auditing

CREATE TABLE IF NOT EXISTS avito_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- e.g., 'close_availability', 'sync', 'refresh_token'
  status TEXT NOT NULL, -- 'success', 'error'
  error TEXT, -- Error message if status is 'error'
  details JSONB, -- Additional details about the operation
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_avito_logs_integration_id ON avito_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_avito_logs_property_id ON avito_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_avito_logs_created_at ON avito_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avito_logs_action ON avito_logs(action);

-- Enable RLS
ALTER TABLE avito_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: users can only access logs for their own properties
DROP POLICY IF EXISTS "Users own avito_logs" ON avito_logs;
CREATE POLICY "Users own avito_logs" ON avito_logs FOR ALL
  USING (
    property_id IN (
      SELECT id FROM properties WHERE owner_id = auth.uid()
    )
  );

-- Add comments for documentation
COMMENT ON TABLE avito_logs IS 'Logs of Avito API operations for debugging and auditing';
COMMENT ON COLUMN avito_logs.action IS 'Type of operation (e.g., close_availability, sync, refresh_token)';
COMMENT ON COLUMN avito_logs.status IS 'Operation status: success or error';
COMMENT ON COLUMN avito_logs.error IS 'Error message if status is error';
COMMENT ON COLUMN avito_logs.details IS 'Additional operation details in JSON format';

