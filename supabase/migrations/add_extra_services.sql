-- Add extra_services_amount column to bookings table
-- This field stores additional services cost (cleaning, etc.) in rubles (integer, no kopecks)

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS extra_services_amount integer DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN bookings.extra_services_amount IS 'Additional services cost in rubles (integer, no kopecks). Added to total_price calculation.';

