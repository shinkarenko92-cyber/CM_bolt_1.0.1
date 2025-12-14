---
name: Add Avito guest name and phone sync with WhatsApp integration
overview: Добавить синхронизацию имени и телефона гостя из Avito в календарь и карточки брони, с интеграцией WhatsApp для быстрой связи с гостями.
todos:
  - id: create-migration
    content: Создать миграцию для добавления колонок guest_name и guest_phone в таблицу bookings
    status: completed
  - id: update-edge-function
    content: Обновить Edge Function avito-sync для очистки номера телефона от лишних символов
    status: completed
  - id: improve-calendar-display
    content: "Улучшить отображение в BookingBlock: показать имя и последние 4 цифры телефона"
    status: completed
  - id: add-whatsapp-link-bookings
    content: Добавить ссылку на WhatsApp в BookingsView для карточек бронирований
    status: completed
  - id: add-whatsapp-link-tooltip
    content: Добавить ссылку на WhatsApp в tooltip BookingBlock
    status: completed
  - id: add-whatsapp-icon
    content: Создать SVG иконку WhatsApp в public/whatsapp-icon.svg
    status: completed
---

# План: Синхронизация имени и телефона гостя из Avito с интеграцией WhatsApp

## Анализ текущего состояния

1. **Типы TypeScript**: В `src/lib/supabase.ts` уже есть `guest_name` и `guest_phone` в типе `Booking`
2. **Edge Function**: В `supabase/functions/avito-sync/index.ts` уже извлекаются данные из Avito API (`contact.name`, `contact.phone`), но номер не очищается от лишних символов
3. **UI компоненты**: 

   - `BookingBlock.tsx` показывает имя в календаре и телефон в tooltip
   - `BookingsView.tsx` показывает телефон, но без ссылки на WhatsApp

4. **База данных**: Нужна миграция для гарантии наличия колонок `guest_name` и `guest_phone`

## Задачи

### 1. Миграция базы данных

**Файл**: `supabase/migrations/20251214000000_add_guest_name_phone_to_bookings.sql`

```sql
-- Add guest_name and guest_phone columns to bookings table if they don't exist
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS guest_name TEXT;

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS guest_phone TEXT;

-- Add index for search by guest name
CREATE INDEX IF NOT EXISTS idx_bookings_guest_name 
ON bookings(guest_name) 
WHERE guest_name IS NOT NULL;

-- Add index for search by guest phone
CREATE INDEX IF NOT EXISTS idx_bookings_guest_phone 
ON bookings(guest_phone) 
WHERE guest_phone IS NOT NULL;
```

### 2. Обновление Edge Function для извлечения имени и очистки номера телефона

**Файл**: `supabase/functions/avito-sync/index.ts` (строки ~1174-1209)

**Проблема**: Сейчас используется fallback "Гость с Avito", хотя в ответе от Avito API есть реальное имя гостя. Нужно:
- Проверить все возможные поля в ответе API (`customer.name`, `contact.name`, `guest.name`, `user.name`)
- Добавить детальное логирование структуры ответа для диагностики
- Обновлять существующие бронирования, если они имеют "Гость с Avito", а теперь найдено реальное имя

**Изменения**:

1. **Улучшить логику извлечения имени** - добавить больше вариантов полей и детальное логирование:
```typescript
// Расширенная функция извлечения имени с логированием
const extractGuestName = (booking: AvitoBookingResponse): string => {
  // Проверяем все возможные варианты полей
  const name = booking.contact?.name 
    || booking.customer?.name 
    || booking.guest_name 
    || booking.guest?.name
    || booking.user?.name
    || (booking as any).name;
  
  if (name && name.trim() && name !== "Гость с Avito") {
    return name.trim();
  }
  
  // Логируем, если имя не найдено
  console.warn("Guest name not found in booking", {
    bookingId: booking.avito_booking_id || booking.id,
    availableFields: Object.keys(booking),
    contact: booking.contact,
    customer: (booking as any).customer,
    guest: booking.guest,
    user: (booking as any).user,
  });
  
  return "Гость с Avito"; // Fallback только если действительно нет имени
};

// В обработке бронирований:
const contactName = extractGuestName(booking);
```

2. **Добавить функцию очистки номера телефона**:
```typescript
const cleanPhoneNumber = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned || null;
};

const contactPhone = cleanPhoneNumber(
  booking.contact?.phone 
    || booking.customer?.phone
    || booking.guest_phone 
    || booking.guest?.phone
    || (booking as any).phone
);
```

3. **Обновлять существующие бронирования** - если бронирование уже существует, но имеет "Гость с Avito", обновить его:
```typescript
if (existing) {
  // Если существующее бронирование имеет fallback имя, обновляем его
  if (existing.guest_name === "Гость с Avito" && contactName !== "Гость с Avito") {
    await supabase.from("bookings").update({
      guest_name: contactName,
      guest_email: contactEmail,
      guest_phone: contactPhone,
    }).eq("id", existing.id);
    console.log("Updated existing booking with real guest name", {
      booking_id: existing.id,
      old_name: "Гость с Avito",
      new_name: contactName,
    });
  }
  skippedCount++;
} else {
  // Создаем новое бронирование
  ...
}
```

