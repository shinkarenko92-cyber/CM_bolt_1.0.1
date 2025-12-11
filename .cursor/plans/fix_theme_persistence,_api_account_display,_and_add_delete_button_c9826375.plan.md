---
name: Fix theme persistence, API account display, and add delete button
overview: Исправить сохранение темы за аккаунтом, добавить поддержку светлой темы для настроек API, исправить отображение аккаунтов Avito после OAuth, и добавить кнопку полного удаления интеграции.
todos:
  - id: fix-account-parsing
    content: "Исправить парсинг аккаунтов в avito-sync: обработать случай, когда API возвращает пользователя как аккаунт"
    status: completed
  - id: add-theme-to-api-settings
    content: "Добавить поддержку темы в ApiIntegrationSettings: использовать useTheme и условные классы"
    status: completed
  - id: add-delete-button
    content: Добавить кнопку полного удаления Avito интеграции в PropertyModal (hard delete)
    status: completed
  - id: update-antd-theme
    content: Обновить Ant Design тему в App.tsx для поддержки светлой темы
    status: completed
---

# Исправление темы, отображения аккаунтов и добавление удаления

## Проблемы

1. **Тема не применяется к настройкам API** - `ApiIntegrationSettings` использует жестко заданные цвета вместо CSS переменных
2. **Аккаунты Avito не отображаются** - API возвращает `{ has_accounts: false, accounts_count: 0 }`, но код не обрабатывает случай, когда пользователь сам является аккаунтом
3. **Нет полного удаления** - есть только soft delete (`is_active=false`), нужен hard delete

## Решения

### 1. Применение темы к ApiIntegrationSettings

**Файл:** [`src/components/ApiIntegrationSettings.tsx`](src/components/ApiIntegrationSettings.tsx)

- Использовать `useTheme()` hook для получения текущей темы
- Заменить жестко заданные классы (`bg-slate-700`, `text-white`) на условные классы на основе темы
- Использовать CSS переменные через `data-theme` атрибут (уже настроены в `index.css`)

**Изменения:**

- Импортировать `useTheme` из `ThemeContext`
- Добавить условные классы: `theme === 'light' ? 'bg-white border-gray-200' : 'bg-slate-700 border-slate-600'`
- Применить к карточкам платформ, инпутам, кнопкам

### 2. Исправление отображения аккаунтов Avito

**Файл:** [`supabase/functions/avito-sync/index.ts`](supabase/functions/avito-sync/index.ts)

**Проблема:** API возвращает `{ has_accounts: false, accounts_count: 0 }`, но может возвращать самого пользователя как аккаунт.

**Изменения в `get-accounts` case:**

- После парсинга ответа проверить, есть ли поле `id` или `user_id` в корне ответа (сам пользователь)
- Если `accounts.length === 0`, но есть `userData.id`, создать аккаунт из данных пользователя:
  ```typescript
  if (accounts.length === 0 && userData.id) {
    accounts = [{
      id: userData.id,
      name: userData.name || userData.username || 'Мой аккаунт',
      is_primary: true
    }];
  }
  ```

- Улучшить логирование: выводить полную структуру ответа для диагностики
- Добавить обработку случая, когда API возвращает объект пользователя напрямую

### 3. Добавление кнопки полного удаления

**Файл:** [`src/components/PropertyModal.tsx`](src/components/PropertyModal.tsx)

**Текущее состояние:** `handleDisconnectAvito` только устанавливает `is_active=false`

**Изменения:**

- Добавить новую функцию `handleDeleteAvito` для полного удаления
- В `Modal.confirm` добавить два варианта:
  - "Отключить" (soft delete) - `is_active=false`
  - "Удалить полностью" (hard delete) - `DELETE FROM integrations`
- При hard delete также удалить:
  - Записи из `avito_items` (CASCADE)
  - Записи из `avito_sync_queue` (CASCADE)
- Обновить UI: показывать обе кнопки или одну кнопку с выбором действия

**Альтернативный вариант:** Добавить отдельную кнопку "Удалить" рядом с "Отключить"

### 4. Улучшение Ant Design темы

**Файл:** [`src/App.tsx`](src/App.tsx)

- Использовать `useTheme()` в `ConfigProvider` для динамической настройки темы Ant Design
- Применить светлую тему для Ant Design компонентов, когда `theme === 'light'`

## Порядок выполнения

1. Исправить парсинг аккаунтов в Edge Function (приоритет - пользователь видит проблему)
2. Добавить поддержку темы в ApiIntegrationSettings
3. Добавить кнопку удаления в PropertyModal
4. Обновить Ant Design тему в App.tsx

## Тестирование

- Проверить отображение аккаунтов после OAuth (должен показываться хотя бы один аккаунт)
- Проверить переключение темы в настройках API (должны применяться светлые цвета)
- Проверить soft delete (интеграция отключается, но остается в БД)
- Проверить hard delete (интеграция полностью удаляется из БД)