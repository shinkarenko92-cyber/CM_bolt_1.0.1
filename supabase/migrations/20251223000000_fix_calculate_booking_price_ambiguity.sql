-- Fix ambiguous column reference in calculate_booking_price function
-- The variable 'base_price' conflicts with the column name 'base_price' in properties table

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
  prop_base_price numeric;
  property_currency text;
BEGIN
  -- Get property base price and currency
  SELECT p.base_price, p.currency INTO prop_base_price, property_currency
  FROM properties p
  WHERE p.id = p_property_id;
  
  -- If property not found, return 0
  IF prop_base_price IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Loop through each day in the booking range (excluding checkout day)
  curr_date := p_check_in;
  WHILE curr_date < p_check_out LOOP
    -- Try to get rate for this specific date
    SELECT pr.daily_price INTO daily_rate
    FROM property_rates pr
    WHERE pr.property_id = p_property_id
    AND pr.date = curr_date;
    
    -- If no rate found, use base price
    IF daily_rate IS NULL THEN
      daily_rate := prop_base_price;
    END IF;
    
    -- Add to total
    total_price := total_price + daily_rate;
    
    -- Move to next day
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;
  
  RETURN total_price;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

