-- Add color column to property_groups table
ALTER TABLE property_groups 
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3b82f6';

-- Update PropertyGroup type comment
COMMENT ON COLUMN property_groups.color IS 'Hex color code for group display (e.g., #3b82f6)';

