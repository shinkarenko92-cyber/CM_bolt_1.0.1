-- Add avito_booking_id column to bookings table for unique identification of Avito bookings
-- This allows proper upsert without duplicates

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS avito_booking_id TEXT;

-- Create unique index on avito_booking_id for Avito bookings only
-- This ensures no duplicate bookings from Avito
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_avito_booking_id_unique 
ON bookings(avito_booking_id) 
WHERE avito_booking_id IS NOT NULL AND source = 'avito';

-- Add index for efficient lookups by avito_booking_id
CREATE INDEX IF NOT EXISTS idx_bookings_avito_booking_id 
ON bookings(avito_booking_id) 
WHERE avito_booking_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN bookings.avito_booking_id IS 'Unique identifier from Avito API (booking.id or avito_booking_id field)';
