-- Правильное удаление пользователя из системы
-- Выполнить в Supabase Dashboard → SQL Editor
-- Этот скрипт удаляет пользователя и все связанные данные в правильном порядке

DO $$
DECLARE
  target_user_id UUID := '36b7bf23-3044-49a9-9a52-010fef436b44'; -- Замените на ID пользователя
  deleted_count INTEGER;
BEGIN
  -- Проверяем, существует ли пользователь
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Пользователь с ID % не найден в auth.users', target_user_id;
  END IF;
  
  -- 1. Удаляем все связанные данные пользователя (если нужно)
  -- Удаляем bookings через properties
  DELETE FROM bookings
  WHERE property_id IN (
    SELECT id FROM properties WHERE owner_id = target_user_id
  );
  
  -- Удаляем property_rates
  DELETE FROM property_rates
  WHERE property_id IN (
    SELECT id FROM properties WHERE owner_id = target_user_id
  );
  
  -- Удаляем integrations
  DELETE FROM integrations
  WHERE property_id IN (
    SELECT id FROM properties WHERE owner_id = target_user_id
  );
  
  -- Удаляем avito_items
  DELETE FROM avito_items
  WHERE property_id IN (
    SELECT id FROM properties WHERE owner_id = target_user_id
  );
  
  -- Удаляем avito_sync_queue
  DELETE FROM avito_sync_queue
  WHERE property_id IN (
    SELECT id FROM properties WHERE owner_id = target_user_id
  );
  
  -- Удаляем properties
  DELETE FROM properties WHERE owner_id = target_user_id;
  
  -- Удаляем guests
  DELETE FROM guests WHERE owner_id = target_user_id;
  
  -- Удаляем admin_actions, где пользователь был админом или целью
  DELETE FROM admin_actions 
  WHERE admin_id = target_user_id OR target_user_id = target_user_id;
  
  -- Удаляем deletion_requests
  DELETE FROM deletion_requests WHERE user_id = target_user_id;
  
  -- 2. Удаляем профиль (должно быть перед удалением auth.users)
  DELETE FROM profiles WHERE id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  IF deleted_count > 0 THEN
    RAISE NOTICE 'Профиль пользователя % удален', target_user_id;
  END IF;
  
  -- 3. Удаляем пользователя из auth.users
  -- ВНИМАНИЕ: Это требует прав суперпользователя или service_role
  -- В Supabase это делается через auth.admin.deleteUser() в Edge Function
  RAISE NOTICE 'Для удаления из auth.users используйте Supabase Auth Admin API или Edge Function delete-user-account';
  RAISE NOTICE 'Или выполните: SELECT auth.delete_user(''%'');', target_user_id;
  
END $$;
