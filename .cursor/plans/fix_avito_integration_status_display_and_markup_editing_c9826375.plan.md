---
name: Fix Avito integration status display and markup editing
overview: "Исправить две проблемы: 1) Интеграция показывает \"отключено\" вместо \"синхронизировано\" после подключения - нужно убедиться, что loadAvitoIntegration вызывается после завершения initial-sync и что is_active правильно обновляется. 2) Нельзя изменить наценку - кнопка редактирования наценки не показывается, потому что интеграция считается неактивной."
todos:
  - id: simplify-frontend-validation
    content: Упростить validateItemId - проверять только формат ID (число, не пустое, минимум 6 цифр)
    status: pending
  - id: update-ui-messages
    content: Обновить UI сообщения в AvitoConnectModal для указания, что проверка будет при сохранении
    status: pending
  - id: optional-simplify-edge-function
    content: (Опционально) Упростить Edge Function validate-item - оставить только проверку на дубликаты
    status: pending
---

# Исправление отображения статуса интеграции и редактирования наценки

## Проблемы

1. **Интеграция показывает "отключено" вместо "синхронизировано":**

   - После `save-integration` и `initial-sync` интеграция должна быть активной
   - Но `loadAvitoIntegration()` вызывается в `onSuccess` callback, который может выполниться до завершения `initial-sync`
   - Нужно убедиться, что интеграция перезагружается после успешного завершения `initial-sync`

2. **Нельзя изменить наценку:**

   - Кнопка "Редактировать наценку" показывается только если `avitoIntegration?.is_active && !isTokenExpired()`
   - Если интеграция считается неактивной, кнопка не отображается
   - Нужно проверить, почему интеграция не считается активной после подключения

## Решение

### 1. Исправить порядок вызовов после сохранения интеграции

**Файл:** `src/components/AvitoConnectModal.tsx` (строки 394-410)

- Убедиться, что `loadAvitoIntegration()` вызывается после успешного завершения `initial-sync`
- Добавить задержку или дождаться завершения `initial-sync` перед вызовом `onSuccess()`
- Или вызвать `loadAvitoIntegration()` явно после `initial-sync`

### 2. Убедиться, что initial-sync обновляет is_active

**Файл:** `supabase/functions/avito-sync/index.ts` (строки 742-749)

- Проверить, что `is_active = true` обновляется после успешной синхронизации
- Убедиться, что обновление происходит до возврата ответа

### 3. Добавить перезагрузку интеграции после initial-sync

**Файл:** `src/components/AvitoConnectModal.tsx` (строки 394-410)

- После успешного `performInitialSync` добавить небольшую задержку и вызвать `onSuccess()` 
- Или передать callback в `performInitialSync`, который будет вызван после завершения
- Или добавить явный вызов перезагрузки данных

### 4. Улучшить обработку ошибок в handleSaveMarkup

**Файл:** `src/components/PropertyModal.tsx` (строки 207-218)

- Добавить обработку ошибок при сохранении наценки
- Показывать сообщение об ошибке, если сохранение не удалось

## Детали реализации

### Исправление порядка вызовов в AvitoConnectModal

```typescript
// После успешного сохранения интеграции
await performInitialSync(integration.id);

// Добавить небольшую задержку, чтобы дать время базе данных обновиться
await new Promise(resolve => setTimeout(resolve, 500));

// Теперь вызываем onSuccess, который перезагрузит интеграцию
onSuccess?.();
onClose();
```

### Альтернатива: явная перезагрузка

```typescript
// После успешного initial-sync
await performInitialSync(integration.id);

// Вызываем onSuccess для обновления UI
onSuccess?.();

// Добавляем небольшую задержку перед закрытием, чтобы UI успел обновиться
setTimeout(() => {
  onClose();
}, 300);
```

### Улучшение handleSaveMarkup

```typescript
const handleSaveMarkup = async () => {
  if (!avitoIntegration) return;
  
  setLoading(true);
  try {
    const { error } = await supabase
      .from('integrations')
      .update({ avito_markup: newMarkup })
      .eq('id', avitoIntegration.id);
    
    if (error) throw error;
    
    message.success('Наценка обновлена');
    setIsEditMarkupModalOpen(false);
    loadAvitoIntegration();
  } catch (error) {
    console.error('Failed to update markup:', error);
    message.error('Ошибка при обновлении наценки: ' + (error instanceof Error ? error.message : 'Неизвестная ошибка'));
  } finally {
    setLoading(false);
  }
};
```

## Тестирование

1. Подключить Avito интеграцию - проверить, что статус меняется на "синхронизировано"
2. Попробовать изменить наценку - проверить, что кнопка "Редактировать наценку" доступна
3. Сохранить новую наценку - проверить, что она обновляется в базе данных и отображается в UI