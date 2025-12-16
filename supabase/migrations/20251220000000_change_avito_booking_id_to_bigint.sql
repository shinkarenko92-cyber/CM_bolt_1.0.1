-- Change avito_booking_id column type from TEXT to BIGINT
-- This matches the Avito API response type (number)

-- First, drop the unique index
DROP INDEX IF EXISTS idx_bookings_avito_booking_id_unique;
DROP INDEX IF EXISTS idx_bookings_avito_booking_id;

-- Convert existing TEXT values to BIGINT (if they are numeric)
-- Set NULL for non-numeric values
UPDATE bookings 
SET avito_booking_id = NULL 
WHERE avito_booking_id IS NOT NULL 
  AND (avito_booking_id !~ '^[0-9]+$' OR avito_booking_id::bigint IS NULL);

-- Change column type to BIGINT
ALTER TABLE bookings 
ALTER COLUMN avito_booking_id TYPE BIGINT 
USING CASE 
  WHEN avito_booking_id ~ '^[0-9]+$' THEN avito_booking_id::bigint 
  ELSE NULL 
END;

-- Recreate unique index on avito_booking_id for Avito bookings only
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_avito_booking_id_unique 
ON bookings(avito_booking_id) 
WHERE avito_booking_id IS NOT NULL AND source = 'avito';

-- Recreate index for efficient lookups by avito_booking_id
CREATE INDEX IF NOT EXISTS idx_bookings_avito_booking_id 
ON bookings(avito_booking_id) 
WHERE avito_booking_id IS NOT NULL;

-- Update comment
COMMENT ON COLUMN bookings.avito_booking_id IS 'Unique identifier from Avito API (booking.id or avito_booking_id field) as BIGINT';