4. **Улучшить интерфейс AvitoBookingResponse** - добавить возможные варианты полей:
```typescript
interface AvitoBookingResponse {
  // ... существующие поля ...
  contact?: {
    name: string;
    email: string;
    phone?: string;
  };
  customer?: {  // Добавить как возможный вариант
    name?: string;
    email?: string;
    phone?: string;
  };
  user?: {  // Добавить как возможный вариант
    name?: string;
    email?: string;
    phone?: string;
  };
  // ... остальные поля ...
  [key: string]: unknown; // Для дополнительных полей
}
```


### 3. Улучшение отображения в календаре

**Файл**: `src/components/BookingBlock.tsx` (строка ~104)

**Изменения**:

- В заголовке блока показать имя и последние 4 цифры телефона (если есть)
- Формат: `Имя (****1234)` или просто `Имя`, если телефона нет
```typescript
// Добавить функцию форматирования
const formatGuestDisplay = (name: string, phone: string | null): string => {
  if (phone && phone.length >= 4) {
    const last4 = phone.slice(-4);
    return `${name} (****${last4})`;
  }
  return name;
};

// В JSX (строка ~104):
<div className="truncate text-white font-medium text-[11px]">
  {formatGuestDisplay(booking.guest_name, booking.guest_phone)}
</div>
```


### 4. Добавление ссылки на WhatsApp в карточке брони

**Файл**: `src/components/BookingsView.tsx` (строки ~263-267)

**Изменения**:

- Заменить простое отображение телефона на блок с телефоном и иконкой WhatsApp
- Добавить ссылку `https://wa.me/{номер}` (без +, только цифры)
```typescript
// Функция форматирования номера для WhatsApp
const formatPhoneForWhatsApp = (phone: string | null): string | null => {
  if (!phone) return null;
  // Убираем все нецифровые символы, включая +
  return phone.replace(/\D/g, '');
};

// В JSX (заменить строки 263-267):
{booking.guest_phone && (
  <div className="flex items-center gap-2">
    <Phone size={14} />
    <span>{booking.guest_phone}</span>
    <a
      href={`https://wa.me/${formatPhoneForWhatsApp(booking.guest_phone)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-green-600/20 transition-colors"
      title="Открыть в WhatsApp"
    >
      <img 
        src="/whatsapp-icon.svg" 
        alt="WhatsApp" 
        className="w-5 h-5"
      />
    </a>
  </div>
)}
```


### 5. Добавление иконки WhatsApp

**Файл**: `public/whatsapp-icon.svg` (создать новый файл)

**Содержимое**: SVG иконка WhatsApp (зеленая, 24x24px). Можно использовать стандартную иконку из [Simple Icons](https://simpleicons.org/icons/whatsapp.svg) или создать собственную.

**Альтернатива**: Использовать иконку из библиотеки (например, `lucide-react` не имеет WhatsApp, можно использовать `MessageCircle` с зеленым цветом или добавить SVG напрямую).

### 6. Улучшение tooltip в календаре

**Файл**: `src/components/BookingBlock.tsx` (строки ~126-130)

**Изменения**:

- Добавить ссылку на WhatsApp в tooltip, если есть телефон
```typescript
{booking.guest_phone && (
  <div className="flex items-center gap-2">
    <span className="text-slate-400">Телефон:</span>
    <span>{booking.guest_phone}</span>
    <a
      href={`https://wa.me/${formatPhoneForWhatsApp(booking.guest_phone)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-green-600/20 transition-colors"
      onClick={(e) => e.stopPropagation()}
      title="Открыть в WhatsApp"
    >
      <img 
        src="/whatsapp-icon.svg" 
        alt="WhatsApp" 
        className="w-4 h-4"
      />
    </a>
  </div>
)}
```


## Файлы для изменения/создания

1. **Новые файлы**:

   - `supabase/migrations/20251214000000_add_guest_name_phone_to_bookings.sql`
   - `public/whatsapp-icon.svg`

2. **Изменения**:

   - `supabase/functions/avito-sync/index.ts` - улучшить извлечение имени, добавить очистку номера, обновлять существующие бронирования
   - `src/components/BookingBlock.tsx` - улучшить отображение в календаре и tooltip
   - `src/components/BookingsView.tsx` - добавить ссылку на WhatsApp

## Тестирование

1. **Миграция**: Проверить, что колонки добавлены в БД
2. **Синхронизация**: Проверить, что номера телефонов очищаются от лишних символов
3. **UI календаря**: Проверить отображение имени и последних 4 цифр
4. **WhatsApp ссылки**: Проверить, что ссылки открываются корректно в WhatsApp
5. **Обратная совместимость**: Убедиться, что бронирования без телефона отображаются корректно

## Примечания

- Номера телефонов из Avito могут быть в формате `+7XXXXXXXXXX` или `8XXXXXXXXXX` - функция очистки должна обрабатывать оба варианта
- WhatsApp требует номер в международном формате без + (только цифры)
- Иконка WhatsApp должна быть зеленой для узнаваемости
- Ссылки должны открываться в новой вкладке с `target="_blank"` и `rel="noopener noreferrer"` для безопасности