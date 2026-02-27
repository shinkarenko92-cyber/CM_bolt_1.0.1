# Отчёт по проверке безопасности (RLS, Edge Functions, Vault)

## 1. RLS: таблицы bookings, properties, chats

### Уже есть

| Таблица | Политики | Проверка |
|--------|----------|----------|
| **properties** | `fix_rls_policies.sql`, `create_guests_table` не трогает | **USING (owner_id = auth.uid())** для SELECT, INSERT, UPDATE, DELETE. Доп. политики "Admins can view all properties" в `add_role_and_user_management`. |
| **bookings** | Там же | Доступ через **properties.owner_id = auth.uid()**: EXISTS (SELECT 1 FROM properties WHERE properties.id = bookings.property_id AND properties.owner_id = auth.uid()). |
| **chats** | `create_chats_and_messages.sql` | **USING (owner_id = auth.uid())** для SELECT, INSERT, UPDATE, DELETE. |
| **messages** | Там же | **USING (chat_id IN (SELECT id FROM chats WHERE owner_id = auth.uid()))** — доступ только к сообщениям своих чатов. |

Итог: для `bookings`, `properties`, `chats` политики с привязкой к владельцу (напрямую или через property/chat) настроены корректно.

---

## 2. Edge Functions: auth header и проверка прав

### Уже есть

| Функция | Authorization | Проверка прав |
|---------|---------------|----------------|
| **avito-messenger** | Bearer, `getUser(token)` | Интеграция по `integration_id` → property → **property.owner_id === user.id** (403 при несовпадении). |
| **import-bookings** | Bearer, `getUser(token)` | Работа только с `owner_id = user.id` (properties, вставка от имени user). |
| **avito-oauth-callback** | Для messenger_auth — Bearer + `getUser(token)` | Для обычного OAuth — без JWT (редирект с code). Для messenger: проверка владения интеграцией через `handleFallbackIntegration` (property.owner_id = user.id). |
| **log-booking-change** | Bearer, `getUser(token)` | Проверка: property.owner_id === user.id, иначе 403. |
| **send-otp** | Bearer, `getUser(token)` | Пользователь идентифицирован, запись в phone_otp по user.id. |
| **verify-otp** | Bearer, `getUser(token)` | Аналогично. |
| **delete-user-account** | Bearer, `getUser(token)` | Удаление только своего аккаунта или проверка admin (caller.id === targetUserId или role === 'admin'). |

### Нужно доработать / учесть

| Функция | Проблема | Рекомендация |
|---------|----------|--------------|
| **ical** | Нет проверки auth: по URL `/ical/{property_id}.ics` любой может получить календарь. | По дизайну URL может быть публичным (для Avito). Оставить без auth, но **не использовать в URL предсказуемые или секретные идентификаторы**; property_id = UUID допустим. При появлении "секретного" URL — добавить query-параметр с секретом и проверку. |
| **avito-webhook** | Нет проверки JWT (входящие от Avito). | Ожидаемо: вебхук вызывается Avito. **Добавить проверку подписи** (X-Avito-Signature), когда Avito её документирует. |
| **avito-messenger-webhook** | То же. | То же — проверка подписи по документации Avito. |
| **avito-poller** | Cron, без пользовательского JWT. | Использовать только service role и внутреннюю логику (очередь по интеграциям). Проверить, что в коде нет доступа к данным по произвольному user_id без привязки к интеграции. |
| **apply-migration**, **apply-avito-migration**, **apply-sort-order-migration**, **seed-test-data** | Скорее всего вызываются с service role / админским контекстом. | Ограничить вызов только по служебному ключу или по явной проверке admin; не принимать произвольный user token от клиента. |

---

## 3. avito-messenger: доступ к чужим chat_id

### Уже есть

- Запрос приходит с Bearer и телом `{ action, integration_id, chat_id?, ... }`.
- По `integration_id` загружается интеграция (platform = avito, is_active).
- По `integration.property_id` загружается property, проверяется **property.owner_id === user.id**; при несовпадении — 403.
- Дальше используется токен **этой** интеграции для вызовов Avito API; `chat_id` в теле — это идентификатор чата в Avito.

