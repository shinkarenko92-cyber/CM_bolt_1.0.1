---
name: Improve Property Delete Flow with Avito Integration
overview: Улучшение процесса удаления объектов недвижимости с интеграцией Avito API. Добавление модального окна с вариантами действий, закрытие дат в Avito перед удалением, soft delete, и улучшение UX.
todos:
  - id: create-delete-modal
    content: Создать DeletePropertyModal компонент с вариантами действий (cancel unpaid, force delete, abort)
    status: pending
  - id: add-soft-delete-migration
    content: Создать миграцию для добавления deleted_at колонки в properties table
    status: pending
  - id: create-avito-logs-migration
    content: Создать миграцию для таблицы avito_logs
    status: pending
  - id: update-handle-delete
    content: Обновить handleDeleteProperty в Dashboard.tsx для показа модального окна и обработки вариантов
    status: pending
    dependencies:
      - create-delete-modal
  - id: create-avito-close-function
    content: Создать Edge Function avito-close-availability для закрытия дат в Avito через intervals endpoint
    status: pending
  - id: integrate-avito-close
    content: Интегрировать вызов avito-close-availability в handleDeleteProperty перед soft delete
    status: pending
    dependencies:
      - create-avito-close-function
      - update-handle-delete
  - id: update-property-queries
    content: Обновить все запросы к properties для фильтрации deleted_at IS NULL
    status: pending
    dependencies:
      - add-soft-delete-migration
  - id: add-security-checks
    content: Добавить проверку владения объектом перед удалением
    status: pending
    dependencies:
      - update-handle-delete
  - id: improve-ux-messages
    content: Добавить loading states, success/error toasts с понятными сообщениями
    status: pending
    dependencies:
      - update-handle-delete
  - id: handle-avito-errors
    content: Реализовать обработку ошибок Avito API (409, 429, 400/403) с понятными сообщениями
    status: pending
    dependencies:
      - create-avito-close-function
---

# План: Улучшение процесса удаления объектов с интеграцией Avito

## Проблема

Текущая реализация блокирует удаление объекта, если есть бронирования, что создает плохой UX. Нужно дать пользователю варианты действий и интегрировать с Avito API.

## Архитектура решения

### 1. Модальное окно подтверждения удаления

**Файл:** `src/components/DeletePropertyModal.tsx` (новый)

- Использует Ant Design Modal (как в проекте)
- Показывает таблицу бронирований (даты, статус, оплачено ли)
- Варианты действий:
  - **"Отменить неоплаченные"** - update status='cancelled' для unpaid bookings
  - **"Форсированно удалить всё"** - delete bookings cascade
  - **"Отмена"** - abort
- Loading state во время операций

### 2. Интеграция с Avito API

**Файл:** `supabase/functions/avito-close-availability/index.ts` (новый Edge Function)

- Endpoint: `/avito-close-availability`
- Принимает: `POST { integration_id, property_id }`
- Действия:
  1. Fetch integration из БД (token, avito_account_id, avito_item_id)
  2. Проверяет token expiration, если expired — refresh через client_credentials flow
  3. Вызывает `POST https://api.avito.ru/realty/v1/items/intervals` с body:
     ```json
     {
       "item_id": avito_item_id,
       "intervals": []
     }
     ```
     Пустой массив `intervals: []` закрывает весь календарь (год вперёд по умолчанию)
  4. Auth: `Bearer {access_token}` из `integrations.access_token_encrypted`
  5. Retry на 429 (exponential backoff, 3 попытки)
  6. На 409 возвращает `{error: 'paid_conflict', details}`
  7. На success логирует в `avito_logs` table (action='close_availability', status='success')
  8. Возвращает `{success: true}` или error

### 3. Обновление handleDeleteProperty

**Файл:** `src/components/Dashboard.tsx`

