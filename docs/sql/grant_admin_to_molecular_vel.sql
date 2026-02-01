-- Назначение админ прав пользователю molecular_vel@yahoo.com
-- Выполнить в Supabase Dashboard → SQL Editor
-- Скрипт проверяет наличие пользователя в auth.users и создает профиль, если его нет

DO $$
DECLARE
  target_email TEXT := 'molecular_vel@yahoo.com';
  auth_user_id UUID;
  profile_user_id UUID;
  updated_count INTEGER;
BEGIN
  -- Сначала проверим, существует ли пользователь в auth.users
  SELECT id INTO auth_user_id
  FROM auth.users
  WHERE email = target_email;
  
  -- Если пользователь не найден в auth.users, выбросим ошибку
  IF auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Пользователь с email % не найден в auth.users. Пользователь должен быть зарегистрирован в системе.', target_email;
  END IF;
  
  -- Проверим, есть ли запись в profiles
  SELECT id INTO profile_user_id
  FROM profiles
  WHERE id = auth_user_id;
  
  -- Если профиля нет, создадим его с ролью admin
  IF profile_user_id IS NULL THEN
    RAISE NOTICE 'Профиль для пользователя % не найден. Создаю профиль с ролью admin...', target_email;
    
    INSERT INTO profiles (id, email, role, is_active, created_at, updated_at)
    VALUES (
      auth_user_id,
      target_email,
      'admin'::user_role,
      true,
      now(),
      now()
    );
    
    RAISE NOTICE 'Профиль создан. Пользователь % (ID: %) назначен администратором', target_email, auth_user_id;
  ELSE
    -- Если профиль существует, обновим роль на admin
    UPDATE profiles
    SET role = 'admin'::user_role,
        updated_at = now()
    WHERE id = auth_user_id;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    -- Вывести результат
    IF updated_count > 0 THEN
      RAISE NOTICE 'Пользователь % (ID: %) успешно назначен администратором', target_email, auth_user_id;
    ELSE
      RAISE WARNING 'Пользователь % не был обновлен (возможно, уже является админом)', target_email;
    END IF;
  END IF;
END $$;