Итог: доступ к данным ограничен токеном интеграции, которой владеет пользователь. Чужие чаты Avito этим токеном недоступны. Отдельная проверка "chat_id принадлежит owner_id" в БД не нужна, т.к. запрос идёт в Avito API, а не в нашу таблицу `chats` по внутреннему id.

Рекомендация (по желанию): для аудита можно логировать пары (user_id, integration_id, action, chat_id) без секретов.

---

## 4. Валидация входных данных (Zod) в Edge Functions

### Уже есть

- **avito-oauth-callback**: Zod-схемы для body (`OAuthCallbackBodySchema`), state (`StateDataSchema`), env (`EnvSchema`). Вход запроса и окружение валидируются.

### Нужно добавить

| Функция | Что валидировать | Пример (Zod) |
|---------|------------------|--------------|
| **import-bookings** | `bookings` — массив объектов с полями property_name, start_date, end_date, guest_name, amount, channel, rowIndex и т.д. | `z.object({ bookings: z.array(z.object({ property_name: z.string(), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end_date: z.string().regex(...), guest_name: z.string(), guest_phone: z.string().nullable(), amount: z.number().nonnegative(), channel: z.string(), notes: z.string().optional(), guests_count: z.number().int().nonnegative().optional(), rowIndex: z.number().int().optional() })).min(1).max(5000) })` |
| **avito-messenger** | body: action (enum), integration_id (uuid), для getMessages/sendMessage — chat_id (string), limit/offset (number), text (string). | `z.discriminatedUnion('action', [ z.object({ action: z.literal('getChats'), integration_id: z.string().uuid(), item_id: z.string().optional(), limit: z.number().int().positive().max(100).optional(), offset: z.number().int().nonnegative().optional() }), z.object({ action: z.literal('getMessages'), integration_id: z.string().uuid(), chat_id: z.string().min(1), limit: z.number().int().positive().max(100).optional(), offset: z.number().int().nonnegative().optional() }), z.object({ action: z.literal('sendMessage'), integration_id: z.string().uuid(), chat_id: z.string().min(1), text: z.string().max(4096), attachments: z.array(z.object({ type: z.string(), url: z.string().url(), name: z.string().optional() })).optional() }) ])` |
| **log-booking-change** | body: booking_id (uuid), property_id (uuid), action (enum), source (string?), changes (object?). | `z.object({ booking_id: z.string().uuid(), property_id: z.string().uuid(), action: z.enum(['create','update','delete','status_changed']), source: z.string().optional(), changes: z.record(z.unknown()).optional() })` |
| **send-otp** / **send-login-otp** | body: phone (string, формат телефона). | `z.object({ phone: z.string().min(10).max(20) })` |
| **verify-otp** / **verify-login-otp** | body: phone, code (string). | `z.object({ phone: z.string(), code: z.string().length(6) })` |
| **delete-user-account** | body: { userId?: string } (uuid при наличии). | Уже есть проверка через UUID_REGEX; можно заменить на `z.object({ userId: z.string().uuid().optional() })` |
| **avito-webhook** / **avito-messenger-webhook** | payload от Avito (event, chat_id, message и т.д.). | После появления стабильной схемы в документации Avito добавить `z.object({ event: z.string(), ... })` и парсить только после проверки подписи. |

Пример использования в функции (avito-messenger):

```ts
import { z } from "npm:zod@3";

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("getChats"),
    integration_id: z.string().uuid(),
    item_id: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
    offset: z.number().int().nonnegative().optional(),
  }),
  z.object({
    action: z.literal("getMessages"),
    integration_id: z.string().uuid(),
    chat_id: z.string().min(1),
    limit: z.number().int().positive().max(100).optional(),
    offset: z.number().int().nonnegative().optional(),
  }),
  z.object({
    action: z.literal("sendMessage"),
    integration_id: z.string().uuid(),
    chat_id: z.string().min(1),
    text: z.string().max(4096),
    attachments: z.array(z.object({ type: z.string(), url: z.string().url(), name: z.string().optional() })).optional(),
  }),
]);

// В handler после req.json():
const parseResult = BodySchema.safeParse(body);
if (!parseResult.success) {
  return new Response(
    JSON.stringify({ error: "Validation failed", details: parseResult.error.flatten() }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
const body = parseResult.data;
```

