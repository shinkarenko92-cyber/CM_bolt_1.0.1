-- Add avito_user_id and avito_item_id columns to integrations table
-- These are required for Avito STR API endpoints: /realty/v1/{user_id}/items/{item_id}/...

-- Add avito_user_id as BIGINT (6-8 digits, e.g., 4720770)
ALTER TABLE integrations 
ADD COLUMN IF NOT EXISTS avito_user_id BIGINT;

-- Add avito_item_id as BIGINT (10-12 digits, e.g., 2336174775)
-- Note: avito_item_id might already exist as TEXT, so we check and convert if needed
DO $$
BEGIN
  -- If avito_item_id exists as TEXT, we'll keep both for backward compatibility
  -- The code will use the BIGINT version if available
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' 
    AND column_name = 'avito_item_id' 
    AND data_type = 'bigint'
  ) THEN
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS avito_item_id BIGINT;
  END IF;
END $$;

-- Migrate data from avito_account_id to avito_user_id if available
UPDATE integrations 
SET avito_user_id = CAST(avito_account_id AS BIGINT)
WHERE avito_user_id IS NULL 
  AND avito_account_id IS NOT NULL
  AND platform = 'avito'
  -- Only if avito_account_id looks like a short account number (6-8 digits)
  AND LENGTH(avito_account_id) >= 6
  AND LENGTH(avito_account_id) <= 8
  AND avito_account_id ~ '^[0-9]+$';

-- Migrate avito_item_id from TEXT to BIGINT if needed
UPDATE integrations 
SET avito_item_id = CAST(avito_item_id::TEXT AS BIGINT)
WHERE avito_item_id IS NULL 
  AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' 
    AND column_name = 'avito_item_id' 
    AND data_type = 'text'
  )
  AND platform = 'avito'
  AND avito_item_id::TEXT ~ '^[0-9]{10,12}$';

-- Add comments
COMMENT ON COLUMN integrations.avito_user_id IS 'Avito user_id (account number) as BIGINT - 6-8 digits like 4720770, required for STR API endpoints /realty/v1/{user_id}/items/{item_id}/...';
COMMENT ON COLUMN integrations.avito_item_id IS 'Avito item_id (advertisement ID) as BIGINT - 10-12 digits like 2336174775, required for STR API endpoints /realty/v1/{user_id}/items/{item_id}/...';
COMMENT ON COLUMN integrations.avito_account_id IS 'Legacy field - use avito_user_id instead for STR API';

