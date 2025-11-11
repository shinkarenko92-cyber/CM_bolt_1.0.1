/*
  # Auto-create Profile on User Sign Up

  ## Overview
  This migration creates a trigger to automatically create a profile record
  when a new user signs up via Supabase Auth.

  ## Changes
  
  1. Trigger Function
    - `handle_new_user()` - Creates profile with user's email on signup
    - Automatically assigns admin role if first user
  
  2. Trigger
    - Fires after INSERT on auth.users table
    - Creates corresponding profile record
*/

-- Function to handle new user creation
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
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();