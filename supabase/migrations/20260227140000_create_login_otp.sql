-- OTP для входа по телефону (без авторизации): код хранится здесь до проверки
CREATE TABLE IF NOT EXISTS login_otp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  channel TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_otp_phone ON login_otp(phone);
CREATE INDEX IF NOT EXISTS idx_login_otp_expires_at ON login_otp(expires_at);

-- Доступ только через service role (Edge Functions)
ALTER TABLE login_otp ENABLE ROW LEVEL SECURITY;

-- Нет политик для authenticated/anon — только service role может читать/писать
