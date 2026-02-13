-- Add OAuth scope storage for provider integrations
ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS scope TEXT;

COMMENT ON COLUMN integrations.scope IS 'OAuth scope granted by provider';
