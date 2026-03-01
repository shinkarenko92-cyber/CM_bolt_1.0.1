# Avito Integration Setup Guide

## Prerequisites

1. Avito Developer Account with API access
2. Supabase project with Edge Functions enabled
3. Vault extension enabled in Supabase

## Step 1: Configure Environment Variables

### Frontend (.env file)

Add to your `.env` file:

```env
VITE_AVITO_CLIENT_ID=your_avito_client_id_here
```

**Note:** Client ID is public and safe to expose in frontend code.

### Supabase Secrets

Go to Supabase Dashboard → Settings → Secrets and add:

- `AVITO_CLIENT_ID` - Your Avito OAuth Client ID
- `AVITO_CLIENT_SECRET` - Your Avito OAuth Client Secret (keep this secret!)

## Step 2: Run Database Migration

Apply the migration file:

```bash
supabase migration up
```

Or apply manually via Supabase Dashboard → SQL Editor:

```sql
-- Run the migration file: supabase/migrations/20251208000000_add_avito_integration.sql
```

## Step 3: Deploy Edge Functions

Deploy the Avito sync functions:

```bash
# Deploy avito_sync function
supabase functions deploy avito_sync

# Deploy avito-poller function
supabase functions deploy avito-poller
```

## Step 4: Set Up Cron Job

In Supabase Dashboard → Database → Cron Jobs, create a new cron job:

- **Name:** `avito_poller_cron`
- **Schedule:** `*/10 * * * * *` (every 10 seconds)
- **Function:** `avito-poller`
- **Enabled:** Yes

**Note:** For production, you may want to adjust the interval based on your needs and rate limits.

## Step 5: Configure Vault Encryption (Optional but Recommended)

For production, set up proper Vault encryption for tokens:

1. Ensure Vault extension is enabled
2. Update the `encrypt_avito_token` and `decrypt_avito_token` functions in the migration to use actual Vault encryption
3. Update the trigger to encrypt tokens automatically

## Usage

### Connecting Avito to a Property

1. Go to **Properties** → Select a property → **Edit**
2. Scroll to **API интеграции** section
3. Click **Подключить Avito**
4. Follow the OAuth flow:
   - Step 1: Authorize in Avito
   - Step 2: Select Avito account (if multiple)
   - Step 3: Enter Avito Item ID (from URL: `avito.ru/.../123456789`)
   - Step 4: Set markup percentage (default 15%)
5. Click **Завершить подключение**

### Managing Integration

- **Edit Markup:** Click "Редактировать наценку" to change the markup percentage
- **Disconnect:** Click "Отключить" to stop synchronization (soft delete)
- **Reconnect:** If token expires, click "Подключить заново"

### How It Works

1. **OAuth Flow:** User authorizes via Avito OAuth
2. **Token Storage:** Access token is encrypted and stored in `integrations` table
3. **Sync Queue:** Integration is added to `avito_sync_queue` for processing
4. **Polling:** `avito-poller` cron job processes the queue every 10 seconds
5. **Bidirectional Sync:**
   - **Push:** Prices, availability, and min stay are sent to Avito
   - **Pull:** Bookings from Avito are imported into the system
6. **Realtime:** New Avito bookings trigger realtime notifications

## Troubleshooting

### "VITE_AVITO_CLIENT_ID is not configured"

- Add `VITE_AVITO_CLIENT_ID` to your `.env` file
- Restart your development server

### "Token expired. Please reconnect."

- Avito tokens expire after 1 hour (no refresh token)
- Click "Подключить заново" to re-authenticate

### Sync not working (бронирования и цены не передаются)

Если синхронизация с Avito перестала работать (не передаются бронирования, изменения цен), проверь по шагам:

1. **Secrets** — Supabase Dashboard → Project Settings → Edge Functions → Secrets. Должны быть заданы `AVITO_CLIENT_ID` и `AVITO_CLIENT_SECRET` (значения из кабинета разработчика Avito). Если секреты сбросились или не заданы, синхронизация падает с 401 при обновлении токена.
2. **Cron для avito-poller** — Supabase Dashboard → Database → Cron Jobs. Должно быть задание для функции `avito-poller` (например, `avito_poller_cron`), расписание раз в минуту или каждые 10 секунд (по возможностям платформы). Без cron очередь `avito_sync_queue` не обрабатывается.
3. **Переподключить Avito по OAuth** — в приложении зайти в объект → API интеграции → заново пройти «Подключить Avito» (тот же OAuth URL с scope `short_term_rent:read`, `short_term_rent:write`). После успешного callback токены обновятся в таблице `integrations` и запись попадёт в очередь.
4. **Логи Edge Functions** — Supabase Dashboard → Edge Functions → логи `avito_sync` и `avito-poller`. Ищи сообщения: `avito_401_reason refresh_failed` (проблема с токеном или секретами), `avito_401_reason token_expired` (истёк access token), `MISSING_AVITO_SECRETS` (не заданы секреты), а также ошибки вызова avito_sync из poller.

Дополнительно: проверь, что Edge Functions `avito_sync` и `avito-poller` задеплоены; что у интеграции в БД `is_active = true`, заполнены `avito_user_id` и `avito_item_id`; что в `avito_sync_queue` есть записи со `status = 'pending'` и `next_sync_at <= now()`.

### 409 Error: "ID уже используется"

- The Avito Item ID is already connected to another property
- Choose a different Item ID or disconnect the existing connection

## API Endpoints Used

- `POST /token` - Exchange OAuth code for token
- `GET /user` - Get user accounts
- `POST /short_term_rent/accounts/{account_id}/items/{item_id}/check_connection` - Validate Item ID
- `GET /short_term_rent/accounts/{account_id}/items/{item_id}/bookings` - Get bookings
- `PUT /short_term_rent/accounts/{account_id}/items/{item_id}/prices` - Update prices
- `PUT /short_term_rent/accounts/{account_id}/items/{item_id}/availability` - Update availability

## Security Notes

- Client Secret is stored in Supabase Secrets (never exposed to frontend)
- Access tokens are encrypted using Vault
- RLS policies ensure users can only access their own integrations
- OAuth state parameter prevents CSRF attacks

## Rate Limits

Avito API has rate limits (typically 1000 requests/minute). The polling interval of 10 seconds should be safe, but monitor for rate limit errors.