---

## 5. Токены Avito: хранение только через Vault (не plain text)

### Текущее состояние

- В миграции `20251208000000_add_avito_integration.sql`:
  - `encrypt_avito_token(token)` и `decrypt_avito_token(encrypted_token)` реализованы как **passthrough**: возвращают значение как есть (комментарии: "In production, use vault.encrypt()").
  - Триггер `encrypt_integration_tokens` не меняет значение, только RETURN NEW.
- В **avito-oauth-callback** при сохранении интеграции в БД записывается **plain text**:
  - `access_token_encrypted: tokenData.access_token`, `refresh_token_encrypted: tokenData.refresh_token`.
- В **avito-messenger** при refresh токены шифруются через RPC `encrypt_avito_token` перед записью в БД, но сама функция в БД пока не шифрует — в таблице по факту хранится plain text.
- В **avito_sync** используется `decrypt_avito_token`; при обновлении токена после refresh в коде есть комментарий "Plain text for testing" и запись без вызова encrypt.

Итог: токены Avito **фактически хранятся в открытом виде** в колонках `access_token_encrypted` и `refresh_token_encrypted`. Vault не используется.

### Что нужно сделать

1. **Включить Supabase Vault** и завести секрет (например, ключ шифрования или использовать Vault для хранения самих токенов по рекомендации Supabase).
2. **Реализовать шифрование в БД**:
   - Вариант A: в `encrypt_avito_token` вызывать Vault (или симметричное шифрование с ключом из Vault), в `decrypt_avito_token` — расшифровку; триггер перед INSERT/UPDATE по integrations вызывать шифрование для `access_token_encrypted` и `refresh_token_encrypted`.
   - Вариант B: хранить в Vault только секреты, а в таблице — ссылку (id секрета в Vault); в Edge Functions при записи создавать секрет в Vault и сохранять в колонке только его идентификатор.
3. **В avito-oauth-callback** перед записью в БД не класть в колонки plain text. Либо вызывать RPC `encrypt_avito_token` и записывать уже зашифрованное значение (как только RPC начнёт реально шифровать), либо писать в Vault и в колонке хранить только reference.
4. **В avito_sync** при обновлении токенов после refresh использовать тот же механизм (encrypt RPC или Vault), убрать комментарии "Plain text for testing" и не сохранять в колонки сырые токены.

Пример (концепт) для миграции с реальным шифрованием через pgcrypto (если Vault недоступен в вашем тарифе):

```sql
-- Требует extension pgcrypto и секрет в vault или env
CREATE OR REPLACE FUNCTION encrypt_avito_token(token TEXT)
RETURNS TEXT AS $$
DECLARE
  secret TEXT; -- из vault.get_secret('avito_encryption_key') или env
BEGIN
  IF token IS NULL OR token = '' THEN RETURN NULL; END IF;
  secret := current_setting('app.avito_encryption_key', true);
  IF secret IS NULL THEN RETURN token; END IF; -- fallback для разработки
  RETURN encode(
    pgp_sym_encrypt(token, secret),
    'base64'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

В проде предпочтительно использовать именно Supabase Vault (или KMS), а не один общий ключ в настройках.

---

## Краткая сводка

| Проверка | Статус | Действие |
|----------|--------|----------|
| RLS bookings/properties/chats (owner_id = auth.uid()) | Выполнено | — |
| Edge Functions: auth header + проверка прав | В основном выполнено | ical оставить без auth (публичный URL); вебхуки — добавить проверку подписи по доке Avito |
| avito-messenger: защита от доступа к чужим chat_id | Выполнено (через владение integration) | По желанию — логирование |
| Валидация входных данных (Zod) во всех Edge Functions | Частично (только avito-oauth-callback) | Добавить Zod-схемы в import-bookings, avito-messenger, log-booking-change, send-otp, verify-otp, delete-user-account, вебхуки |
| Токены Avito только через Vault / шифрование | Не выполнено (plain text в БД) | Включить Vault или pgcrypto; реализовать encrypt/decrypt в БД; в oauth-callback и avito_sync не сохранять plain text |
