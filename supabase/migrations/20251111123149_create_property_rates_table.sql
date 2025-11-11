/*
  # Create Property Rates Table for Dynamic Pricing
  
  ## Overview
  This migration creates a property_rates table to store daily pricing and minimum stay
  requirements per property. This enables dynamic pricing management directly from the calendar.
  
  ## Changes
  
  1. New Tables
    - `property_rates` - Stores daily pricing and minimum stay rules per property
      - `id` (uuid, primary key) - Unique identifier
      - `property_id` (uuid, foreign key) - Reference to property
      - `date` (date) - Specific date for the rate
      - `daily_price` (numeric) - Price for this specific date
      - `min_stay` (integer) - Minimum number of nights required for bookings starting on this date
      - `currency` (text) - Currency code (e.g., 'RUB', 'EUR', 'USD')
      - `created_at` (timestamptz) - When the rate was created
      - `updated_at` (timestamptz) - When the rate was last updated
  
  2. Indexes
    - Composite index on (property_id, date) for fast rate lookups
    - Index on property_id for filtering rates by property
    - Index on date for date-range queries
  
  3. Security
    - Enable RLS on property_rates table
    - Owners can view rates for their own properties
    - Owners can insert rates for their own properties
    - Owners can update rates for their own properties
    - Owners can delete rates for their own properties
    - Admins can view all rates
  
  4. Functions
    - `calculate_booking_price` - Calculate total price for a booking based on property rates
  
  ## Important Notes
  - If no rate exists for a specific date, the system should fall back to property.base_price
  - Rates are date-specific, allowing fine-grained pricing control
  - The currency should match the property's currency for consistency
*/

-- Create property_rates table
CREATE TABLE IF NOT EXISTS property_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  date date NOT NULL,
  daily_price numeric NOT NULL CHECK (daily_price >= 0),
  min_stay integer NOT NULL DEFAULT 1 CHECK (min_stay >= 1),
  currency text NOT NULL DEFAULT 'RUB',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, date)
);

-- Enable RLS
ALTER TABLE property_rates ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_property_rates_property_id ON property_rates(property_id);
CREATE INDEX IF NOT EXISTS idx_property_rates_date ON property_rates(date);
CREATE INDEX IF NOT EXISTS idx_property_rates_property_date ON property_rates(property_id, date);

-- RLS Policies for property_rates

-- Owners can view rates for their own properties
DROP POLICY IF EXISTS "Owners can view rates for their properties" ON property_rates;
CREATE POLICY "Owners can view rates for their properties"
  ON property_rates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_rates.property_id
      AND properties.owner_id = auth.uid()
    )
  );

-- Owners can insert rates for their own properties
DROP POLICY IF EXISTS "Owners can insert rates for their properties" ON property_rates;
CREATE POLICY "Owners can insert rates for their properties"
  ON property_rates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_rates.property_id
      AND properties.owner_id = auth.uid()
    )
  );

-- Owners can update rates for their own properties
DROP POLICY IF EXISTS "Owners can update rates for their properties" ON property_rates;
CREATE POLICY "Owners can update rates for their properties"
  ON property_rates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_rates.property_id
      AND properties.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_rates.property_id
      AND properties.owner_id = auth.uid()
    )
  );

-- Owners can delete rates for their own properties
DROP POLICY IF EXISTS "Owners can delete rates for their properties" ON property_rates;
CREATE POLICY "Owners can delete rates for their properties"
  ON property_rates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_rates.property_id
      AND properties.owner_id = auth.uid()
    )
  );

-- Admins can view all rates
DROP POLICY IF EXISTS "Admins can view all rates" ON property_rates;
CREATE POLICY "Admins can view all rates"
  ON property_rates
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Function to calculate booking price based on property rates
CREATE OR REPLACE FUNCTION calculate_booking_price(
  p_property_id uuid,
  p_check_in date,
  p_check_out date
)
RETURNS numeric AS $$
DECLARE
  total_price numeric := 0;
  curr_date date;
  daily_rate numeric;
  base_price numeric;
  property_currency text;
BEGIN
  -- Get property base price and currency
  SELECT base_price, currency INTO base_price, property_currency
  FROM properties
  WHERE id = p_property_id;
  
  -- If property not found, return 0
  IF base_price IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Loop through each day in the booking range (excluding checkout day)
  curr_date := p_check_in;
  WHILE curr_date < p_check_out LOOP
    -- Try to get rate for this specific date
    SELECT daily_price INTO daily_rate
    FROM property_rates
    WHERE property_id = p_property_id
    AND date = curr_date;
    
    -- If no rate found, use base price
    IF daily_rate IS NULL THEN
      daily_rate := base_price;
    END IF;
    
    -- Add to total
    total_price := total_price + daily_rate;
    
    -- Move to next day
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;
  
  RETURN total_price;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_property_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_property_rates_updated_at_trigger ON property_rates;
CREATE TRIGGER update_property_rates_updated_at_trigger
  BEFORE UPDATE ON property_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_property_rates_updated_at();