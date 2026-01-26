-- Исправление внешнего ключа profiles для каскадного удаления
-- Выполнить в Supabase Dashboard → SQL Editor
-- Этот скрипт добавляет ON DELETE CASCADE к внешнему ключу profiles.id -> auth.users.id

-- Сначала нужно найти имя существующего ограничения
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Найти имя ограничения внешнего ключа
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'profiles'::regclass
    AND contype = 'f'
    AND confrelid = 'auth.users'::regclass;
  
  -- Если ограничение найдено, удаляем его
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE profiles DROP CONSTRAINT IF EXISTS %I', constraint_name);
    RAISE NOTICE 'Удалено старое ограничение: %', constraint_name;
  END IF;
  
  -- Создаем новое ограничение с ON DELETE CASCADE
  ALTER TABLE profiles
  ADD CONSTRAINT profiles_id_fkey 
  FOREIGN KEY (id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;
  
  RAISE NOTICE 'Создано новое ограничение profiles_id_fkey с ON DELETE CASCADE';
END $$;
