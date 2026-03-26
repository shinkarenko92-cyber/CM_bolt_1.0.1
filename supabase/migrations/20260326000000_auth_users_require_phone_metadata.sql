/*
  Enforce phone in user_metadata for normal signups (email/password from the app).

  - Supabase Auth does not validate app-level fields; this blocks inserts without a phone.
  - Bypass: synthetic emails used by internal flows (phone OTP first login, cleaner stubs)
    when metadata might be minimal — see function body.

  Admin Dashboard "Add user" without metadata will fail until phone is set in user metadata.
*/

CREATE OR REPLACE FUNCTION public.auth_user_require_phone_or_internal_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  email_lower text;
  phone_meta text;
  digits text;
BEGIN
  email_lower := lower(coalesce(NEW.email, ''));

  IF email_lower LIKE '%@phone.roomi.local' OR email_lower LIKE '%@internal.roomi.pro' THEN
    RETURN NEW;
  END IF;

  phone_meta := coalesce(NEW.raw_user_meta_data->>'phone', '');
  IF phone_meta = '' THEN
    RAISE EXCEPTION 'Для регистрации нужен номер телефона'
      USING ERRCODE = 'check_violation';
  END IF;

  digits := regexp_replace(phone_meta, '[^0-9]', '', 'g');
  IF length(digits) < 10 THEN
    RAISE EXCEPTION 'Укажите корректный номер телефона'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_users_require_phone_before_insert ON auth.users;

CREATE TRIGGER auth_users_require_phone_before_insert
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auth_user_require_phone_or_internal_email();

COMMENT ON FUNCTION public.auth_user_require_phone_or_internal_email() IS
  'Requires phone in raw_user_meta_data for new auth.users rows unless email is an internal stub domain.';
