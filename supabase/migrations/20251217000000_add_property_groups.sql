-- Create property_groups table for grouping properties
CREATE TABLE IF NOT EXISTS property_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add group_id and sort_order to properties table
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES property_groups(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_property_groups_user_id ON property_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_property_groups_sort_order ON property_groups(user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_properties_group_id ON properties(group_id);
CREATE INDEX IF NOT EXISTS idx_properties_sort_order ON properties(group_id, sort_order) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_ungrouped_sort_order ON properties(owner_id, sort_order) WHERE group_id IS NULL;

-- Enable RLS
ALTER TABLE property_groups ENABLE ROW LEVEL SECURITY;

-- RLS policies for property_groups
-- Users can view their own groups
CREATE POLICY "Users can view their own property groups"
  ON property_groups FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own groups
CREATE POLICY "Users can insert their own property groups"
  ON property_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own groups
CREATE POLICY "Users can update their own property groups"
  ON property_groups FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own groups
CREATE POLICY "Users can delete their own property groups"
  ON property_groups FOR DELETE
  USING (auth.uid() = user_id);

-- Update existing RLS policies on properties to allow group_id updates
-- (Assuming existing policies allow users to update their own properties)

-- Add comments for documentation
COMMENT ON TABLE property_groups IS 'Groups for organizing properties in the calendar view';
COMMENT ON COLUMN property_groups.name IS 'Display name of the group';
COMMENT ON COLUMN property_groups.user_id IS 'Owner of the group';
COMMENT ON COLUMN property_groups.sort_order IS 'Order of the group within user''s groups';
COMMENT ON COLUMN properties.group_id IS 'Optional group this property belongs to';
COMMENT ON COLUMN properties.sort_order IS 'Order of property within its group (or ungrouped properties)';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for property_groups updated_at
CREATE TRIGGER update_property_groups_updated_at
  BEFORE UPDATE ON property_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
