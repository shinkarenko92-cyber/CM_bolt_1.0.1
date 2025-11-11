/*
  # Fix Profile Creation on Signup

  ## Overview
  This migration fixes the conflict between triggers and adds proper RLS policy
  for profile creation via trigger.

  ## Changes
  
  1. Remove conflicting trigger
    - Drop `on_first_user_admin` trigger (conflicts with handle_new_user)
  
  2. Add RLS policy for service role
    - Allow INSERT from service role for trigger execution
  
  3. Update handle_new_user function
    - Simplified logic, no conflict with old trigger
*/

-- Drop the conflicting BEFORE INSERT trigger on profiles
DROP TRIGGER IF EXISTS on_first_user_admin ON profiles;

-- Add RLS policy to allow service role to insert profiles
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
CREATE POLICY "Service role can insert profiles"
  ON profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Also allow authenticated users to insert (for trigger context)
DROP POLICY IF EXISTS "Allow profile creation via trigger" ON profiles;
CREATE POLICY "Allow profile creation via trigger"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Update the handle_new_user function to be more robust
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
    -- Log error but don't fail user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;