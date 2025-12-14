-- Миграция: если avito_account_id содержит item_id (число), скопировать в avito_item_id
-- Проверяем, что avito_account_id выглядит как item_id (большое число, не account_id)
-- Account ID обычно меньше (например, 4720770), item_id больше (например, 2336174775)

-- Сначала логируем, что будем обновлять
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  -- Подсчитываем записи, которые будут обновлены
  SELECT COUNT(*) INTO affected_count
  FROM integrations
  WHERE 
    platform = 'avito'
    AND avito_account_id IS NOT NULL
    AND (avito_item_id IS NULL OR avito_item_id::text = '')
    AND avito_account_id::text ~ '^[0-9]+$'  -- Только цифры
    AND LENGTH(avito_account_id::text) >= 8  -- Item ID обычно длиннее account ID
    AND CAST(avito_account_id AS BIGINT) > 10000000;  -- Item ID обычно больше 10 миллионов

  RAISE NOTICE 'Found % integrations to update: copying avito_account_id to avito_item_id', affected_count;
END $$;

-- Обновляем записи
UPDATE integrations
SET 
  avito_item_id = avito_account_id::text,
  avito_account_id = NULL
WHERE 
  platform = 'avito'
  AND avito_account_id IS NOT NULL
  AND (avito_item_id IS NULL OR avito_item_id::text = '')
  AND avito_account_id::text ~ '^[0-9]+$'  -- Только цифры
  AND LENGTH(avito_account_id::text) >= 8  -- Item ID обычно длиннее account ID
  AND CAST(avito_account_id AS BIGINT) > 10000000;  -- Item ID обычно больше 10 миллионов

-- Логируем результат
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % integrations: copied avito_account_id to avito_item_id', updated_count;
END $$;

