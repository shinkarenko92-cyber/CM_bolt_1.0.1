const path = require('path');
// Загружаем ключи из touch.env (приложение читает EXPO_PUBLIC_* отсюда)
require('dotenv').config({ path: path.resolve(__dirname, 'touch.env') });

// Если в touch.env указан только ref Supabase — дополняем до полного URL
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (url && !url.startsWith('http')) {
  process.env.EXPO_PUBLIC_SUPABASE_URL = `https://${url}.supabase.co`;
}

module.exports = require('./app.json');
