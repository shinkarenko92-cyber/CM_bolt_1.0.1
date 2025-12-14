-- Add avito_item_id text column and migrate data from avito_account_id
-- This fixes the issue where avito_account_id was storing item_id instead of account_id

-- Step 1: Add avito_item_id text column if it doesn't exist
ALTER TABLE integrations 
ADD COLUMN IF NOT EXISTS avito_item_id TEXT;

-- Step 2: Migrate data from avito_item_id_text if available
UPDATE integrations 
SET avito_item_id = avito_item_id_text
WHERE avito_item_id IS NULL 
  AND avito_item_id_text IS NOT NULL
  AND platform = 'avito';

-- Step 3: If avito_item_id is still NULL, try to get it from avito_account_id
-- (in case old records had item_id stored in avito_account_id)
UPDATE integrations 
SET avito_item_id = avito_account_id
WHERE avito_item_id IS NULL 
  AND avito_account_id IS NOT NULL
  AND platform = 'avito'
  -- Only if avito_account_id looks like a numeric item_id (not an account_id which is usually shorter)
  AND LENGTH(avito_account_id) > 6;

-- Add comment
COMMENT ON COLUMN integrations.avito_item_id IS 'Avito item ID (advertisement ID) as TEXT - use this for API calls to /items/{item_id}';
COMMENT ON COLUMN integrations.avito_account_id IS 'Avito account ID (user_id) - use this for API calls to /accounts/{account_id}/items/{item_id}/bookings';
