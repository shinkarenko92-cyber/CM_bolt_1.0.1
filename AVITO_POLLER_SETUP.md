# Настройка Avito Poller Cron Job

## Что делает Avito Poller?

Avito Poller - это автоматическая система синхронизации, которая:
- Запускается каждые 10 секунд
- Обрабатывает очередь синхронизации (`avito_sync_queue`)
- Синхронизирует цены и доступность с Avito API
- Обновляет `last_sync_at` после каждой успешной синхронизации

## Шаг 1: Убедитесь, что функция развернута

Функция `avito-poller` уже развернута. Вы можете проверить это в:
- Supabase Dashboard → Edge Functions → avito-poller

## Шаг 2: Настройте Cron Job через Supabase Dashboard

1. Откройте [Supabase Dashboard](https://app.supabase.com)
2. Выберите ваш проект
3. Перейдите в **Database** → **Cron Jobs** (или **Extensions** → **pg_cron**)
4. Нажмите **"New Cron Job"** или **"Create Cron Job"**

5. Заполните форму:
   - **Name:** `avito_poller_cron`
   - **Schedule:** `*/10 * * * * *` (каждые 10 секунд)
     - Формат: `секунда минута час день месяц день_недели`
     - `*/10 * * * * *` означает: каждые 10 секунд
   - **Function:** `avito-poller` (выберите из списка Edge Functions)
   - **Enabled:** ✅ Yes
   - **Headers (опционально):** Можно оставить пустым

6. Нажмите **"Save"** или **"Create"**

## Альтернативный способ: Настройка через SQL

Если у вас есть доступ к SQL Editor, вы можете выполнить:

```sql
-- Включить расширение pg_cron (если еще не включено)
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

Затем настройте cron job через Dashboard, как описано выше.

## Проверка работы

После настройки cron job:

1. Проверьте логи Edge Function:
   - Supabase Dashboard → Edge Functions → avito-poller → Logs
   - Вы должны видеть регулярные вызовы каждые 10 секунд

2. Проверьте очередь синхронизации:
   ```sql
   SELECT * FROM avito_sync_queue 
   ORDER BY next_sync_at DESC 
   LIMIT 10;
   ```

3. Проверьте `last_sync_at` в интеграциях:
   ```sql
   SELECT 
     id, 
     property_id, 
     last_sync_at, 
     is_active 
   FROM integrations 
   WHERE platform = 'avito' 
   ORDER BY last_sync_at DESC;
   ```

## Частота синхронизации

- **Текущая настройка:** каждые 10 секунд
- **Можно изменить:** в настройках cron job измените schedule
  - Каждые 30 секунд: `*/30 * * * * *`
  - Каждую минуту: `0 * * * * *`
  - Каждые 5 минут: `0 */5 * * * *`

**Важно:** Учитывайте лимиты API Avito при выборе частоты синхронизации.

## Устранение проблем

### Cron job не запускается

1. Проверьте, что расширение `pg_cron` включено:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. Проверьте список cron jobs:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'avito_poller_cron';
   ```

3. Проверьте логи cron:
   ```sql
   SELECT * FROM cron.job_run_details 
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'avito_poller_cron')
   ORDER BY start_time DESC 
   LIMIT 10;
   ```

### Синхронизация не происходит

1. Проверьте, что в очереди есть элементы:
   ```sql
   SELECT * FROM avito_sync_queue WHERE status = 'pending';
   ```

2. Проверьте, что интеграции активны:
   ```sql
   SELECT * FROM integrations WHERE platform = 'avito' AND is_active = true;
   ```

3. Проверьте логи Edge Function `avito-poller` на наличие ошибок

## Отключение автоматической синхронизации

Чтобы временно отключить автоматическую синхронизацию:

1. В Supabase Dashboard → Database → Cron Jobs
2. Найдите `avito_poller_cron`
3. Отключите (Enabled: No) или удалите cron job

Или через SQL:
```sql
SELECT cron.unschedule('avito_poller_cron');
```

