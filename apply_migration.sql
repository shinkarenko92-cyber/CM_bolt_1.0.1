-- Apply migration: Add deleted_at column to properties table
-- This script can be run directly in Supabase Dashboard → SQL Editor
-- Copy and paste this entire script into Supabase Dashboard → SQL Editor → Run

-- Add deleted_at column to properties table for soft delete
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;

-- Add index for efficient filtering of non-deleted properties
CREATE INDEX IF NOT EXISTS idx_properties_deleted_at 
ON properties(deleted_at) 
WHERE deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN properties.deleted_at IS 'Timestamp when property was soft-deleted. NULL means property is active.';

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'properties' AND column_name = 'deleted_at';

