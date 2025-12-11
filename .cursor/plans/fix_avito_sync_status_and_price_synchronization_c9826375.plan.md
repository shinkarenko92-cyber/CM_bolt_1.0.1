---
name: Fix Avito sync status and price synchronization
overview: "Исправить две проблемы: 1) Зеленый индикатор не отображается после синхронизации - нужно обновлять is_active и перезагружать интеграцию в PropertyModal. 2) Цены не синхронизируются в Avito - нужно добавить синхронизацию property_rates (календарь цен) и автоматическую синхронизацию при изменении цен."
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

# Исправление статуса синхронизации Avito и синхронизации цен

## Проблемы

1. **Зеленый индикатор не горит после синхронизации:**

   - После `initial-sync` обновляется только `last_sync_at`, но не проверяется/обновляется `is_active`
   - `PropertyModal` не перезагружает интеграцию после успешной синхронизации
   - `isTokenExpired()` может возвращать `true` если `token_expires_at` отсутствует

2. **Цены не синхронизируются в Avito:**

   - В `avito-sync` синхронизируется только `base_price` через `/prices` endpoint
   - Не синхронизируется календарь цен (`property_rates`) - нет обновления цен по датам
   - Нет автоматической синхронизации при изменении цен в `PropertyModal` (изменение `base_price`) или `ChangeConditionsModal` (изменение `property_rates`)

## Решение

### 1. Исправить отображение статуса синхронизации

**Файл:** `supabase/functions/avito-sync/index.ts`

- После успешной синхронизации обновлять `is_active = true` вместе с `last_sync_at` (строка 690-694)
- Убедиться, что `token_expires_at` правильно устанавливается при `save-integration`

**Файл:** `src/components/PropertyModal.tsx`

- Добавить вызов `loadAvitoIntegration()` после успешного закрытия `AvitoConnectModal` (строка 576-578)
- Исправить `isTokenExpired()` чтобы правильно обрабатывать отсутствие `token_expires_at` (строка 230-233)

**Файл:** `src/components/AvitoConnectModal.tsx`

- Убедиться, что `onSuccess()` вызывается после успешной синхронизации (строка 409)

### 2. Добавить синхронизацию календаря цен (property_rates)

**Файл:** `supabase/functions/avito-sync/index.ts`

- В действии `initial-sync`/`sync` (после строки 634) добавить синхронизацию `property_rates`:
  - Получить все `property_rates` для property_id из базы данных
  - Для каждой даты с ценой обновить календарь Avito через `/short_term_rent/accounts/{accountId}/items/{itemId}/availability` с ценой и статусом `available`
  - Использовать `calculatePriceWithMarkup` для применения наценки к каждой цене

### 3. Добавить автоматическую синхронизацию при изменении цен

**Файл:** `src/components/PropertyModal.tsx`

- В `handleSubmit` (после сохранения property, строка 235-256) добавить проверку:
  - Если `base_price` изменился и есть активная Avito интеграция, вызвать синхронизацию через `syncAvitoIntegration(property.id)`

**Файл:** `src/components/ChangeConditionsModal.tsx`

- В `handleSubmit` (после сохранения `property_rates`, строка 111-117) добавить:
  - Проверить, есть ли активная Avito интеграция для property
  - Если есть, вызвать синхронизацию через `syncAvitoIntegration(propertyId)`

**Файл:** `src/services/apiSync.ts`

- Убедиться, что `syncAvitoIntegration` правильно вызывает Edge Function с `action: 'sync'`

## Детали реализации

### Синхронизация property_rates в Edge Function

```typescript
// После строки 634 в avito-sync/index.ts
// Get property rates from database
const { data: propertyRates } = await supabase
  .from("property_rates")
  .select("*")
  .eq("property_id", integration.property_id)
  .gte("date", new Date().toISOString().split('T')[0]); // Only future dates

if (propertyRates && propertyRates.length > 0) {
  // Prepare calendar dates with prices
  const calendarDates = propertyRates.map((rate) => ({
    date: rate.date,
    status: 'available',
    price: Math.round(rate.daily_price * (1 + markup / 100)), // Apply markup
    minStay: rate.min_stay || property?.minimum_booking_days || 1,
  }));

  // Update Avito calendar with prices
  await fetch(
    `${AVITO_API_BASE}/short_term_rent/accounts/${accountId}/items/${itemId}/availability`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dates: calendarDates,
      }),
    }
  );
}
```

### Автоматическая синхронизация в PropertyModal

```typescript
// После сохранения property (строка 256)
if (avitoIntegration?.is_active && !isTokenExpired()) {
  const oldBasePrice = property?.base_price;
  const newBasePrice = parseFloat(formData.base_price);
  if (oldBasePrice !== newBasePrice) {
    // Trigger sync
    try {
      await syncAvitoIntegration(property.id);
      message.success('Цены синхронизированы с Avito');
    } catch (error) {
      console.error('Failed to sync prices to Avito:', error);
      // Don't show error to user, just log it
    }
  }
}
```

### Автоматическая синхронизация в ChangeConditionsModal

```typescript
// После сохранения property_rates (строка 117)
// Check if Avito integration exists and is active
const { data: integration } = await supabase
  .from('integrations')
  .select('*')
  .eq('property_id', formData.selectedPropertyId)
  .eq('platform', 'avito')
  .eq('is_active', true)
  .maybeSingle();

if (integration && integration.token_expires_at && new Date(integration.token_expires_at) > new Date()) {
  // Trigger sync
  try {
    await syncAvitoIntegration(formData.selectedPropertyId);
    // Show success message or update UI
  } catch (error) {
    console.error('Failed to sync prices to Avito:', error);
  }
}
```

## Тестирование

1. Подключить Avito интеграцию - проверить, что зеленый индикатор появляется
2. Изменить `base_price` в PropertyModal - проверить, что цены синхронизируются в Avito
3. Изменить цены через ChangeConditionsModal - проверить, что календарь цен обновляется в Avito
4. Проверить, что после синхронизации `is_active = true` и `last_sync_at` обновляется