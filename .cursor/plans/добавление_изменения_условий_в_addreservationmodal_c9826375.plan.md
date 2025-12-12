---
name: Добавление изменения условий в AddReservationModal
overview: Добавить в модальное окно создания бронирования (AddReservationModal) возможность открывать ChangeConditionsModal для изменения цен и минимального срока бронирования на выбранные даты. После изменения условий автоматически пересчитывать цену бронирования.
todos:
  - id: add-conditions-modal-state
    content: Добавить состояние для управления ChangeConditionsModal в AddReservationModal
    status: completed
  - id: add-get-current-conditions
    content: Создать функцию getCurrentConditions для получения текущих цен и минимального срока для выбранных дат
    status: completed
  - id: add-change-conditions-button
    content: Добавить кнопку 'Изменить условия' в AddReservationModal
    status: completed
    dependencies:
      - add-conditions-modal-state
  - id: integrate-change-conditions-modal
    content: Интегрировать ChangeConditionsModal компонент в AddReservationModal
    status: completed
    dependencies:
      - add-conditions-modal-state
      - add-get-current-conditions
  - id: update-price-after-conditions-change
    content: Обновить пересчет цены после изменения условий через onSuccess callback
    status: completed
    dependencies:
      - integrate-change-conditions-modal
---

# Добавление изменения условий в AddReservationModal

## Задача

При создании нового бронирования в модальном окне `AddReservationModal` должна быть возможность открыть `ChangeConditionsModal` для изменения условий (цены за ночь и минимального срока бронирования) на выбранные даты (check-in и check-out).

## План реализации

### 1. Добавить состояние для ChangeConditionsModal

**Файл:** `src/components/AddReservationModal.tsx`

- Добавить состояние `showConditionsModal` для управления видимостью модального окна изменения условий
- Добавить состояние для хранения текущей цены за ночь и минимального срока для выбранных дат

### 2. Добавить функцию для получения текущих условий

**Файл:** `src/components/AddReservationModal.tsx`

- Создать функцию `getCurrentConditions`, которая:
- Получает `property_rates` для выбранных дат из базы данных
- Если для даты есть rate, использует его `daily_price` и `min_stay`
- Если rate нет, использует `base_price` и `minimum_booking_days` из property
- Возвращает среднюю цену за ночь и минимальный срок для периода

### 3. Добавить кнопку/ссылку для открытия ChangeConditionsModal

**Файл:** `src/components/AddReservationModal.tsx`

- Добавить кнопку или ссылку рядом с полем "Total Price" или в области дат
- Кнопка должна быть видна только когда выбраны property, check-in и check-out
- Текст кнопки: "Изменить условия" или "Change Conditions"

### 4. Интегрировать ChangeConditionsModal

**Файл:** `src/components/AddReservationModal.tsx`

- Импортировать `ChangeConditionsModal`
- Добавить компонент `ChangeConditionsModal` в JSX
- Передать правильные пропсы:
- `propertyId`: `formData.property_id`
- `startDate`: `formData.check_in`
- `endDate`: `formData.check_out` (или `check_out - 1 день`, так как check-out обычно не включается)
- `currentPrice`: средняя цена за ночь из `getCurrentConditions`
- `currentMinStay`: минимальный срок из `getCurrentConditions`
- `currency`: `formData.currency` или из property
- `properties`: массив properties
- `onSuccess`: функция, которая пересчитывает цену после изменения условий

### 5. Обновить пересчет цены после изменения условий

**Файл:** `src/components/AddReservationModal.tsx`

- В `onSuccess` callback от `ChangeConditionsModal`:
- Вызвать `calculatePrice` для пересчета общей цены бронирования
- Это автоматически обновит `formData.total_price` с учетом новых условий

### 6. Обработка edge cases

- Если property не выбран, кнопка должна быть неактивна
- Если даты не выбраны, кнопка должна быть неактивна
- Если check-out равен check-in, показать предупреждение
- После закрытия ChangeConditionsModal, если условия изменились, пересчитать цену

## Файлы для изменения

- `src/components/AddReservationModal.tsx` - основной файл для модификации

## Дополнительные соображения

- Кнопка должна быть визуально заметной, но не перегружать интерфейс
- После изменения условий пользователь должен видеть обновленную цену
- Если пользователь изменил условия, но затем изменил даты, нужно пересчитать условия для новых дат