-- Fix 409/23503 on DELETE booking: trigger ran AFTER DELETE, so booking_id was already
-- removed from bookings when inserting into booking_logs (FK violation).
-- 1) Allow booking_id NULL and ON DELETE SET NULL so delete-log row is kept.
-- 2) Log deletes in BEFORE DELETE trigger so the row still exists when we insert.

-- 1. Allow NULL and change FK to SET NULL (so log row is kept when booking is deleted)
ALTER TABLE booking_logs ALTER COLUMN booking_id DROP NOT NULL;

ALTER TABLE booking_logs DROP CONSTRAINT IF EXISTS booking_logs_booking_id_fkey;

ALTER TABLE booking_logs
  ADD CONSTRAINT booking_logs_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

-- 2. Replace single AFTER trigger with: AFTER INSERT/UPDATE + BEFORE DELETE
DROP TRIGGER IF EXISTS trigger_log_booking_changes ON bookings;

CREATE TRIGGER trigger_log_booking_changes_after
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION log_booking_change();

CREATE TRIGGER trigger_log_booking_changes_before_delete
  BEFORE DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION log_booking_change();
