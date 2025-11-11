/*
  # Добавление минимального срока бронирования
  
  1. Изменения
    - Добавляем поле `minimum_booking_days` в таблицу `properties`
    - По умолчанию минимум 1 ночь
    - Это позволит владельцам устанавливать минимальный срок аренды для каждого объекта
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'minimum_booking_days'
  ) THEN
    ALTER TABLE properties ADD COLUMN minimum_booking_days integer DEFAULT 1;
  END IF;
END $$;