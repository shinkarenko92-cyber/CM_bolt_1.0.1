-- Ensure sort_order column exists in properties table
-- This migration is idempotent and safe to run multiple times

-- Check if sort_order column exists, if not add it
DO $$
BEGIN
  -- Check if column exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'properties' 
    AND column_name = 'sort_order'
  ) THEN
    -- Add sort_order column if it doesn't exist
    ALTER TABLE properties 
    ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
    
    -- Create index for efficient queries
    -- Property groups are removed; keep a single ordering per owner.
    CREATE INDEX IF NOT EXISTS idx_properties_owner_sort_order
    ON properties(owner_id, sort_order);
    
    -- Update existing records to have sort_order based on created_at
    -- This ensures existing properties have a valid sort_order
    WITH numbered_properties AS (
      SELECT 
        id,
        ROW_NUMBER() OVER (PARTITION BY owner_id ORDER BY created_at) - 1 as row_num
      FROM properties
    )
    UPDATE properties p
    SET sort_order = np.row_num
    FROM numbered_properties np
    WHERE p.id = np.id;
    
    RAISE NOTICE 'sort_order column added to properties table';
  ELSE
    RAISE NOTICE 'sort_order column already exists in properties table';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN properties.sort_order IS 'Order of property for display (flat list).';

