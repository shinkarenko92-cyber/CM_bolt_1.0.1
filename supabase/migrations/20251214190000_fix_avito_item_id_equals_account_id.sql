-- КРИТИЧЕСКАЯ МИГРАЦИЯ: Исправление записей, где avito_item_id равен avito_account_id
-- Это вызывает 404 ошибки, так как item_id должен быть длинным числом (например, 2336174775),
-- а не коротким account_id (например, 4720770)

-- Шаг 1: Логируем проблемные записи
DO $$
DECLARE
  affected_count INTEGER;
  problem_records RECORD;
BEGIN
  -- Подсчитываем записи с проблемой
  SELECT COUNT(*) INTO affected_count
  FROM integrations
  WHERE 
    platform = 'avito'
    AND avito_item_id IS NOT NULL
    AND avito_account_id IS NOT NULL
    AND CAST(avito_item_id AS TEXT) = CAST(avito_account_id AS TEXT);

  RAISE NOTICE 'Found % integrations where avito_item_id equals avito_account_id (CRITICAL ERROR)', affected_count;

  -- Показываем детали проблемных записей
  FOR problem_records IN
    SELECT 
      id,
      property_id,
      CAST(avito_item_id AS TEXT) as item_id,
      avito_account_id as account_id
    FROM integrations
    WHERE 
      platform = 'avito'
      AND avito_item_id IS NOT NULL
      AND avito_account_id IS NOT NULL
      AND CAST(avito_item_id AS TEXT) = CAST(avito_account_id AS TEXT)
  LOOP
    RAISE NOTICE 'Problem record: integration_id=%, property_id=%, item_id=%, account_id=%', 
      problem_records.id, 
      problem_records.property_id, 
      problem_records.item_id, 
      problem_records.account_id;
  END LOOP;
END $$;

-- Шаг 2: Очищаем avito_item_id для проблемных записей
-- Это заставит пользователя ввести правильный item_id через UI
UPDATE integrations
SET 
  avito_item_id = NULL,
  is_active = false  -- Деактивируем интеграцию, пока не будет введен правильный item_id
WHERE 
  platform = 'avito'
  AND avito_item_id IS NOT NULL
  AND avito_account_id IS NOT NULL
  AND CAST(avito_item_id AS TEXT) = CAST(avito_account_id AS TEXT);

-- Шаг 3: Логируем результат
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Fixed % integrations: cleared incorrect avito_item_id (set to NULL and deactivated)', updated_count;
  RAISE NOTICE 'IMPORTANT: Users need to re-enter correct avito_item_id (long number like 2336174775) via UI';
END $$;

-- Шаг 4: Также исправляем случаи, где avito_item_id слишком короткий (меньше 8 символов)
-- Это обычно означает, что там сохранен account_id вместо item_id
UPDATE integrations
SET 
  avito_item_id = NULL,
  is_active = false
WHERE 
  platform = 'avito'
  AND avito_item_id IS NOT NULL
  AND LENGTH(CAST(avito_item_id AS TEXT)) < 8  -- Item ID обычно длиннее 8 символов
  AND CAST(avito_item_id AS TEXT) ~ '^[0-9]+$';  -- Только цифры

-- Логируем результат второго обновления
DO $$
DECLARE
  updated_count_short INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count_short = ROW_COUNT;
  IF updated_count_short > 0 THEN
    RAISE NOTICE 'Also fixed % integrations with short avito_item_id (< 8 chars, likely account_id)', updated_count_short;
  END IF;
END $$;

