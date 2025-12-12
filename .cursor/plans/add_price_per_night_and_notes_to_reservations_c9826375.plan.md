---
name: Add Price Per Night and Notes to Reservations
overview: Добавление поля "цена за ночь" с автоматическим пересчетом общей цены и поля "примечания" в модальные окна добавления/редактирования бронирований и в таблицу бронирований.
todos:
  - id: add-price-per-night-add-modal
    content: Добавить поле 'цена за ночь' в AddReservationModal с автоматическим пересчетом общей цены
    status: completed
  - id: add-notes-add-modal
    content: Добавить поле 'примечания' (textarea) в AddReservationModal
    status: completed
  - id: add-price-per-night-edit-modal
    content: Добавить поле 'цена за ночь' в EditReservationModal с автоматическим пересчетом общей цены
    status: completed
  - id: add-notes-edit-modal
    content: Добавить поле 'примечания' (textarea) в EditReservationModal
    status: completed
  - id: add-notes-column-table
    content: Добавить колонку 'Примечания' в таблицу бронирований (BookingsView)
    status: completed
  - id: update-dashboard-handlers
    content: Обновить обработчики onAdd и onUpdate в Dashboard для передачи notes
    status: completed
  - id: add-localization
    content: Добавить переводы для новых полей в ru.json и en.json
    status: completed
---

# План: Добавление цены за ночь и примечаний в бронирования

## Цель

Добавить поле "цена за ночь" с автоматическим пересчетом общей цены и поле "примечания" в модальные окна и таблицу бронирований.

## Архитектура

### 1. Добавление поля "цена за ночь" в AddReservationModal

**Файл:** `src/components/AddReservationModal.tsx`

- Добавить поле `price_per_night` в `formData` state
- Добавить поле ввода "Price per Night" в форму (между датами и Total Price)
- Реализовать автоматический пересчет `total_price` при изменении:
- `price_per_night` × количество ночей
- Дат (check_in, check_out) - пересчитывать количество ночей
- При автоматическом пересчете из `calculatePrice` обновлять `price_per_night` как среднюю цену за ночь
- Поле `total_price` должно оставаться редактируемым (можно вручную изменить)

### 2. Добавление поля "примечания" в AddReservationModal

**Файл:** `src/components/AddReservationModal.tsx`

- Добавить поле `notes` в `formData` state
- Добавить textarea "Notes" в форму (после Guests Count)
- Обновить интерфейс `onAdd` для передачи `notes`
- Обновить `handleSubmit` для сохранения `notes` в базу данных

### 3. Добавление полей в EditReservationModal

**Файл:** `src/components/EditReservationModal.tsx`

- Добавить поле `price_per_night` в `formData` state
- Добавить поле `notes` в `formData` state
- Добавить поле ввода "Price per Night" в форму
- Добавить textarea "Notes" в форму
- Реализовать автоматический пересчет `total_price` при изменении `price_per_night` или дат
- Обновить `handleSubmit` для сохранения обоих полей

### 4. Добавление колонки "Примечания" в таблицу бронирований

**Файл:** `src/components/BookingsView.tsx`

- Добавить колонку "Notes" / "Примечания" в таблицу
- Отображать первые N символов с возможностью раскрытия (tooltip или расширяемая ячейка)
- Добавить локализацию для заголовка колонки

### 5. Обновление типов и интерфейсов

**Файл:** `src/components/AddReservationModal.tsx`, `src/components/EditReservationModal.tsx`

- Обновить интерфейс `onAdd` и `onUpdate` для включения `notes`
- Убедиться, что `notes` передается в API вызовы

### 6. Локализация

**Файлы:** `src/i18n/locales/ru.json`, `src/i18n/locales/en.json`

- Добавить переводы:
- `pricePerNight`: "Цена за ночь" / "Price per Night"
- `notes`: "Примечания" / "Notes"
- `nightsCount`: "Количество ночей" / "Nights Count"

## Детали реализации

### Расчет цены за ночь

- При загрузке бронирования: `price_per_night = total_price / количество_ночей`
- При изменении `price_per_night`: `total_price = price_per_night × количество_ночей`
- При изменении дат: пересчитывать количество ночей и обновлять `total_price`
- При автоматическом расчете через `calculatePrice`: вычислять среднюю цену за ночь из `property_rates`

### Количество ночей

- Вычислять как разницу между `check_out` и `check_in` в днях
- Отображать рядом с полем "Price per Night" для наглядности

### Примечания

- Многострочное текстовое поле (textarea)
- Необязательное поле
- Сохранять в поле `notes` таблицы `bookings` (уже существует в БД)

## Файлы для изменения

1. `src/components/AddReservationModal.tsx` - добавление полей и логики пересчета
2. `src/components/EditReservationModal.tsx` - добавление полей и логики пересчета
3. `src/components/BookingsView.tsx` - добавление колонки примечаний
4. `src/i18n/locales/ru.json` - добавление переводов
5. `src/i18n/locales/en.json` - добавление переводов
6. `src/components/Dashboard.tsx` - обновление обработчиков `onAdd` и `onUpdate` для передачи `notes`