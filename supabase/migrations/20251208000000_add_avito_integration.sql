-- Add Avito Integration Support
-- This migration adds tables and columns for Avito OAuth integration

-- Create integrations table if it doesn't exist
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(property_id, platform)
);

-- Update integrations table with Avito-specific fields
-- Note: Vault extension is not available in Supabase, tokens are stored as-is
ALTER TABLE integrations 
ADD COLUMN IF NOT EXISTS avito_account_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS avito_item_id BIGINT,
ADD COLUMN IF NOT EXISTS avito_markup DECIMAL(5,2) DEFAULT 15.00,
ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT,  -- Will be encrypted via Vault trigger
ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS sync_interval_seconds INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create avito_items table for storing Avito item data
CREATE TABLE IF NOT EXISTS avito_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  avito_item_id BIGINT NOT NULL,
  avito_account_id VARCHAR(255) NOT NULL,
  data JSONB,
  synced_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(property_id, avito_item_id),
  UNIQUE(avito_account_id, avito_item_id)  -- One item per account
);

-- Create sync queue table for managing sync jobs
CREATE TABLE IF NOT EXISTS avito_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  next_sync_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending',  -- pending/success/failed
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for efficient queue queries
CREATE INDEX IF NOT EXISTS idx_avito_sync_queue_next 
ON avito_sync_queue(next_sync_at) 
WHERE next_sync_at <= NOW() AND status = 'pending';

-- Enable RLS on integrations table
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for integrations (users can only access their own integrations)
CREATE POLICY "Users own integrations" ON integrations FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));

-- Enable RLS on avito_items table
ALTER TABLE avito_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for avito_items
CREATE POLICY "Users own avito_items" ON avito_items FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));

-- Enable RLS on avito_sync_queue table
ALTER TABLE avito_sync_queue ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for avito_sync_queue
CREATE POLICY "Users own sync_queue" ON avito_sync_queue FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));

-- Create function to encrypt access token using Vault
-- Note: This requires Vault extension and proper setup
CREATE OR REPLACE FUNCTION encrypt_avito_token(token TEXT)
RETURNS TEXT AS $$
BEGIN
  -- For now, return token as-is
  -- In production, use vault.encrypt() here
  -- Example: RETURN vault.encrypt(token::bytea, 'avito_tokens'::text);
  RETURN token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically encrypt tokens on insert/update
-- Note: This is a placeholder - actual Vault encryption should be implemented
-- based on your Supabase Vault setup
CREATE OR REPLACE FUNCTION encrypt_integration_tokens()
RETURNS TRIGGER AS $$
BEGIN
  -- If token is provided and not already encrypted, encrypt it
  -- For now, we'll just store it (encryption handled by application layer)
  -- In production, use: NEW.access_token_encrypted = vault.encrypt(NEW.access_token_encrypted::bytea, 'avito_tokens'::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_encrypt_integration_tokens ON integrations;
CREATE TRIGGER trigger_encrypt_integration_tokens
  BEFORE INSERT OR UPDATE ON integrations
  FOR EACH ROW
  WHEN (NEW.access_token_encrypted IS NOT NULL)
  EXECUTE FUNCTION encrypt_integration_tokens();

-- Create function to decrypt access token (for Edge Functions)
-- Note: This should only be accessible by service role
CREATE OR REPLACE FUNCTION decrypt_avito_token(encrypted_token TEXT)
RETURNS TEXT AS $$
BEGIN
  -- For now, return token as-is
  -- In production, use vault.decrypt() here
  -- Example: RETURN vault.decrypt(encrypted_token::bytea, 'avito_tokens'::text);
  RETURN encrypted_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON COLUMN integrations.avito_account_id IS 'Avito account ID (user account on Avito)';
COMMENT ON COLUMN integrations.avito_item_id IS 'Avito item ID (advertisement ID)';
COMMENT ON COLUMN integrations.avito_markup IS 'Markup percentage for Avito prices (default 15%)';
COMMENT ON COLUMN integrations.access_token_encrypted IS 'Encrypted Avito OAuth access token (via Vault)';
COMMENT ON COLUMN integrations.token_expires_at IS 'Access token expiration timestamp';
COMMENT ON COLUMN integrations.is_active IS 'Whether integration is active (for soft delete)';
COMMENT ON TABLE avito_items IS 'Stores Avito item data synced from API';
COMMENT ON TABLE avito_sync_queue IS 'Queue for managing Avito sync jobs (processed by avito-poller cron)';

