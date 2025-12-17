-- Remove avito_item_id_text column - we use only avito_item_id (TEXT) now
-- This fixes the PostgREST schema cache error

-- Step 1: Ensure all data is migrated to avito_item_id
-- If avito_item_id is NULL but avito_item_id_text has data, copy it
DO $$
DECLARE
  has_text_col BOOLEAN;
  item_id_type TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'integrations'
      AND column_name = 'avito_item_id_text'
  ) INTO has_text_col;

  IF NOT has_text_col THEN
    RAISE NOTICE 'avito_item_id_text column does not exist, skipping data migration';
    RETURN;
  END IF;

  SELECT data_type INTO item_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'integrations'
    AND column_name = 'avito_item_id';

  IF item_id_type = 'bigint' THEN
    UPDATE integrations
    SET avito_item_id = CAST(avito_item_id_text AS BIGINT)
    WHERE platform = 'avito'
      AND avito_item_id IS NULL
      AND avito_item_id_text IS NOT NULL
      AND avito_item_id_text != ''
      AND avito_item_id_text ~ '^[0-9]+$';
  ELSE
    UPDATE integrations
    SET avito_item_id = avito_item_id_text
    WHERE platform = 'avito'
      AND avito_item_id IS NULL
      AND avito_item_id_text IS NOT NULL
      AND avito_item_id_text != '';
  END IF;
END $$;

-- Step 2: Drop the column if it exists
DO $$
BEGIN
  -- Check if column exists before dropping
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'integrations' 
      AND column_name = 'avito_item_id_text'
  ) THEN
    ALTER TABLE integrations DROP COLUMN avito_item_id_text;
    RAISE NOTICE 'Dropped avito_item_id_text column from integrations table';
  ELSE
    RAISE NOTICE 'avito_item_id_text column does not exist, skipping drop';
  END IF;
END $$;

-- Step 3: Log the result
DO $$
DECLARE
  column_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'integrations' 
      AND column_name = 'avito_item_id_text'
  ) INTO column_exists;
  
  IF column_exists THEN
    RAISE WARNING 'avito_item_id_text column still exists after drop attempt';
  ELSE
    RAISE NOTICE 'Successfully removed avito_item_id_text column';
  END IF;
END $$;

