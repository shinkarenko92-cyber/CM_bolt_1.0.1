import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelFile } from './excelParser';

const HEADERS = ['Объект', 'Заезд', 'Выезд', 'Контакты', 'Примечания', 'Гостей', 'Сумма', 'Источник'];

function buildXlsxBuffer(rows: unknown[][]): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

function toFile(buffer: Uint8Array, name: string): File {
  return new File([buffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('excelParser', () => {
  describe('валидный файл', () => {
    it('парсит одну строку с корректными данными', async () => {
      const rows = [
        ['Квартира 1', '01.01.2025', '05.01.2025', 'Иван +7 999 123-45-67', '', '2', '5000', 'avito'],
      ];
      const file = toFile(buildXlsxBuffer(rows), 'ok.xlsx');
      const result = await parseExcelFile(file);
      expect(result.errors).toHaveLength(0);
      expect(result.bookings).toHaveLength(1);
      expect(result.bookings[0].property_name).toBe('Квартира 1');
      expect(result.bookings[0].start_date).toBe('2025-01-01');
      expect(result.bookings[0].end_date).toBe('2025-01-05');
      expect(result.bookings[0].guest_name).toBe('Иван');
      expect(result.bookings[0].guest_phone).toBe('+79991234567');
      expect(result.bookings[0].channel).toBe('avito');
      expect(result.totalRows).toBe(1);
    });

    it('неверные колонки: пустая строка данных пропускается', async () => {
      const rows = [
        ['Квартира 1', '01.01.2025', '05.01.2025', 'Гость +79001234567', '', '1', '0', 'manual'],
        ['', '', '', '', '', '', '', ''],
      ];
      const file = toFile(buildXlsxBuffer(rows), 'skip-empty.xlsx');
      const result = await parseExcelFile(file);
      expect(result.bookings).toHaveLength(1);
      expect(result.totalRows).toBe(2);
    });
  });

  describe('битые файлы', () => {
    it('reject при не-XLSX содержимом', async () => {
      const file = toFile(new Uint8Array([1, 2, 3, 4, 5]), 'bad.xlsx');
      await expect(parseExcelFile(file)).rejects.toThrow();
    });

    it('reject при только заголовке без данных', async () => {
      const sheet = XLSX.utils.aoa_to_sheet([HEADERS]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
      const file = toFile(buf, 'headers-only.xlsx');
      await expect(parseExcelFile(file)).rejects.toThrow('хотя бы одну строку данных');
    });
  });

  describe('невалидные данные в строках', () => {
    it('ошибки при неверном формате даты заезда', async () => {
      const rows = [
        ['Объект', 'не-дата', '05.01.2025', 'Гость +79001234567', '', '1', '0', 'manual'],
      ];
      const file = toFile(buildXlsxBuffer(rows), 'bad-date.xlsx');
      const result = await parseExcelFile(file);
      expect(result.bookings).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('даты заезда'))).toBe(true);
    });

    it('ошибка когда выезд раньше заезда', async () => {
      const rows = [
        ['Квартира', '05.01.2025', '01.01.2025', 'Гость +79001234567', '', '1', '0', 'manual'],
      ];
      const file = toFile(buildXlsxBuffer(rows), 'wrong-order.xlsx');
      const result = await parseExcelFile(file);
      expect(result.bookings).toHaveLength(0);
      expect(result.errors.some((e) => e.message.includes('выезда') || e.message.includes('заезда'))).toBe(true);
    });
  });

  describe('большие объёмы', () => {
    it('парсит много строк без падения', async () => {
      const rows = Array.from({ length: 50 }, (_, i) => [
        `Объект ${i + 1}`,
        '01.01.2025',
        '03.01.2025',
        `Гость ${i} +7 999 ${String(i).padStart(3, '0')}-00-00`,
        '',
        '1',
        '1000',
        'manual',
      ]);
      const file = toFile(buildXlsxBuffer(rows), 'large.xlsx');
      const result = await parseExcelFile(file);
      expect(result.bookings).toHaveLength(50);
      expect(result.totalRows).toBe(50);
      expect(result.bookings[0].rowIndex).toBe(2);
      expect(result.bookings[49].rowIndex).toBe(51);
    });
  });
});
