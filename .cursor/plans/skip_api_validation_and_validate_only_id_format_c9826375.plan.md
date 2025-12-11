---
name: Skip API validation and validate only ID format
overview: Пропустить валидацию объявления через Avito API (endpoints недоступны) и проверять только формат ID. Если объявление не существует, ошибка будет при первой синхронизации.
todos:
  - id: simplify-frontend-validation
    content: Упростить validateItemId - проверять только формат ID (число, не пустое, минимум 6 цифр)
    status: pending
  - id: update-ui-messages
    content: Обновить UI сообщения в AvitoConnectModal для указания, что проверка будет при сохранении
    status: pending
  - id: optional-simplify-edge-function
    content: (Опционально) Упростить Edge Function validate-item - оставить только проверку на дубликаты
    status: pending
---

# Пропустить валидацию через API и проверять только формат ID

## Проблема

Оба endpoint для валидации объявления (`/short_term_rent/.../bookings` и `/core/v1/.../items/{item_id}`) возвращают "no Route matched with those values". Это означает, что эти endpoints недоступны для валидации или требуют других параметров/scopes.

## Решение

Пропустить валидацию через Avito API и проверять только формат ID на фронтенде. Если объявление не существует или не подходит, ошибка будет при первой синхронизации.

## Изменения

### 1. Упростить валидацию на фронтенде

**Файл:** [`src/services/avito.ts`](src/services/avito.ts)

- Изменить `validateItemId` чтобы проверять только формат ID (число, не пустое, минимум 6 цифр)
- Убрать вызов Edge Function для валидации
- Возвращать `{ available: true }` если формат правильный
- Добавить предупреждение, что проверка будет выполнена при сохранении

### 2. Упростить Edge Function (опционально)

**Файл:** [`supabase/functions/avito-sync/index.ts`](supabase/functions/avito-sync/index.ts)

- Можно оставить код валидации для будущего использования
- Или упростить, оставив только проверку на дубликаты в базе данных

### 3. Обновить UI сообщение

**Файл:** [`src/components/AvitoConnectModal.tsx`](src/components/AvitoConnectModal.tsx)

- Обновить текст, чтобы указать, что проверка будет выполнена при сохранении
- Убрать или изменить сообщение об ошибке валидации

## Порядок выполнения

1. Упростить `validateItemId` - проверять только формат ID
2. Обновить UI сообщения в AvitoConnectModal
3. (Опционально) Упростить Edge Function validate-item action

## Тестирование

- Проверить, что валидация формата ID работает
- Проверить, что можно перейти к следующему шагу после ввода правильного формата ID
- Проверить, что при сохранении интеграции будет ошибка, если объявление не существует