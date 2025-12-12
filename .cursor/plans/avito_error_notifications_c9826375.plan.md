---
name: Avito Error Notifications
overview: Добавление системы уведомлений об ошибках от Avito API с модальными окнами, показывающими детальную информацию об ошибках, и успешными toast-уведомлениями при синхронизации.
todos:
  - id: create-avito-errors-util
    content: Создать утилиту avitoErrors.ts для парсинга и форматирования ошибок от Avito API
    status: completed
  - id: create-error-modal
    content: Создать компонент AvitoErrorModal для отображения детальной информации об ошибках
    status: completed
  - id: update-edge-function-errors
    content: Обновить Edge Function avito-sync для возврата структурированных ошибок в массиве
    status: completed
  - id: update-api-sync
    content: Обновить syncAvitoIntegration в apiSync.ts для обработки массива ошибок
    status: completed
    dependencies:
      - update-edge-function-errors
  - id: add-localization
    content: Добавить переводы для ошибок Avito в ru.json и en.json
    status: completed
  - id: update-change-conditions-modal
    content: Добавить показ модальных окон с ошибками и toast-уведомления в ChangeConditionsModal
    status: completed
    dependencies:
      - create-avito-errors-util
      - create-error-modal
      - update-api-sync
      - add-localization
  - id: update-property-modal
    content: Добавить показ модальных окон с ошибками и toast-уведомления в PropertyModal
    status: completed
    dependencies:
      - create-avito-errors-util
      - create-error-modal
      - update-api-sync
      - add-localization
---

# План: Система уведомлений об ошибках Avito API

## Цель

Добавить уведомления пользователю о всех ошибках, возникающих при синхронизации с Avito API (валидация цен, ошибки API, сетевые ошибки), с показом детальной информации в модальных окнах.

## Архитектура

### 1. Утилита для парсинга ошибок Avito

**Файл:** `src/services/avitoErrors.ts` (новый)

- Функция `parseAvitoError(error: unknown): AvitoErrorInfo` - парсит ошибки от Avito API и Edge Function
- Интерфейс `AvitoErrorInfo` с полями: `title`, `message`, `details`, `statusCode`, `errorCode`, `recommendations`
- Функция `formatAvitoError(errorInfo: AvitoErrorInfo, t: TFunction): string` - форматирует ошибку для отображения

### 2. Обновление Edge Function для возврата детальных ошибок

**Файл:** `supabase/functions/avito-sync/index.ts`

- В действиях `sync` и `initial-sync` собирать все ошибки от Avito API в массив
- Возвращать структурированный ответ с массивом ошибок: `{ success: boolean, errors: AvitoErrorInfo[] }`
- Для каждого запроса к Avito API (prices, base params, bookings) сохранять ошибки, но продолжать синхронизацию
- Возвращать ошибки в формате:
  ```typescript
  {
    success: false,
    errors: [
      {
        operation: 'price_update',
        status: 400,
        error: { code: 'VALIDATION_ERROR', message: 'Price too low', details: {...} }
      }
    ]
  }
  ```


### 3. Обновление apiSync.ts для обработки ошибок

**Файл:** `src/services/apiSync.ts`

- Обновить `syncAvitoIntegration` для обработки массива ошибок из Edge Function
- Бросать ошибку с массивом ошибок, если есть хотя бы одна ошибка
- Создать тип `AvitoSyncError` с массивом ошибок

### 4. Добавление локализации

**Файлы:** `src/i18n/locales/ru.json`, `src/i18n/locales/en.json`

- Добавить секцию `avito.errors` с переводами:
  - `syncFailed`: "Ошибка синхронизации с Avito"
  - `priceUpdateFailed`: "Не удалось обновить цены"
  - `calendarUpdateFailed`: "Не удалось обновить календарь"
  - `baseParamsUpdateFailed`: "Не удалось обновить базовые параметры"
  - `bookingsUpdateFailed`: "Не удалось обновить бронирования"
  - `validationError`: "Ошибка валидации"
  - `priceTooLow`: "Цена слишком низкая"
  - `priceTooHigh`: "Цена слишком высокая"
  - `invalidDateRange`: "Некорректный диапазон дат"
  - `tokenExpired`: "Токен истёк"
  - `unauthorized`: "Ошибка авторизации"
  - `networkError`: "Сетевая ошибка"
  - `unknownError`: "Неизвестная ошибка"
  - `details`: "Детали ошибки"
  - `recommendations`: "Рекомендации"
  - `operation`: "Операция"
  - `statusCode`: "Код статуса"
- Добавить секцию `avito.success`:
  - `syncCompleted`: "Синхронизация с Avito завершена успешно"

### 5. Компонент модального окна для ошибок

**Файл:** `src/components/AvitoErrorModal.tsx` (новый)

- Компонент для отображения детальной информации об ошибке
- Поля: заголовок, сообщение, детали (JSON), рекомендации, код статуса
- Кнопка "Закрыть" и "Повторить" (опционально)
- Использовать Ant Design Modal

### 6. Обновление ChangeConditionsModal

**Файл:** `src/components/ChangeConditionsModal.tsx`

- Импортировать `parseAvitoError` и `AvitoErrorModal`
- При ошибке синхронизации показывать модальные окна для каждой ошибки последовательно
- Показывать toast-уведомление об успешной синхронизации
- Использовать `useTranslation` для локализации

### 7. Обновление PropertyModal

**Файл:** `src/components/PropertyModal.tsx`

- Импортировать `parseAvitoError` и `AvitoErrorModal`
- При ошибке синхронизации показывать модальные окна для каждой ошибки последовательно
- Показывать toast-уведомление об успешной синхронизации
- Использовать `useTranslation` для локализации

### 8. Функция для последовательного показа модальных окон

**Файл:** `src/services/avitoErrors.ts`

- Функция `showAvitoErrors(errors: AvitoErrorInfo[], t: TFunction): Promise<void>`
- Показывает модальные окна последовательно, ожидая закрытия предыдущего
- Использует Ant Design Modal для каждого окна

## Детали реализации

### Парсинг ошибок Avito API

- Обработка различных форматов ответов от Avito (JSON с `error`, `message`, `details`)
- Определение типа ошибки (валидация, авторизация, сеть)
- Формирование рекомендаций на основе типа ошибки

### Обработка множественных ошибок

- Сбор всех ошибок во время синхронизации
- Показ модальных окон последовательно (после закрытия одного показывается следующий)
- Использование Promise для последовательного показа

### Успешные уведомления

- Toast-уведомление через `react-hot-toast` при успешной синхронизации
- Показывать только если не было ошибок или если были частичные успехи

## Файлы для изменения

1. `src/services/avitoErrors.ts` - новый файл
2. `src/components/AvitoErrorModal.tsx` - новый файл
3. `supabase/functions/avito-sync/index.ts` - обновление
4. `src/services/apiSync.ts` - обновление
5. `src/components/ChangeConditionsModal.tsx` - обновление
6. `src/components/PropertyModal.tsx` - обновление
7. `src/i18n/locales/ru.json` - добавлени