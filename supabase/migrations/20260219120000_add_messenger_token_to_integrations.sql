-- Store Avito Messenger OAuth token (scope: messenger:read, messenger:write) separately.
-- Main integration token may have short_term_rent only; Messenger requires separate auth.
ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS messenger_token_json JSONB;

COMMENT ON COLUMN integrations.messenger_token_json IS 'Avito Messenger OAuth: { access_token, refresh_token, expires_at, scope }';
