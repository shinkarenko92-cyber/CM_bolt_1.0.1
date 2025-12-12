-- Add deleted_at column to properties table for soft delete
-- This allows properties to be "deleted" without actually removing them from the database

ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

-- Add index for efficient filtering of non-deleted properties
CREATE INDEX IF NOT EXISTS idx_properties_deleted_at 
ON properties(deleted_at) 
WHERE deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN properties.deleted_at IS 'Timestamp when property was soft-deleted. NULL means property is active.';

