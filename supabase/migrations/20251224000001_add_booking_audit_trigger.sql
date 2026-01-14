-- Add automatic audit logging trigger for bookings
-- This trigger automatically logs all INSERT/UPDATE/DELETE operations to booking_logs

-- Function to calculate JSONB diff between old and new row
CREATE OR REPLACE FUNCTION jsonb_diff(old_data JSONB, new_data JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  key TEXT;
  old_val JSONB;
  new_val JSONB;
BEGIN
  -- Check all keys from both old and new
  FOR key IN SELECT DISTINCT unnest(ARRAY(
    SELECT jsonb_object_keys(old_data)
    UNION
    SELECT jsonb_object_keys(new_data)
  )) LOOP
    old_val := old_data->key;
    new_val := new_data->key;
    
    -- Only include if values are different
    IF old_val IS DISTINCT FROM new_val THEN
      result := result || jsonb_build_object(
        key,
        jsonb_build_object(
          'old', COALESCE(old_val, 'null'::JSONB),
          'new', COALESCE(new_val, 'null'::JSONB)
        )
      );
    END IF;
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to log booking changes
CREATE OR REPLACE FUNCTION log_booking_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_action TEXT;
  v_changes JSONB;
  v_source TEXT;
  v_property_id UUID;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_changes := NULL; -- No changes for create
    v_source := COALESCE(NEW.source, 'manual');
    v_property_id := NEW.property_id;
    
    -- Insert log entry
    INSERT INTO booking_logs (
      booking_id,
      property_id,
      user_id,
      action,
      changes_json,
      source,
      timestamp
    ) VALUES (
      NEW.id,
      v_property_id,
      v_user_id,
      v_action,
      v_changes,
      v_source,
      NOW()
    );
    
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    
    -- Calculate changes (exclude system fields)
    v_changes := jsonb_diff(
      to_jsonb(OLD) - 'id' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by',
      to_jsonb(NEW) - 'id' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by'
    );
    
    -- Only log if there are actual changes
    IF jsonb_object_keys(v_changes) IS NOT NULL THEN
      v_source := COALESCE(NEW.source, OLD.source, 'manual');
      v_property_id := NEW.property_id;
      
      -- Insert log entry
      INSERT INTO booking_logs (
        booking_id,
        property_id,
        user_id,
        action,
        changes_json,
        source,
        timestamp
      ) VALUES (
        NEW.id,
        v_property_id,
        v_user_id,
        v_action,
        v_changes,
        v_source,
        NOW()
      );
    END IF;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_changes := NULL;
    v_source := COALESCE(OLD.source, 'manual');
    v_property_id := OLD.property_id;
    
    -- Insert log entry
    INSERT INTO booking_logs (
      booking_id,
      property_id,
      user_id,
      action,
      changes_json,
      source,
      timestamp
    ) VALUES (
      OLD.id,
      v_property_id,
      v_user_id,
      v_action,
      v_changes,
      v_source,
      NOW()
    );
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_log_booking_changes ON bookings;

-- Create trigger for automatic logging
CREATE TRIGGER trigger_log_booking_changes
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION log_booking_change();

-- Update RLS policies for bookings table
-- Users can read bookings for their properties
DROP POLICY IF EXISTS "Users can view bookings for their properties" ON bookings;
CREATE POLICY "Users can view bookings for their properties"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = bookings.property_id
      AND properties.owner_id = auth.uid()
    )
  );

-- Users can insert bookings for their properties
DROP POLICY IF EXISTS "Users can insert bookings for their properties" ON bookings;
CREATE POLICY "Users can insert bookings for their properties"
  ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = bookings.property_id
      AND properties.owner_id = auth.uid()
    )
    AND (
      bookings.created_by = auth.uid()
      OR bookings.created_by IS NULL
    )
  );

-- Users can update bookings for their properties
DROP POLICY IF EXISTS "Users can update bookings for their properties" ON bookings;
CREATE POLICY "Users can update bookings for their properties"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = bookings.property_id
      AND properties.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = bookings.property_id
      AND properties.owner_id = auth.uid()
    )
    AND (
      bookings.updated_by = auth.uid()
      OR bookings.updated_by IS NULL
    )
  );

-- Users can delete bookings for their properties
DROP POLICY IF EXISTS "Users can delete bookings for their properties" ON bookings;
CREATE POLICY "Users can delete bookings for their properties"
  ON bookings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = bookings.property_id
      AND properties.owner_id = auth.uid()
    )
  );

-- Update RLS policy for booking_logs to allow trigger to insert
DROP POLICY IF EXISTS "Service role can insert booking logs" ON booking_logs;
CREATE POLICY "Service role can insert booking logs"
  ON booking_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true); -- Allow trigger function to insert

-- Grant necessary permissions for trigger function
GRANT USAGE ON SCHEMA public TO postgres;
GRANT INSERT ON booking_logs TO authenticated;

-- Add comments
COMMENT ON FUNCTION log_booking_change() IS 'Automatically logs all booking changes (INSERT/UPDATE/DELETE) to booking_logs table';
COMMENT ON FUNCTION jsonb_diff(JSONB, JSONB) IS 'Calculates JSONB difference between two objects, returning changed fields with old/new values';
