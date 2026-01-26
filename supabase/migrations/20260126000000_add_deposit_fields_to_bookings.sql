-- Add deposit fields to bookings table
-- This migration adds fields for tracking deposit amount and status

-- Add deposit_amount column (integer, can be NULL)
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS deposit_amount INTEGER;

-- Add deposit_received column (boolean, default FALSE)
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS deposit_received BOOLEAN DEFAULT FALSE;

-- Add deposit_returned column (boolean, default FALSE)
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS deposit_returned BOOLEAN DEFAULT FALSE;

-- Add comments to columns
COMMENT ON COLUMN bookings.deposit_amount IS 'Deposit amount in the same currency as total_price (integer, no kopecks)';
COMMENT ON COLUMN bookings.deposit_received IS 'Whether the deposit has been received';
COMMENT ON COLUMN bookings.deposit_returned IS 'Whether the deposit has been returned';
