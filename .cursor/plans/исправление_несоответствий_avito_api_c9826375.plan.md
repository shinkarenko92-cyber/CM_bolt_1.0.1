---
name: Исправление несоответствий Avito API
overview: "Исправление несоответствий текущей реализации с документацией Avito API: замена base_price на night_price, добавление опциональных параметров (extra_guest_fee, with_unpaid, skip_error), улучшение обработки ошибок."
todos:
  - id: fix-base-price-to-night-price
    content: Заменить base_price на night_price в POST /realty/v1/items/{item_id}/base
    status: completed
  - id: add-with-unpaid-param
    content: Добавить параметр with_unpaid=true при получении бронирований
    status: completed
  - id: add-skip-error-param
    content: Добавить параметр skip_error=true в запросы к API
    status: completed
  - id: prepare-extra-guest-fee
    content: Добавить комментарии и структуру для будущей поддержки extra_guest_fee
    status: completed
  - id: update-comments
    content: Обновить комментарии для соответствия реальным параметрам API
    status: completed
---

# Исправление несоответствий с документацией Avito API

## Проблемы, обнаруженные при анализе:

### 1. **Критическая ошибка: неправильное имя поля в базовых параметрах**

- **Текущая реализация:** В `POST /realty/v1/items/{item_id}/base` передается `base_price`
- **Должно быть:** `night_price` (согласно схеме `BaseParams`)
- **Файл:** `supabase/functions/avito-sync/index.ts:838`

### 2. **Отсутствует опциональный параметр `extra_guest_fee`**

- В `POST /realty/v1/accounts/{user_id}/items/{item_id}/prices` можно передавать `extra_guest_fee`
- В `POST /realty/v1/items/{item_id}/base` можно передавать `extra_guest_fee` и `extra_guest_threshold`
- Сейчас эти параметры не передаются

### 3. **Не используется параметр `with_unpaid` при получении бронирований**

- В `GET /realty/v1/accounts/{user_id}/items/{item_id}/bookings` есть опциональный параметр `with_unpaid`
- Позволяет получать неоплаченные бронирования (в статусе `pending`)
- Сейчас не используется

### 4. **Не используется параметр `skip_error`**

- Доступен в нескольких эндпоинтах
- Позволяет получать 200 статус вместо ошибок при проблемах с отдельными items
- Может быть полезен для массовых операций

### 5. **Опционально: эндпоинт для работы с квотами**

- `POST /realty/v1/items/intervals` - для объявлений с квотами
- Сейчас не используется (но это нормально, если у нас нет квот)

## План исправлений:

### Исправление 1: Замена `base_price` на `night_price`

**Файл:** `supabase/functions/avito-sync/index.ts`

- Строка 838: заменить `base_price: priceWithMarkup` на `night_price: priceWithMarkup`
- Обновить комментарий на строке 822

### Исправление 2: Добавление поддержки `extra_guest_fee` (опционально)

**Файл:** `supabase/functions/avito-sync/index.ts`

- В секции обновления цен: добавить возможность передачи `extra_guest_fee` из `property_rates` или `property` (если такое поле будет добавлено в будущем)
- В секции базовых параметров: добавить возможность передачи `extra_guest_fee` и `extra_guest_threshold` (если поля будут в базе)

**Примечание:** Так как в текущей схеме БД нет полей для `extra_guest_fee`, это будет подготовка к будущему использованию.

### Исправление 3: Добавление параметра `with_unpaid` при получении бронирований

**Файл:** `supabase/functions/avito-sync/index.ts`

- В секции получения бронирований (строка ~825): добавить параметр `with_unpaid=true` в query string
- Это позволит получать неоплаченные бронирования из Avito

### Исправление 4: Добавление параметра `skip_error` (опционально)

**Файл:** `supabase/functions/avito-sync/index.ts`

- Добавить `skip_error=true` в запросы к эндпоинтам, которые его поддерживают:
- `POST /realty/v1/accounts/{user_id}/items/{item_id}/prices`
- `GET /realty/v1/accounts/{user_id}/items/{item_id}/bookings`
- Это поможет избежать полного провала синхронизации при проблемах с отдельными items

### Исправление 5: Улучшение комментариев

- Обновить комментарии для соответствия реальным параметрам API

## Приоритет исправлений:

1. **Критично:** Исправление 1 (base_price → night_price) - это может быть причиной ошибок API
2. **Важно:** Исправление 3 (with_unpaid) - позволит получать больше данных о бронированиях
3. **Полезно:** Исправление 4 (skip_error) - улучшит надежность синхронизации
4. **Опционально:** Исправление 2 (extra_guest_fee) - подготовка к будущему функционалу

## Файлы для изменения:

- `supabase/functions/avito-sync/index.ts` - основная логика синхронизации