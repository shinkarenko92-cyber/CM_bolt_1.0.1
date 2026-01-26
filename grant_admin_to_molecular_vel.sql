-- Назначение админ прав пользователю molecular_vel@yahoo.com
-- Выполнить в Supabase Dashboard → SQL Editor

DO $$
DECLARE
  target_email TEXT := 'molecular_vel@yahoo.com';
  user_id UUID;
  updated_count INTEGER;
BEGIN
  -- Найти ID пользователя по email
  SELECT id INTO user_id
  FROM profiles
  WHERE email = target_email;
  
  -- Проверить, найден ли пользователь
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'Пользователь с email % не найден', target_email;
  END IF;
  
  -- Обновить роль на admin
  UPDATE profiles
  SET role = 'admin'::user_role,
      updated_at = now()
  WHERE id = user_id;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  -- Вывести результат
  IF updated_count > 0 THEN
    RAISE NOTICE 'Пользователь % (ID: %) успешно назначен администратором', target_email, user_id;
  ELSE
    RAISE WARNING 'Пользователь % не был обновлен (возможно, уже является админом)', target_email;
  END IF;
END $$;
