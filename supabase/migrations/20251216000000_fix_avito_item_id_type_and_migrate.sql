-- Fix avito_item_id: change from BIGINT to TEXT and migrate data from avito_account_id if needed
-- This fixes the issue where avito_account_id was storing item_id instead of account_id

-- Step 1: Add new avito_item_id_text column if it doesn't exist
ALTER TABLE integrations 
ADD COLUMN IF NOT EXISTS avito_item_id_text TEXT;

-- Step 2: Migrate data from avito_item_id (BIGINT) to avito_item_id_text (TEXT)
-- Convert existing BIGINT values to TEXT
UPDATE integrations 
SET avito_item_id_text = CAST(avito_item_id AS TEXT)
WHERE avito_item_id IS NOT NULL 
  AND avito_item_id_text IS NULL
  AND platform = 'avito';

-- Step 3: If avito_item_id_text is still NULL, try to get it from avito_account_id
-- (in case old records had item_id stored in avito_account_id)
UPDATE integrations 
SET avito_item_id_text = avito_account_id
WHERE avito_item_id_text IS NULL 
  AND avito_account_id IS NOT NULL
  AND platform = 'avito'
  -- Only if avito_account_id looks like a numeric item_id (not an account_id which is usually shorter)
  AND LENGTH(avito_account_id) > 6;

-- Step 4: Drop old BIGINT column and rename TEXT column
-- First, ensure all records have avito_item_id_text populated
-- (We keep both columns for now to avoid data loss)

-- Add comment
COMMENT ON COLUMN integrations.avito_item_id_text IS 'Avito item ID (advertisement ID) as TEXT - use this for API calls to /items/{item_id}';
COMMENT ON COLUMN integrations.avito_account_id IS 'Avito account ID (user_id) - use this for API calls to /accounts/{account_id}/items/{item_id}/bookings';

-- Note: We keep both avito_item_id (BIGINT) and avito_item_id_text (TEXT) for backward compatibility
-- In code, prefer avito_item_id_text for API calls
