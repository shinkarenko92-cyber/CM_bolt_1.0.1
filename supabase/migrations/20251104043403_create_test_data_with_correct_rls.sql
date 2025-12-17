/*
  # Create Test Data - Final Version
  
  This creates test data for user shinkarenko@me.com
  Direct insert bypassing RLS issues
*/

DO $$
DECLARE
  v_user_id uuid := '92864ddc-8a0f-404c-9c56-49f504e56180';
  v_prop1_id uuid;
  v_prop2_id uuid;
  v_prop3_id uuid;
  v_prop4_id uuid;
BEGIN
  -- This migration is for local/dev demo data. It must never break remote migration runs.
  -- If the schema isn't ready (tables/columns not created yet), safely no-op.
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.properties') IS NULL
     OR to_regclass('public.bookings') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'profiles'
         AND column_name = 'subscription_tier'
     )
  THEN
    RAISE NOTICE 'Skipping test data migration: required tables/columns are not present yet.';
    RETURN;
  END IF;
  
  -- First, check if profile exists, if not create it
  INSERT INTO profiles (id, full_name, email, subscription_tier, created_at, updated_at)
  VALUES (
    v_user_id,
    'Test User',
    'shinkarenko@me.com',
    'basic',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create 4 properties
  INSERT INTO properties (id, owner_id, name, type, address, max_guests, bedrooms, base_price, currency, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'Double Room 1', 'DOUBLE ROOM', 'Main Street 123', 2, 1, 100, 'EUR', 'active', now(), now())
  RETURNING id INTO v_prop1_id;

  INSERT INTO properties (id, owner_id, name, type, address, max_guests, bedrooms, base_price, currency, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'Double Room 2', 'DOUBLE ROOM', 'Main Street 124', 2, 1, 100, 'EUR', 'active', now(), now())
  RETURNING id INTO v_prop2_id;

  INSERT INTO properties (id, owner_id, name, type, address, max_guests, bedrooms, base_price, currency, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'One Bedroom Apt 1', 'ONE BEDROOM', 'Park Avenue 45', 3, 1, 90, 'EUR', 'active', now(), now())
  RETURNING id INTO v_prop3_id;

  INSERT INTO properties (id, owner_id, name, type, address, max_guests, bedrooms, base_price, currency, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'One Bedroom Apt 2', 'ONE BEDROOM', 'Park Avenue 46', 3, 1, 90, 'EUR', 'active', now(), now())
  RETURNING id INTO v_prop4_id;

  -- Bookings for property 1
  INSERT INTO bookings (property_id, guest_name, guest_email, check_in, check_out, guests_count, total_price, currency, status, source, created_at, updated_at)
  VALUES 
    (v_prop1_id, 'Kenna T.', 'kenna@example.com', CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '3 days', 2, 500, 'EUR', 'confirmed', 'manual', now(), now()),
    (v_prop1_id, 'Mercedes Nott', 'mercedes@example.com', CURRENT_DATE + INTERVAL '3 days', CURRENT_DATE + INTERVAL '6 days', 2, 600, 'EUR', 'confirmed', 'booking', now(), now()),
    (v_prop1_id, 'Yuko Tricarico', 'yuko@example.com', CURRENT_DATE + INTERVAL '20 days', CURRENT_DATE + INTERVAL '24 days', 1, 400, 'EUR', 'confirmed', 'airbnb', now(), now());

  -- Bookings for property 2
  INSERT INTO bookings (property_id, guest_name, guest_email, check_in, check_out, guests_count, total_price, currency, status, source, created_at, updated_at)
  VALUES
    (v_prop2_id, 'Scot Febus', 'scot@example.com', CURRENT_DATE - INTERVAL '1 days', CURRENT_DATE + INTERVAL '4 days', 2, 540, 'EUR', 'confirmed', 'manual', now(), now()),
    (v_prop2_id, 'Grover Terizzi', 'grover@example.com', CURRENT_DATE + INTERVAL '4 days', CURRENT_DATE + INTERVAL '9 days', 2, 720, 'EUR', 'confirmed', 'booking', now(), now()),
    (v_prop2_id, 'Eboni Deluca', 'eboni@example.com', CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '15 days', 2, 540, 'EUR', 'confirmed', 'airbnb', now(), now()),
    (v_prop2_id, 'Kurtis Barranco', 'kurtis@example.com', CURRENT_DATE + INTERVAL '18 days', CURRENT_DATE + INTERVAL '22 days', 2, 300, 'EUR', 'confirmed', 'manual', now(), now());

  -- Bookings for property 3
  INSERT INTO bookings (property_id, guest_name, guest_email, check_in, check_out, guests_count, total_price, currency, status, source, created_at, updated_at)
  VALUES
    (v_prop3_id, 'Lucienne Trembley', 'lucienne@example.com', CURRENT_DATE + INTERVAL '1 days', CURRENT_DATE + INTERVAL '7 days', 3, 400, 'EUR', 'confirmed', 'booking', now(), now()),
    (v_prop3_id, 'Tamatha Leffew', 'tamatha@example.com', CURRENT_DATE + INTERVAL '7 days', CURRENT_DATE + INTERVAL '15 days', 2, 790, 'EUR', 'confirmed', 'airbnb', now(), now()),
    (v_prop3_id, 'Keely Asmussen', 'keely@example.com', CURRENT_DATE + INTERVAL '17 days', CURRENT_DATE + INTERVAL '22 days', 2, 390, 'EUR', 'confirmed', 'manual', now(), now());

  -- Bookings for property 4
  INSERT INTO bookings (property_id, guest_name, guest_email, check_in, check_out, guests_count, total_price, currency, status, source, created_at, updated_at)
  VALUES
    (v_prop4_id, 'Arlena Taormina', 'arlena@example.com', CURRENT_DATE + INTERVAL '2 days', CURRENT_DATE + INTERVAL '5 days', 2, 304, 'EUR', 'confirmed', 'booking', now(), now()),
    (v_prop4_id, 'Ping Wnuk', 'ping@example.com', CURRENT_DATE + INTERVAL '5 days', CURRENT_DATE + INTERVAL '8 days', 2, 280, 'EUR', 'confirmed', 'manual', now(), now()),
    (v_prop4_id, 'Jimmie Pecinovsky', 'jimmie@example.com', CURRENT_DATE + INTERVAL '8 days', CURRENT_DATE + INTERVAL '15 days', 3, 610, 'EUR', 'confirmed', 'airbnb', now(), now()),
    (v_prop4_id, 'Lavonda Mohamed', 'lavonda@example.com', CURRENT_DATE + INTERVAL '16 days', CURRENT_DATE + INTERVAL '20 days', 2, 300, 'EUR', 'confirmed', 'booking', now(), now()),
    (v_prop4_id, 'Stephany Zamor', 'stephany@example.com', CURRENT_DATE + INTERVAL '22 days', CURRENT_DATE + INTERVAL '28 days', 2, 350, 'EUR', 'confirmed', 'manual', now(), now());

END $$;
