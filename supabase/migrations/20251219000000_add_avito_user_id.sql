-- Add avito_user_id column to integrations table
-- This is the short account number (user_id) required for Avito STR API endpoints
-- Format: /realty/v1/{user_id}/items/{item_id}/...

ALTER TABLE integrations 
ADD COLUMN IF NOT EXISTS avito_user_id VARCHAR(50);

-- Migrate data from avito_account_id if available
UPDATE integrations 
SET avito_user_id = avito_account_id
WHERE avito_user_id IS NULL 
  AND avito_account_id IS NOT NULL
  AND platform = 'avito'
  -- Only if avito_account_id looks like a short account number (not a long item_id)
  AND LENGTH(avito_account_id) <= 10;

-- Add comment
COMMENT ON COLUMN integrations.avito_user_id IS 'Avito user_id (account number) - short number like 4720770, required for STR API endpoints /realty/v1/{user_id}/items/{item_id}/...';
COMMENT ON COLUMN integrations.avito_account_id IS 'Legacy field - use avito_user_id instead for STR API';
COMMENT ON COLUMN integrations.avito_item_id IS 'Avito item_id (advertisement ID) - long number like 2336174775, required for STR API endpoints /realty/v1/{user_id}/items/{item_id}/...';

