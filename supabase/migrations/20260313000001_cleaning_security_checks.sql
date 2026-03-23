-- Security improvements for cleaning module

-- 4.2 CHECK constraints on cleaning_tasks.status and cleaning_photos.type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cleaning_tasks_status_check'
  ) THEN
    ALTER TABLE cleaning_tasks
      ADD CONSTRAINT cleaning_tasks_status_check
      CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cleaning_photos_type_check'
  ) THEN
    ALTER TABLE cleaning_photos
      ADD CONSTRAINT cleaning_photos_type_check
      CHECK (type IN ('before', 'after'));
  END IF;
END $$;

-- 4.3 Restrict cleaner UPDATE to only status column via trigger
CREATE OR REPLACE FUNCTION prevent_cleaner_field_update()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'cleaner'
  ) THEN
    IF NEW.property_id IS DISTINCT FROM OLD.property_id
       OR NEW.cleaner_id IS DISTINCT FROM OLD.cleaner_id
       OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
       OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time
       OR NEW.door_code IS DISTINCT FROM OLD.door_code
       OR NEW.address IS DISTINCT FROM OLD.address
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'Cleaner can only update task status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_cleaner_field_update ON cleaning_tasks;
CREATE TRIGGER trg_prevent_cleaner_field_update
  BEFORE UPDATE ON cleaning_tasks
  FOR EACH ROW
  EXECUTE FUNCTION prevent_cleaner_field_update();
