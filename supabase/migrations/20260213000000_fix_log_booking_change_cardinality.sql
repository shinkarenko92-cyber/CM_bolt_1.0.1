-- Fix "query returned more than one row" (21000) on booking update.
-- log_booking_change() used jsonb_object_keys(v_changes) in scalar context;
-- jsonb_object_keys is set-returning and caused cardinality violation.
CREATE OR REPLACE FUNCTION log_booking_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_action TEXT;
  v_changes JSONB;
  v_source TEXT;
  v_property_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_user_id := COALESCE(NEW.created_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    v_user_id := COALESCE(NEW.updated_by, OLD.updated_by, auth.uid());
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_changes := NULL;
    v_source := COALESCE(NEW.source, 'manual');
    v_property_id := NEW.property_id;
    INSERT INTO booking_logs (booking_id, property_id, user_id, action, changes_json, source, timestamp)
    VALUES (NEW.id, v_property_id, v_user_id, v_action, v_changes, v_source, NOW());
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_changes := jsonb_diff(
      to_jsonb(OLD) - 'id' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by',
      to_jsonb(NEW) - 'id' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by'
    );
    -- Single-row check: do not use set-returning jsonb_object_keys() in scalar context
    IF v_changes IS NOT NULL AND v_changes <> '{}'::jsonb THEN
      v_source := COALESCE(NEW.source, OLD.source, 'manual');
      v_property_id := NEW.property_id;
      INSERT INTO booking_logs (booking_id, property_id, user_id, action, changes_json, source, timestamp)
      VALUES (NEW.id, v_property_id, v_user_id, v_action, v_changes, v_source, NOW());
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_changes := NULL;
    v_source := COALESCE(OLD.source, 'manual');
    v_property_id := OLD.property_id;
    INSERT INTO booking_logs (booking_id, property_id, user_id, action, changes_json, source, timestamp)
    VALUES (OLD.id, v_property_id, v_user_id, v_action, v_changes, v_source, NOW());
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
