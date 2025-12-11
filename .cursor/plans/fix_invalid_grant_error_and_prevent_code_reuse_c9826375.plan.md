---
name: Fix invalid_grant error and prevent code reuse
overview: "Исправить ошибку invalid_grant: код авторизации используется дважды. Удалять OAuth данные из localStorage сразу после первого использования, улучшить обработку ошибки invalid_grant с понятным сообщением, улучшить извлечение деталей ошибки из ответа Edge Function."
todos:
  - id: clear-oauth-immediately
    content: Удалять OAuth данные из localStorage сразу после первого использования кода в handleOAuthCallback
    status: completed
  - id: improve-error-extraction
    content: Улучшить извлечение деталей ошибки из ответа Edge Function в exchangeCodeForToken
    status: completed
  - id: handle-invalid-grant
    content: Добавить специальную обработку ошибки invalid_grant с понятным сообщением
    status: completed
---

# Исправление ошибки invalid_grant и предотвращение повторного использования кода

## Проблема

Ошибка `invalid_grant` от Avito API означает, что authorization code уже использован или истек. Это происходит потому, что:

1. `handleOAuthCallback` вызывается дважды (при открытии модального окна и через интервал)
2. OAuth данные удаляются из localStorage только после успешной обработки, а не сразу после первого использования кода

## Решения

### 1. Удалять OAuth данные сразу после первого использования кода

**Файл:** [`src/components/AvitoConnectModal.tsx`](src/components/AvitoConnectModal.tsx)

- В начале `handleOAuthCallback` сразу удалять OAuth данные из localStorage с помощью `clearOAuthSuccess()`
- Это предотвратит повторное использование кода, даже если функция вызывается дважды
- Если обработка успешна, данные уже будут удалены
- Если обработка не удалась, пользователь может начать заново

### 2. Улучшить обработку ошибки invalid_grant

**Файл:** [`src/services/avito.ts`](src/services/avito.ts)

- В `exchangeCodeForToken` извлекать детали ошибки из `error.data` (если есть)
- Проверять наличие `error.data.details` или `error.data.error`
- Если ошибка содержит `invalid_grant`, показывать понятное сообщение пользователю

**Файл:** [`src/components/AvitoConnectModal.tsx`](src/components/AvitoConnectModal.tsx)

- В обработке ошибок в `handleOAuthCallback` проверять наличие `invalid_grant`
- Показывать понятное сообщение: "Код авторизации уже использован или истек. Пожалуйста, начните процесс подключения заново."

### 3. Улучшить извлечение деталей ошибки из ответа Edge Function

**Файл:** [`src/services/avito.ts`](src/services/avito.ts)

- В `exchangeCodeForToken` проверять `error.data` для получения деталей ошибки
- Если `error.data` содержит объект с полями `error` или `details`, извлекать их
- Формировать детальное сообщение об ошибке, включающее информацию от Avito API

## Порядок выполнения

1. Удалять OAuth данные сразу после первого использования кода в `handleOAuthCallback`
2. Улучшить извлечение деталей ошибки в `exchangeCodeForToken`
3. Добавить специальную обработку ошибки `invalid_grant` в `handleOAuthCallback`

## Тестирование

- Проверить, что код используется только один раз
- Проверить, что при ошибке `invalid_grant` показывается понятное сообщение
- Проверить, что детали ошибки от Avito API отображаются пользователю