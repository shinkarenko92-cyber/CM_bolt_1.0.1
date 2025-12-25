/**
 * Парсинг Excel файлов для импорта броней
 */

import * as XLSX from 'xlsx';
import { parseDate } from './dateParser';
import { parseGuestContacts } from './guestParser';

export interface ParsedBooking {
  property_name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  guest_name: string;
  guest_phone: string | null;
  amount: number;
  channel: string;
  notes: string;
  guests_count: number;
  rowIndex: number; // Для отображения ошибок
}

export interface ParseResult {
  bookings: ParsedBooking[];
  errors: Array<{ row: number; message: string }>;
  totalRows: number;
}

/**
 * Парсит Excel файл и возвращает массив броней
 */
export function parseExcelFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Берем первый лист
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          reject(new Error('Файл не содержит листов'));
          return;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        
        // Конвертируем в JSON с заголовками в первой строке
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1, // Первая строка - заголовки
          defval: '', // Значение по умолчанию для пустых ячеек
        }) as unknown[][];

        if (jsonData.length < 2) {
          reject(new Error('Файл должен содержать хотя бы одну строку данных (кроме заголовка)'));
          return;
        }

        // Пропускаем первую строку (заголовки)
        const rows = jsonData.slice(1);
        const bookings: ParsedBooking[] = [];
        const errors: Array<{ row: number; message: string }> = [];

        rows.forEach((row, index) => {
          const rowNumber = index + 2; // +2 потому что пропустили заголовок и индексация с 0

          try {
            // Колонки по индексу:
            // 0: Объект
            // 1: Заезд
            // 2: Выезд
            // 3: Контакты
            // 4: Примечания
            // 5: Гостей
            // 6: Сумма
            // 7: Источник
            // 8: Менеджер (игнорируем)

            const propertyName = String(row[0] || '').trim();
            
            // Пропускаем пустые строки
            if (!propertyName) {
              return;
            }

            // Парсим даты
            const startDateStr = String(row[1] || '').trim();
            const endDateStr = String(row[2] || '').trim();

            const startDate = parseDate(startDateStr);
            const endDate = parseDate(endDateStr);

            if (!startDate) {
              errors.push({
                row: rowNumber,
                message: `Неверный формат даты заезда: "${startDateStr}"`,
              });
              return;
            }

            if (!endDate) {
              errors.push({
                row: rowNumber,
                message: `Неверный формат даты выезда: "${endDateStr}"`,
              });
              return;
            }

            // Проверяем, что выезд после заезда
            if (new Date(endDate) <= new Date(startDate)) {
              errors.push({
                row: rowNumber,
                message: `Дата выезда должна быть после даты заезда`,
              });
              return;
            }

            // Парсим контакты
            const contacts = String(row[3] || '').trim();
            const guestInfo = parseGuestContacts(contacts);

            // Парсим примечания
            const notes1 = String(row[4] || '').trim();
            const notes2 = String(row[5] || '').trim(); // Колонка "Гостей" может содержать текст
            const notes = [notes1, notes2].filter(Boolean).join(' ');

            // Парсим количество гостей
            const guestsStr = String(row[5] || '').trim();
            let guestsCount = 1;
            if (guestsStr) {
              const parsed = parseInt(guestsStr, 10);
              if (!isNaN(parsed) && parsed > 0) {
                guestsCount = parsed;
              }
            }

            // Парсим сумму
            const amountStr = String(row[6] || '').trim();
            let amount = 0;
            if (amountStr) {
              // Убираем пробелы и запятые (могут быть разделители тысяч)
              const cleaned = amountStr.replace(/[\s,]/g, '').replace(',', '.');
              const parsed = parseFloat(cleaned);
              if (!isNaN(parsed) && parsed >= 0) {
                amount = parsed;
              }
            }

            // Парсим источник (channel) - нормализуем название
            const channelStr = String(row[7] || '').trim().toLowerCase().replace(/\s+/g, '');
            
            // Маппинг источников из Excel в стандартные
            const sourceMap: { [key: string]: string } = {
              'авито': 'avito',
              'avito': 'avito',
              'booking': 'booking',
              'booking.com': 'booking',
              'airbnb': 'airbnb',
              'cian': 'cian',
              'циан': 'cian',
              'manual': 'manual',
              'вручную': 'manual',
            };
            
            // Проверяем точное совпадение
            let channel = sourceMap[channelStr] || channelStr || 'manual';
            
            // Если не найдено точное совпадение, проверяем частичное
            if (!sourceMap[channelStr]) {
              for (const [key, value] of Object.entries(sourceMap)) {
                if (channelStr.includes(key) || key.includes(channelStr)) {
                  channel = value;
                  break;
                }
              }
            }

            bookings.push({
              property_name: propertyName,
              start_date: startDate,
              end_date: endDate,
              guest_name: guestInfo.name,
              guest_phone: guestInfo.phone,
              amount,
              channel,
              notes,
              guests_count: guestsCount,
              rowIndex: rowNumber,
            });
          } catch (error) {
            errors.push({
              row: rowNumber,
              message: `Ошибка парсинга строки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
            });
          }
        });

        resolve({
          bookings,
          errors,
          totalRows: rows.length,
        });
      } catch (error) {
        reject(new Error(`Ошибка чтения файла: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Ошибка чтения файла'));
    };

    reader.readAsArrayBuffer(file);
  });
}
