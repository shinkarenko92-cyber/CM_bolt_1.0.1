-- Add guest_name and guest_phone columns to bookings table if they don't exist
-- This migration ensures that guest contact information from Avito can be stored

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS guest_name TEXT;

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS guest_phone TEXT;

-- Add index for search by guest name
CREATE INDEX IF NOT EXISTS idx_bookings_guest_name 
ON bookings(guest_name) 
WHERE guest_name IS NOT NULL;

-- Add index for search by guest phone
CREATE INDEX IF NOT EXISTS idx_bookings_guest_phone 
ON bookings(guest_phone) 
WHERE guest_phone IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN bookings.guest_name IS 'Guest name from booking source (Avito, Airbnb, etc.)';
COMMENT ON COLUMN bookings.guest_phone IS 'Guest phone number in international format (cleaned, digits and + only)';




