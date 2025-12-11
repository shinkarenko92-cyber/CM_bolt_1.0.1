---
name: Fix OAuth callback handling and Edge Function calls
overview: "Исправить обработку OAuth callback: модальное окно не открывается, Edge Function не вызывается. Добавить диагностику и улучшить логику открытия модальных окон."
todos:
  - id: add-dashboard-oauth-check
    content: Добавить проверку OAuth callback в Dashboard с автоматическим переключением на Properties
    status: completed
  - id: improve-properties-view-oauth
    content: Улучшить проверку OAuth callback в PropertiesView с ожиданием загрузки properties
    status: completed
  - id: add-diagnostic-logging
    content: Добавить диагностическое логирование во всех компонентах OAuth flow
    status: completed
  - id: improve-modal-oauth-handling
    content: Улучшить обработку OAuth callback в AvitoConnectModal
    status: completed
---

# Исправление обработки OAuth callback и вызовов Edge Function

## Проблемы

1. **Модальное окно не открывается** после OAuth редиректа
2. **Нет запросов к Edge Function** в последние 30 минут - значит `handleOAuthCallback` не вызывается

## Анализ

**Текущий поток:**

1. `App.tsx` сохраняет OAuth данные в localStorage
2. `PropertiesView` проверяет OAuth callback и открывает PropertyModal
3. `PropertyModal` проверяет OAuth callback и открывает AvitoConnectModal
4. `AvitoConnectModal` вызывает `handleOAuthCallback`, который вызывает Edge Function

**Проблемы:**

- Если пользователь не на странице Properties, модальное окно не откроется
- Если properties еще не загружены, property не найдется
- OAuth данные могут быть удалены до того, как модальное окно их обработает

## Решения

### 1. Добавить проверку OAuth callback на уровне Dashboard

**Файл:** [`src/components/Dashboard.tsx`](src/components/Dashboard.tsx)

- Добавить `useEffect`, который проверяет OAuth callback при монтировании Dashboard
- Если обнаружен OAuth callback, автоматически переключиться на вкладку Properties
- Это гарантирует, что PropertiesView сможет обработать callback

### 2. Улучшить проверку OAuth callback в PropertiesView

**Файл:** [`src/components/PropertiesView.tsx`](src/components/PropertiesView.tsx)

- Добавить проверку, что properties загружены перед обработкой OAuth callback
- Добавить больше логирования для диагностики
- Обработать случай, когда properties еще загружаются

### 3. Добавить диагностическое логирование

**Файлы:**

- [`src/App.tsx`](src/App.tsx) - логировать сохранение OAuth данных
- [`src/components/PropertiesView.tsx`](src/components/PropertiesView.tsx) - логировать проверку OAuth callback
- [`src/components/AvitoConnectModal.tsx`](src/components/AvitoConnectModal.tsx) - логировать вызов handleOAuthCallback

### 4. Улучшить обработку OAuth callback в AvitoConnectModal

**Файл:** [`src/components/AvitoConnectModal.tsx`](src/components/AvitoConnectModal.tsx)

- Убедиться, что `handleOAuthCallback` вызывается даже если модальное окно было закрыто
- Добавить проверку OAuth callback при монтировании компонента (не только при открытии)
- Добавить логирование вызова Edge Function

## Порядок выполнения

1. Добавить проверку OAuth callback в Dashboard с автоматическим переключением на Properties
2. Улучшить проверку в PropertiesView с ожиданием загрузки properties
3. Добавить диагностическое логирование во всех компонентах
4. Улучшить обработку в AvitoConnectModal

## Тестирование

- Проверить, что после OAuth редиректа автоматически открывается вкладка Properties
- Проверить, что PropertyModal открывается для нужного property
- Проверить, что AvitoConnectModal открывается и вызывает Edge Function
- Проверить логи в консоли для диагностики потока данных