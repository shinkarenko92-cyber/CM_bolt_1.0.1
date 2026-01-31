# Roomi Pro Mobile

Канал-менеджер для краткосрочной аренды. Supabase, объекты, бронирования, пуш-уведомления.

## Запуск

- **Expo Go** (без пушей и MMKV, только SecureStore):  
  `npx expo start` → отсканируй QR. В Expo Go отключены пуш-уведомления и используется fallback хранилища сессии.
- **Development build** (полный функционал, пуш + MMKV):  
  `eas build --profile development` → установи клиент на устройство/симулятор, затем `npx expo start --dev-client`. OTA: `eas update --branch development`.

## Окружение

Ключи берутся из **touch.env** в корне `roomi-pro-mobile`. Создай файл `touch.env` и укажи:

- `EXPO_PUBLIC_SUPABASE_URL` — полный URL (`https://xxx.supabase.co`) или только ref проекта
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — anon key из Supabase Dashboard

Файл в `.gitignore`, в репозиторий не попадёт.
