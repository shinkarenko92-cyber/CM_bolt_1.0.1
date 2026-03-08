-- Enable pgcrypto extension for token encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Replace passthrough encrypt function with real pgcrypto encryption.
-- The symmetric key is read from a Supabase secret (set via Dashboard → Secrets
-- or `supabase secrets set AVITO_TOKEN_ENCRYPTION_KEY=<your-32-char-key>`).
-- Edge Functions and service-role callers can decrypt; anon/authenticated cannot
-- because the functions are SECURITY DEFINER owned by postgres.

CREATE OR REPLACE FUNCTION encrypt_avito_token(token TEXT)
RETURNS TEXT AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  encryption_key := current_setting('app.settings.avito_token_encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    -- Fallback: try reading from vault secrets
    SELECT decrypted_secret INTO encryption_key
      FROM vault.decrypted_secrets
     WHERE name = 'AVITO_TOKEN_ENCRYPTION_KEY'
     LIMIT 1;
  END IF;
  IF encryption_key IS NULL OR encryption_key = '' THEN
    RAISE WARNING 'AVITO_TOKEN_ENCRYPTION_KEY not set — storing token as-is';
    RETURN token;
  END IF;
  RETURN encode(pgp_sym_encrypt(token, encryption_key), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_avito_token(encrypted_token TEXT)
RETURNS TEXT AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  encryption_key := current_setting('app.settings.avito_token_encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    SELECT decrypted_secret INTO encryption_key
      FROM vault.decrypted_secrets
     WHERE name = 'AVITO_TOKEN_ENCRYPTION_KEY'
     LIMIT 1;
  END IF;
  IF encryption_key IS NULL OR encryption_key = '' THEN
    RAISE WARNING 'AVITO_TOKEN_ENCRYPTION_KEY not set — returning token as-is';
    RETURN encrypted_token;
  END IF;
  RETURN pgp_sym_decrypt(decode(encrypted_token, 'base64'), encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the trigger function to actually encrypt tokens on insert/update
CREATE OR REPLACE FUNCTION encrypt_integration_tokens()
RETURNS TRIGGER AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  encryption_key := current_setting('app.settings.avito_token_encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    SELECT decrypted_secret INTO encryption_key
      FROM vault.decrypted_secrets
     WHERE name = 'AVITO_TOKEN_ENCRYPTION_KEY'
     LIMIT 1;
  END IF;
  IF encryption_key IS NOT NULL AND encryption_key != '' THEN
    IF NEW.access_token_encrypted IS NOT NULL
       AND left(NEW.access_token_encrypted, 4) != 'wcBM' THEN
      NEW.access_token_encrypted := encode(
        pgp_sym_encrypt(NEW.access_token_encrypted, encryption_key), 'base64'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Revoke direct execute from public/anon — only service role & postgres can call
REVOKE EXECUTE ON FUNCTION encrypt_avito_token(TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION decrypt_avito_token(TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION encrypt_avito_token(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_avito_token(TEXT) TO service_role;
