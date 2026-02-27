-- Ensure avito_user_id is strictly validated for integrations (Messenger API depends on it)

ALTER TABLE integrations
ALTER COLUMN avito_user_id SET NOT NULL;

ALTER TABLE integrations
ADD CONSTRAINT integrations_avito_user_id_positive
CHECK (avito_user_id > 0);

COMMENT ON COLUMN integrations.avito_user_id IS 'Avito user ID (numeric > 0), required for STR and Messenger API (accounts/{user_id}/...)';

