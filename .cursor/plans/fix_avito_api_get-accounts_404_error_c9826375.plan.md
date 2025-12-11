---
name: Fix Avito API get-accounts 404 error
overview: Исправить ошибку 404 при получении аккаунтов пользователя из Avito API. Улучшить обработку ошибок, добавить логирование и проверить правильность endpoint.
todos:
  - id: improve-error-handling
    content: Улучшить обработку ошибок в get-accounts case с детальным логированием
    status: completed
  - id: check-endpoint
    content: Проверить и добавить альтернативные endpoints для получения аккаунтов
    status: completed
  - id: validate-token
    content: Добавить валидацию access_token перед запросом
    status: completed
  - id: improve-catch-logging
    content: Улучшить логирование в catch блоке для лучшей диагностики
    status: completed
---

# Исправление ошибки 404 при получении аккаунтов Avito

## Проблема

Edge Function `avito-sync` возвращает ошибку 500 с сообщением `"Failed to get user accounts: Not Found"` при вызове action `get-accounts`. Запрос к Avito API endpoint `/user` возвращает 404.

## Решение

### 1. Улучшить обработку ошибок в `get-accounts` case

**Файл:** `supabase/functions/avito-sync/index.ts`

- Добавить детальное логирование ответа от Avito API
- Парсить JSON ответ с ошибкой от Avito (если есть)
- Возвращать более информативные сообщения об ошибках
- Логировать статус код, заголовки и тело ответа для диагностики

### 2. Проверить правильность endpoint

Согласно документации Avito API, endpoint может быть:

- `/user` (текущий, но возвращает 404)
- `/core/v1/accounts/self` (возможно правильный)
- `/v1/user` (возможно нужна версия)

**Действие:** Добавить fallback на альтернативные endpoints или проверить актуальную документацию Avito API.

### 3. Добавить валидацию access_token

- Проверить, что access_token не пустой
- Логировать первые/последние символы token для диагностики (без полного раскрытия)
- Добавить проверку формата token

### 4. Улучшить обработку ошибок в catch блоке

- Логировать полный stack trace
- Возвращать более детальную информацию об ошибке (без секретов)

## Изменения в коде

### `supabase/functions/avito-sync/index.ts`

В case `"get-accounts"`:

- Добавить логирование перед запросом
- Улучшить обработку ошибок с парсингом JSON ответа
- Добавить детальное логирование ответа (status, headers, body)
- Попробовать альтернативные endpoints если основной не работает

## Ожидаемый результат

- Детальные логи в Supabase Dashboard для диагностики
- Более информативные сообщения об ошибках
- Возможность определить правильный endpoint Avito API
- Улучшенная диагностика проблем с access_token