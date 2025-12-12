---
name: Перемещение кнопки Изменить условия в заголовок AddReservationModal и добавление локализации
overview: Переместить кнопку "Изменить условия" из поля Total Price в заголовок модального окна рядом с заголовком "Add Reservation", стилизовать её как в календаре (серая кнопка с иконкой Settings), и добавить локализацию для заголовка модального окна.
todos:
  - id: add-i18n-to-modal
    content: Добавить локализацию (useTranslation) в AddReservationModal и использовать переводы для заголовка и кнопки
    status: completed
  - id: import-settings-icon
    content: Импортировать иконку Settings из lucide-react
    status: completed
  - id: move-button-to-header
    content: Переместить кнопку 'Изменить условия' из поля Total Price в заголовок модального окна
    status: completed
    dependencies:
      - import-settings-icon
  - id: style-button-like-calendar
    content: Стилизовать кнопку так же, как в календаре (серая кнопка с иконкой Settings)
    status: completed
    dependencies:
      - move-button-to-header
  - id: remove-old-button
    content: Удалить старую ссылку 'Изменить условия' из поля Total Price
    status: completed
    dependencies:
      - move-button-to-header
---

# Перемещение кнопки "Изменить условия" в заголовок AddReservationModal и добавление локализации

## Задача
1. Переместить кнопку "Изменить условия" из поля Total Price в заголовок модального окна рядом с "Add Reservation"
2. Стилизовать кнопку так же, как в календаре (серая кнопка с иконкой Settings)
3. Добавить локализацию для заголовка "Add Reservation" (использовать существующий ключ `modals.addReservation`)

## План реализации

### 1. Добавить локализацию в AddReservationModal
**Файл:** `src/components/AddReservationModal.tsx`
- Импортировать `useTranslation` из `react-i18next`
- Использовать `t('modals.addReservation')` для заголовка вместо хардкода "Add Reservation"
- Использовать `t('modals.changeConditions')` для текста кнопки

### 2. Импортировать иконку Settings
**Файл:** `src/components/AddReservationModal.tsx`
- Добавить импорт `Settings` из `lucide-react`

### 3. Переместить кнопку в заголовок
**Файл:** `src/components/AddReservationModal.tsx`
- Удалить кнопку "Изменить условия" из поля Total Price (строки ~387-405)
- Добавить кнопку в заголовок модального окна (в `div` с классом `flex items-center justify-between`)
- Разместить кнопку слева от кнопки закрытия (X), рядом с заголовком
- Использовать тот же стиль, что и в календаре: `px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2`
- Добавить иконку `Settings` с размером `w-4 h-4`

### 4. Обновить структуру заголовка
**Файл:** `src/components/AddReservationModal.tsx`
- Заголовок и кнопка "Изменить условия" должны быть в одной строке слева
- Кнопка закрытия (X) остается справа
- Использовать flexbox для правильного расположения

## Файлы для изменения

- `src/components/AddReservationModal.tsx` - основной файл для модификации

## Дополнительные соображения

- Кнопка должна быть всегда видна (как указал пользователь)
- Кнопка должна быть активна только когда выбраны property, check-in и check-out (логика уже есть)
- Стиль кнопки должен совпадать со стилем в календаре для консистентности UI