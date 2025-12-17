-- Remove property groups feature (table + group_id) and flatten ordering into properties.sort_order
-- Idempotent: safe to run multiple times

DO $$
DECLARE
  has_property_groups boolean := to_regclass('public.property_groups') IS NOT NULL;
  has_group_id boolean := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'properties'
      AND column_name = 'group_id'
  );
BEGIN
  -- Best-effort: flatten ordering (preserve group order first, then property order) into properties.sort_order
  IF has_property_groups AND has_group_id THEN
    WITH ranked AS (
      SELECT
        p.id,
        ROW_NUMBER() OVER (
          PARTITION BY p.owner_id
          ORDER BY
            COALESCE(g.sort_order, 2147483647),
            COALESCE(p.sort_order, 2147483647),
            p.created_at
        ) - 1 AS new_sort_order
      FROM properties p
      LEFT JOIN property_groups g ON g.id = p.group_id
    )
    UPDATE properties p
    SET sort_order = r.new_sort_order
    FROM ranked r
    WHERE p.id = r.id;
  ELSE
    -- If groups don't exist, ensure sort_order is consistent within owner_id
    WITH ranked AS (
      SELECT
        p.id,
        ROW_NUMBER() OVER (
          PARTITION BY p.owner_id
          ORDER BY
            COALESCE(p.sort_order, 2147483647),
            p.created_at
        ) - 1 AS new_sort_order
      FROM properties p
    )
    UPDATE properties p
    SET sort_order = r.new_sort_order
    FROM ranked r
    WHERE p.id = r.id;
  END IF;

  -- Drop indexes that reference group_id (if they exist)
  DROP INDEX IF EXISTS idx_property_groups_user_id;
  DROP INDEX IF EXISTS idx_property_groups_sort_order;
  DROP INDEX IF EXISTS idx_properties_group_id;
  DROP INDEX IF EXISTS idx_properties_sort_order;
  DROP INDEX IF EXISTS idx_properties_ungrouped_sort_order;

  -- Drop column group_id (removes FK to property_groups if present)
  IF has_group_id THEN
    ALTER TABLE properties DROP COLUMN IF EXISTS group_id;
  END IF;

  -- Drop the table (and its RLS policies/triggers) if it exists
  IF has_property_groups THEN
    DROP TABLE IF EXISTS property_groups CASCADE;
  END IF;

  -- Ensure a simple index for ordering per owner
  CREATE INDEX IF NOT EXISTS idx_properties_owner_sort_order
  ON properties(owner_id, sort_order);

  -- Update comment to reflect new meaning
  COMMENT ON COLUMN properties.sort_order IS 'Order of property for display (flat list).';
END $$;


