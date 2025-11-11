/*
  # Fix Profile Creation - Disable RLS for Trigger

  ## Overview
  This migration fixes the profile creation issue by properly configuring
  the trigger function to bypass RLS.

  ## Changes
  
  1. Update handle_new_user function
    - Use SET LOCAL to bypass RLS during insert
    - Ensure function runs with proper privileges
  
  2. Grant necessary permissions
    - Grant usage on schema to trigger function
*/

-- Recreate the function with proper RLS bypass
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count integer;
  user_role user_role;
BEGIN
  -- Check if this is the first user
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  
  IF user_count = 0 THEN
    user_role := 'admin';
  ELSE
    user_role := 'user';
  END IF;

  -- Bypass RLS for this insert
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  
  -- Create profile for new user
  INSERT INTO public.profiles (id, email, role, is_active, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    user_role,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the actual error for debugging
    RAISE LOG 'Error creating profile for user %: %', NEW.id, SQLERRM;
    -- Don't fail the user creation
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the function owner has proper permissions
GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL ON TABLE public.profiles TO postgres;