- Перед блокировкой: fetch bookings details с полной информацией
- Если bookings.length > 0: показывает `DeletePropertyModal` с вариантами
- При подтверждении:
  - Если выбрано "cancel_unpaid": 
    - `UPDATE bookings SET status='cancelled' WHERE property_id=? AND (paid=false OR paid IS NULL)`
  - Если выбрано "force_delete": 
    - `DELETE FROM bookings WHERE property_id=?` (cascade через FK)
  - Если есть активная Avito интеграция (`is_active=true`):
    - Вызывает Edge Function `avito-close-availability` с `{integration_id, property_id}`
    - На 409: toast "Avito: Есть оплаченные брони — верните деньги вручную"
    - На success: продолжает удаление
  - Затем: soft delete — `UPDATE properties SET deleted_at=NOW() WHERE id=?`
  - Refetch properties с фильтром `deleted_at IS NULL`
- Toast success: "Объект удалён, {count} брони обработаны, Avito синхронизирован"
- Loading spinner во время всех операций

### 4. Soft Delete

**Файл:** `supabase/migrations/20251213000000_add_deleted_at_to_properties.sql`

- Добавить колонку `deleted_at TIMESTAMP NULL` в таблицу `properties`
- RLS policies остаются без изменений (фильтрация на уровне запросов)

### 5. Avito Logs Table

**Файл:** `supabase/migrations/20251213000001_create_avito_logs_table.sql`

- Создать таблицу `avito_logs`:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `integration_id UUID REFERENCES integrations(id)`
  - `property_id UUID REFERENCES properties(id)`
  - `action TEXT` (например, 'close_availability')
  - `status TEXT` ('success', 'error')
  - `error TEXT` (опционально)
  - `details JSONB` (опционально)
  - `created_at TIMESTAMP DEFAULT NOW()`
- Включить RLS с политикой доступа для владельцев properties

### 6. Безопасность

**Файл:** `src/components/Dashboard.tsx` (handleDeleteProperty)

- Проверка владения объектом: `supabase.from('properties').eq('id', property_id).eq('owner_id', user.id).single()`
- Проверка перед любыми операциями удаления
- В Edge Function: проверка через RLS (интеграция доступна только владельцу property)

### 7. UX улучшения

- Loading spinner во время операций
- Success toast: "Объект удалён, {count} брони обработаны, Avito синхронизирован"
- Error handling с понятными сообщениями:
  - "Avito: Есть оплаченные брони — верните деньги вручную" (409)
  - "Ошибка синхронизации Avito: {error details}" (другие ошибки)

## Детали реализации

### DeletePropertyModal Component

```typescript
interface DeletePropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property;
  bookings: Booking[];
  onConfirm: (action: 'cancel_unpaid' | 'force_delete' | 'abort') => Promise<void>;
}
```

- Использует Ant Design Modal, Table, Button
- Показывает таблицу с колонками: даты, статус, оплачено
- Кнопки действий с loading states

### Avito Close Availability Edge Function

- Получает integration из БД
- Проверяет token expiration
- Вызывает `POST /realty/v1/items/intervals` с пустым intervals для полного закрытия
- Обрабатывает ошибки и логирует в avito_logs

### Database Migrations

- `deleted_at` колонка в properties
- `avito_logs` таблица для логирования

## Файлы для изменения/создания

1. **Новые файлы:**
   - `src/components/DeletePropertyModal.tsx` - модальное окно подтверждения
   - `supabase/functions/avito-close-availability/index.ts` - Edge Function для закрытия дат
   - `supabase/migrations/20251213000000_add_deleted_at_to_properties.sql` - миграция для soft delete
   - `supabase/migrations/20251213000001_create_avito_logs_table.sql` - таблица для логов Avito

2. **Изменения:**
   - `src/components/Dashboard.tsx` - обновить `handleDeleteProperty` с вызовом DeletePropertyModal
   - `src/components/PropertiesView.tsx` - фильтровать удаленные объекты в loadData
   - `src/lib/supabase.ts` - добавить `deleted_at?: string | null` в тип Property
   - Все компоненты, которые загружают properties:
     - `Dashboard.tsx` - loadData: `.is('deleted_at', null)`
     - Любые другие места с `.from('properties').select()`

## Тестирование

- Happy path: удаление объекта без бронирований
- С бронированиями: отмена неоплаченных
- С Avito интеграцией: закрытие дат в Avito через intervals endpoint
- Ошибки: 409 (paid bookings), 429 (rate limit), 400/403 (auth errors)
- Безопасность: попытка удалить чужой объект