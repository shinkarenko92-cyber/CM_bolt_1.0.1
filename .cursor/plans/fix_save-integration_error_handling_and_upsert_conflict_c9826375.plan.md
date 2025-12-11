---
name: Fix save-integration error handling and upsert conflict
overview: "Исправить ошибку \"Unknown error\" при сохранении интеграции Avito: добавить правильную обработку upsert с onConflict для UNIQUE(property_id, platform) и улучшить логирование ошибок для диагностики."
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

# Исправление ошибки сохранения интеграции Avito

## Проблема

При попытке сохранить интеграцию Avito (выбрать наценку и завершить подключение) возникает ошибка "Unknown error" из Edge Function. Проблема в том, что:

1. **Upsert без onConflict**: В таблице `integrations` есть ограничение `UNIQUE(property_id, platform)`, но при `upsert` не указано, какие поля использовать для разрешения конфликта
2. **Плохая обработка ошибок**: Ошибка от Supabase не логируется детально, поэтому видно только "Unknown error"
3. **Нет валидации параметров**: Не проверяется, что все обязательные параметры переданы корректно

## Решение

### 1. Исправить upsert с правильным onConflict

**Файл:** `supabase/functions/avito-sync/index.ts` (строки 541-559)

- Добавить `onConflict: 'property_id,platform'` в `upsert` для правильной обработки конфликта
- Убедиться, что при обновлении существующей интеграции все поля обновляются корректно

### 2. Улучшить обработку ошибок

**Файл:** `supabase/functions/avito-sync/index.ts` (строки 561)

- Добавить детальное логирование ошибки от Supabase перед `throw error`
- Логировать код ошибки, сообщение, детали и stack trace
- Возвращать более понятное сообщение об ошибке пользователю

### 3. Добавить валидацию параметров

**Файл:** `supabase/functions/avito-sync/index.ts` (строки 526-533)

- Проверить, что все обязательные параметры присутствуют и валидны
- Проверить типы данных (например, `avito_item_id` должен быть числом)
- Вернуть понятную ошибку, если параметры невалидны

## Детали реализации

### Исправление upsert

```typescript
const { data: integration, error } = await supabase
  .from("integrations")
  .upsert({
    property_id,
    platform: "avito",
    external_id: avito_item_id.toString(),
    avito_account_id,
    avito_item_id: parseInt(avito_item_id, 10),
    avito_markup: parseFloat(avito_markup) || 15.0,
    access_token_encrypted: access_token,
    token_expires_at: tokenExpiresAt.toISOString(),
    is_active: true,
    is_enabled: true,
    markup_type: "percent",
    markup_value: parseFloat(avito_markup) || 15.0,
  }, {
    onConflict: 'property_id,platform' // Указываем поля для разрешения конфликта
  })
  .select()
  .single();
```

### Улучшение обработки ошибок

```typescript
if (error) {
  console.error("Error saving integration:", {
    errorCode: error.code,
    errorMessage: error.message,
    errorDetails: error.details,
    errorHint: error.hint,
    params: {
      property_id,
      avito_account_id,
      avito_item_id,
      has_avito_markup: !!avito_markup,
      has_access_token: !!access_token,
    }
  });
  throw error;
}
```

### Валидация параметров

```typescript
// Валидация обязательных параметров
if (!property_id || !avito_account_id || !avito_item_id || !access_token) {
  return new Response(
    JSON.stringify({ 
      error: "Отсутствуют обязательные параметры: property_id, avito_account_id, avito_item_id, access_token" 
    }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Валидация типов
if (isNaN(parseInt(avito_item_id, 10))) {
  return new Response(
    JSON.stringify({ error: "avito_item_id должен быть числом" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

## Тестирование

1. Попробовать сохранить интеграцию с наценкой - должно работать без ошибок
2. Попробовать переподключить интеграцию для того же property - должно обновить существующую запись
3. Проверить логи Edge Function - должны быть детальные сообщения об ошибках, если что-то пойдет не так