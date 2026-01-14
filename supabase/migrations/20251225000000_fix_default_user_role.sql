-- Fix: Set default role to 'user' instead of 'admin'
-- Only first user should be admin, all subsequent users should be 'user'

-- Update handle_new_user function to always set 'user' by default
-- (First user logic is handled in application code)
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
  
  -- Only first user gets admin role, all others get 'user'
  IF user_count = 0 THEN
    user_role := 'admin';
  ELSE
    user_role := 'user'; -- Default to 'user' for all new users
  END IF;

  -- Bypass RLS for this insert
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  
  -- Create profile for new user with 'user' role by default
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

-- Update existing users: if they have admin role but are not the first user, keep admin
-- (This migration doesn't change existing admins, only affects new signups)

COMMENT ON FUNCTION public.handle_new_user() IS 'Creates profile on signup. First user gets admin role, all others get user role by default';
