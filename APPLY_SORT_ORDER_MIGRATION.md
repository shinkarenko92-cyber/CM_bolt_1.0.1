# Применение миграции sort_order

## Проблема
Ошибка `PGRST204: Could not find the 'sort_order' column` возникает, потому что колонка `sort_order` не существует в таблице `properties`.

## Решение

### Вариант 1: Через Supabase Dashboard (Рекомендуется)

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard/project/kvauqrxihwdgclhwmzof)
2. Перейдите в **SQL Editor**
3. Скопируйте и выполните следующий SQL:

```sql
-- Ensure sort_order column exists in properties table
-- This migration is idempotent and safe to run multiple times

-- Check if sort_order column exists, if not add it
DO $$
BEGIN
  -- Check if column exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'properties' 
    AND column_name = 'sort_order'
  ) THEN
    -- Add sort_order column if it doesn't exist
    ALTER TABLE properties 
    ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
    
    -- Create index for efficient queries
    CREATE INDEX IF NOT EXISTS idx_properties_sort_order 
    ON properties(group_id, sort_order) 
    WHERE group_id IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_properties_ungrouped_sort_order 
    ON properties(owner_id, sort_order) 
    WHERE group_id IS NULL;
    
    -- Update existing records to have sort_order based on created_at
    -- This ensures existing properties have a valid sort_order
    WITH numbered_properties AS (
      SELECT 
        id,
        ROW_NUMBER() OVER (PARTITION BY COALESCE(group_id::text, 'ungrouped') ORDER BY created_at) - 1 as row_num
      FROM properties
    )
    UPDATE properties p
    SET sort_order = np.row_num
    FROM numbered_properties np
    WHERE p.id = np.id;
    
    RAISE NOTICE 'sort_order column added to properties table';
  ELSE
    RAISE NOTICE 'sort_order column already exists in properties table';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN properties.sort_order IS 'Order of property within its group (or ungrouped properties)';
```

4. Нажмите **Run** для выполнения

### Вариант 2: Через Edge Function

1. Вызовите Edge Function:
   ```
   https://kvauqrxihwdgclhwmzof.supabase.co/functions/v1/apply-sort-order-migration
   ```
2. Скопируйте SQL из ответа
3. Выполните его в Supabase Dashboard → SQL Editor

## Проверка

После применения миграции проверьте, что колонка создана:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'properties' 
  AND column_name = 'sort_order';
```

Должна вернуться строка с `column_name = 'sort_order'`.

## После применения миграции

1. **Перезагрузите страницу** в браузере (Ctrl+Shift+R или Cmd+Shift+R для полной перезагрузки)
2. Ошибки `PGRST204` должны исчезнуть
3. Объекты должны быть видны при прокрутке календаря

## Если проблема сохраняется

1. Проверьте консоль браузера на наличие ошибок
2. Убедитесь, что миграция применена (выполните проверочный SQL выше)
3. Очистите кеш браузера
4. Проверьте, что код обновлен (последний коммит: `ef74753`)

