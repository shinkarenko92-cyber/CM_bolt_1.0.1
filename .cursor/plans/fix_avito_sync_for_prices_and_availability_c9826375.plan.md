---
name: Fix Avito Sync for Prices and Availability
overview: Исправление проблемы с синхронизацией цен и доступности в Avito. Диагностика ошибок и обеспечение синхронизации при всех изменениях (цены в календаре, базовая цена, бронирования).
todos:
  - id: add-sync-on-booking-create
    content: Добавить вызов syncAvitoIntegration после создания бронирования в Dashboard
    status: completed
  - id: add-sync-on-booking-update
    content: Добавить вызов syncAvitoIntegration после обновления бронирования в Dashboard
    status: completed
  - id: add-sync-on-booking-delete
    content: Добавить вызов syncAvitoIntegration после удаления бронирования в Dashboard
    status: completed
  - id: check-edge-function-logic
    content: Проверить и исправить логику синхронизации в Edge Function avito-sync
    status: completed
  - id: improve-error-handling
    content: Улучшить обработку ошибок в Edge Function и apiSync.ts
    status: completed
  - id: verify-api-endpoints
    content: Проверить правильность API endpoints и формата данных для Avito
    status: completed
---

# План: Исправление синхронизации цен и доступности в Avito

## Проблема

Цены и актуальность (доступность) номера не обновляются в Avito при изменениях в приложении.

## Диагностика

### 1. Проверка вызовов синхронизации

**Файлы:** `src/components/Dashboard.tsx`, `src/components/EditReservationModal.tsx`, `src/components/AddReservationModal.tsx`

- Проверить, вызывается ли `syncAvitoIntegration` при создании/изменении/удалении бронирований
- Убедиться, что синхронизация вызывается после успешного сохранения бронирования
- Проверить обработку ошибок синхронизации

### 2. Проверка Edge Function логики

**Файл:** `supabase/functions/avito-sync/index.ts`

- Проверить правильность API endpoints для обновления цен
- Проверить правильность API endpoints для обновления доступности (bookings)
- Убедиться, что ошибки правильно обрабатываются и возвращаются
- Проверить логику группировки цен по периодам

### 3. Проверка API endpoints Avito

**Файл:** `supabase/functions/avito-sync/index.ts`

- Убедиться, что используется правильный endpoint для цен: `POST /realty/v1/accounts/{account_id}/items/{item_id}/prices`
- Убедиться, что используется правильный endpoint для доступности: `POST /core/v1/accounts/{account_id}/items/{item_id}/bookings`
- Проверить формат данных, отправляемых в Avito API

## Исправления

### 1. Добавить синхронизацию при изменении бронирований

**Файл:** `src/components/Dashboard.tsx`

- В `handleSaveReservation` после успешного сохранения вызывать `syncAvitoIntegration`
- В `handleUpdateReservation` после успешного обновления вызывать `syncAvitoIntegration`
- В `handleDeleteReservation` после успешного удаления вызывать `syncAvitoIntegration`
- Обработать ошибки синхронизации с показом уведомлений

### 2. Улучшить обработку ошибок в Edge Function

**Файл:** `supabase/functions/avito-sync/index.ts`

- Убедиться, что все ошибки от Avito API правильно парсятся и возвращаются
- Добавить более детальное логирование для диагностики
- Проверить, что ошибки не игнорируются молча

### 3. Проверить и исправить формат данных для Avito API

**Файл:** `supabase/functions/avito-sync/index.ts`

- Убедиться, что формат `prices` массива соответствует документации Avito
- Убедиться, что формат `bookings` массива соответствует документации Avito
- Проверить, что все обязательные поля присутствуют

### 4. Добавить проверку успешности синхронизации

**Файл:** `src/services/apiSync.ts`

- Улучшить обработку ответа от Edge Function
- Убедиться, что ошибки правильно извлекаются из ответа
- Добавить логирование для отладки

## Детали реализации

### Синхронизация при изменении бронирований

- После создания бронирования: синхронизировать доступность (заблокировать даты в Avito)
- После изменения бронирования: синхронизировать доступность (обновить заблокированные даты)
- После удаления бронирования: синхронизировать доступность (разблокировать даты в Avito)

### Обработка ошибок

- Показывать модальные окна с ошибками, если они есть
- Не блокировать сохранение данных в локальной БД при ошибках синхронизации
- Логировать все ошибки для диагностики

## Файлы для изменения

1. `src/components/Dashboard.tsx` - добавление вызовов синхронизации при изменении бронирований
2. `supabase/functions/avito-sync/index.ts` - проверка и исправление логики синхронизации
3. `src/services/apiSync.ts` - улучшение обработки ошибок