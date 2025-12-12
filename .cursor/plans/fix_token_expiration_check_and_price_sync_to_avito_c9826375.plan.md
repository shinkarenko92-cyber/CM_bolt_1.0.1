---
name: Fix token expiration check and price sync to Avito
overview: "Исправить две проблемы: 1) Токен считается истекшим из-за неправильной проверки времени (проблема с часовыми поясами) - нужно исправить isTokenExpired(). 2) Цены не синхронизируются в Avito при изменении в календаре - нужно проверить автоматическую синхронизацию и убедиться, что она вызывается правильно."
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

# Исправление проверки истечения токена и синхронизации цен в Avito

## Проблемы

1. **Токен считается истекшим неправильно:**

   - В логах: `token_expires_at: '2025-12-12T06:34:52.997'`, `now: '2025-12-12T05:34:56.271Z'`, `expired: true`
   - Токен еще не истек (06:34 > 05:34), но проверка возвращает `true`
   - Проблема в сравнении дат - возможно, разные форматы или часовые пояса

2. **Цены не синхронизируются в Avito:**

   - Цены меняются в календаре (property_rates), но не обновляются в Avito
   - Автоматическая синхронизация при изменении цен не работает или не вызывается

## Решение

### 1. Исправить проверку истечения токена

**Файл:** `src/components/PropertyModal.tsx` (строки 241-248)

- Исправить сравнение дат, учитывая часовые пояса
- Использовать правильное сравнение: `new Date(token_expires_at) > new Date()`
- Убедиться, что обе даты в одном формате (ISO 8601)

### 2. Проверить автоматическую синхронизацию цен

**Файл:** `src/components/ChangeConditionsModal.tsx` (строки 120-138)

- Убедиться, что синхронизация вызывается после сохранения property_rates
- Проверить, что интеграция считается активной перед синхронизацией
- Добавить логирование для диагностики

### 3. Проверить синхронизацию в Edge Function

**Файл:** `supabase/functions/avito-sync/index.ts` (строки 636-684)

- Убедиться, что property_rates правильно синхронизируются в Avito
- Проверить, что календарь цен обновляется через правильный endpoint
- Добавить логирование для диагностики

### 4. Улучшить обработку ошибок синхронизации

**Файл:** `src/components/ChangeConditionsModal.tsx`

- Добавить обработку ошибок при синхронизации
- Показывать сообщение пользователю, если синхронизация не удалась
- Логировать ошибки для диагностики

## Детали реализации

### Исправление isTokenExpired

```typescript
const isTokenExpired = () => {
  if (!avitoIntegration?.token_expires_at) {
    console.log('PropertyModal: isTokenExpired - no token_expires_at, assuming valid');
    return false;
  }
  
  // Правильное сравнение дат с учетом часовых поясов
  const expiresAt = new Date(avitoIntegration.token_expires_at);
  const now = new Date();
  const expired = expiresAt <= now; // Токен истек, если expiresAt <= now
  
  console.log('PropertyModal: isTokenExpired', {
    token_expires_at: avitoIntegration.token_expires_at,
    expiresAt: expiresAt.toISOString(),
    now: now.toISOString(),
    expired,
    timeDiff: expiresAt.getTime() - now.getTime(), // Разница в миллисекундах
  });
  
  return expired;
};
```

### Улучшение синхронизации в ChangeConditionsModal

```typescript
// После сохранения property_rates
if (upsertError) throw upsertError;

// Auto-sync to Avito if integration is active
const { data: integration, error: integrationError } = await supabase
  .from('integrations')
  .select('*')
  .eq('property_id', formData.selectedPropertyId)
  .eq('platform', 'avito')
  .eq('is_active', true)
  .maybeSingle();

console.log('ChangeConditionsModal: Checking for Avito integration', {
  property_id: formData.selectedPropertyId,
  hasIntegration: !!integration,
  is_active: integration?.is_active,
  token_expires_at: integration?.token_expires_at,
});

if (integration && integration.token_expires_at) {
  const expiresAt = new Date(integration.token_expires_at);
  const now = new Date();
  const tokenValid = expiresAt > now;
  
  if (tokenValid) {
    console.log('ChangeConditionsModal: Triggering Avito sync');
    try {
      await syncAvitoIntegration(formData.selectedPropertyId);
      console.log('ChangeConditionsModal: Avito sync completed successfully');
    } catch (error) {
      console.error('ChangeConditionsModal: Failed to sync prices to Avito:', error);
      // Показываем ошибку пользователю, но не блокируем сохранение цен
      message.warning('Цены сохранены, но синхронизация с Avito не удалась. Попробуйте синхронизировать вручную.');
    }
  } else {
    console.log('ChangeConditionsModal: Token expired, skipping sync', {
      expiresAt: expiresAt.toISOString(),
      now: now.toISOString(),
    });
  }
}
```

### Добавление логирования в Edge Function

```typescript
// В sync action, после получения property_rates
console.log("Syncing property_rates to Avito", {
  property_id: integration.property_id,
  ratesCount: propertyRates?.length || 0,
  accountId,
  itemId,
});

if (propertyRates && propertyRates.length > 0) {
  // ... существующий код ...
  
  console.log("Sending calendar update to Avito", {
    datesCount: calendarDates.length,
    sampleDate: calendarDates[0],
  });
  
  const calendarResponse = await fetch(/* ... */);
  
  if (!calendarResponse.ok) {
    const errorText = await calendarResponse.text();
    console.error("Failed to update Avito calendar", {
      status: calendarResponse.status,
      statusText: calendarResponse.statusText,
      error: errorText,
    });
  } else {
    console.log("Avito calendar updated successfully");
  }
}
```

## Тестирование

1. Проверить, что токен не считается истекшим, если он еще действителен
2. Изменить цены в календаре - проверить, что они синхронизируются в Avito
3. Проверить логи в консоли и Edge Function для диагностики проблем