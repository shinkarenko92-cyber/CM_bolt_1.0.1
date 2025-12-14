/**
 * Парсинг контактов гостя из строки вида "Имя Фамилия +7 XXX XXX-XX-XX"
 */

export interface ParsedGuest {
  name: string;
  phone: string | null;
}

/**
 * Нормализует телефон к формату +7XXXXXXXXXXX
 */
function normalizePhone(phone: string): string {
  // Убираем все нецифровые символы кроме +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Если начинается с 8, заменяем на +7
  if (cleaned.startsWith('8')) {
    cleaned = '+7' + cleaned.substring(1);
  }
  
  // Если начинается с 7 без +, добавляем +
  if (cleaned.startsWith('7') && !cleaned.startsWith('+7')) {
    cleaned = '+' + cleaned;
  }
  
  // Если не начинается с +7, добавляем
  if (!cleaned.startsWith('+7')) {
    cleaned = '+7' + cleaned.replace(/^\+/, '');
  }
  
  // Убираем лишние цифры (оставляем только 11 цифр после +7)
  const match = cleaned.match(/^\+7(\d{10})/);
  if (match) {
    return '+7' + match[1];
  }
  
  return cleaned;
}

/**
 * Парсит строку контактов и извлекает имя и телефон
 */
export function parseGuestContacts(contacts: string | null | undefined): ParsedGuest {
  if (!contacts || typeof contacts !== 'string') {
    return { name: 'Гость', phone: null };
  }

  const trimmed = contacts.trim();
  if (!trimmed) {
    return { name: 'Гость', phone: null };
  }

  // Regex для поиска телефона: +7 или 7 или 8, затем 10+ цифр
  const phoneRegex = /(\+?7|8)[\d\s\-()]{10,}/;
  const phoneMatch = trimmed.match(phoneRegex);

  if (!phoneMatch) {
    // Нет телефона, вся строка - имя
    return { name: trimmed || 'Гость', phone: null };
  }

  const phoneIndex = phoneMatch.index!;
  const phoneStr = phoneMatch[0];
  
  // Всё до телефона - имя
  const name = trimmed.substring(0, phoneIndex).trim();
  
  // Нормализуем телефон
  const normalizedPhone = normalizePhone(phoneStr);

  return {
    name: name || 'Гость',
    phone: normalizedPhone,
  };
}
