/*
  # Disable Auth Trigger - Use Application Logic Instead

  ## Overview
  The trigger on auth.users is causing issues with Supabase Auth.
  We'll disable it and handle profile creation in the application code.

  ## Changes
  
  1. Drop the trigger on auth.users
    - This prevents conflicts with Supabase Auth
  
  2. Keep the RLS policies
    - Users can still create their own profiles
*/

-- Drop the problematic trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the function (no longer needed)
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Ensure users can insert their own profile
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);