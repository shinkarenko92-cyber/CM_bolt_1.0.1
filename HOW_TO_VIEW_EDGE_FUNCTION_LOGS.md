# Как просмотреть логи Edge Function в Supabase

## Где найти логи Edge Function

### Способ 1: Через Supabase Dashboard (Рекомендуется)

1. Откройте [Supabase Dashboard](https://app.supabase.com)
2. Выберите ваш проект
3. В левом меню найдите раздел **"Edge Functions"** (или **"Functions"**)
4. Нажмите на функцию **"avito-sync"**
5. Перейдите на вкладку **"Logs"** или **"Invocations"**
6. Вы увидите список всех вызовов функции с логами

### Способ 2: Фильтрация логов

В логах Edge Function вы можете:
- Фильтровать по времени (последний час, день, неделя)
- Искать по тексту (например, "get-accounts", "Successfully retrieved user data")
- Просматривать детали каждого вызова, включая:
  - Request body
  - Response body
  - Console logs (все `console.log`, `console.error`)
  - Execution time
  - Status code

### Способ 3: Просмотр конкретного лога

Когда вы подключаете Avito и получаете аккаунты:

1. Найдите в логах запись с action `"get-accounts"`
2. Откройте детали этого вызова
3. В секции **"Logs"** или **"Console Output"** найдите строку:
   ```
   Successfully retrieved user data: { full_response: ... }
   ```
4. Там будет полный JSON ответ от Avito API, включая:
   - Все ключи объекта (`keys: [...]`)
   - Значения полей (`userData_id`, `userData_user_id`, и т.д.)
   - Полный JSON ответ (`full_response`)

### Что искать в логах

При проблеме с отображением аккаунтов ищите:

1. **Строку с "Successfully retrieved user data"** - там будет полная структура ответа
2. **Строку с "Extracted accounts"** - там будет информация о том, сколько аккаунтов найдено
3. **Строку с "No accounts found"** - если аккаунты не найдены, там будет причина

### Пример лога

```
Successfully retrieved user data: {
  full_response: {
    "id": "12345",
    "name": "Иван Иванов",
    "email": "ivan@example.com",
    ...
  },
  has_accounts: false,
  accounts_count: 0,
  keys: ["id", "name", "email", ...],
  has_id: true,
  userData_id: "12345",
  userData_user_id: null
}
```

Если вы видите `has_id: true` или `userData_id` с значением, но `accounts_count: 0`, значит код должен создать аккаунт из данных пользователя.

## Альтернативный способ: Логи в реальном времени

Вы также можете использовать Supabase CLI для просмотра логов в реальном времени:

```bash
supabase functions logs avito-sync --follow
```

Но для этого нужно установить Supabase CLI и быть авторизованным.

