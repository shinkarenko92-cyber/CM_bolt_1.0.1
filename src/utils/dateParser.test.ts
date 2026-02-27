import { describe, it, expect } from 'vitest';
import { parseDate } from './dateParser';

describe('dateParser', () => {
  describe('валидные форматы DD.MM.YYYY (Avito)', () => {
    it('парсит стандартную дату', () => {
      expect(parseDate('15.03.2025')).toBe('2025-03-15');
    });

    it('парсит с ведущими нулями', () => {
      expect(parseDate('01.01.2025')).toBe('2025-01-01');
      expect(parseDate('09.09.2030')).toBe('2030-09-09');
    });

    it('убирает пробелы по краям', () => {
      expect(parseDate('  25.12.2025  ')).toBe('2025-12-25');
    });

    it('границы года 2000 и 2100', () => {
      expect(parseDate('01.01.2000')).toBe('2000-01-01');
      expect(parseDate('31.12.2100')).toBe('2100-12-31');
    });
  });

  describe('невалидные значения', () => {
    it('возвращает null для пустой строки', () => {
      expect(parseDate('')).toBeNull();
      expect(parseDate('   ')).toBeNull();
    });

    it('возвращает null для не-строки', () => {
      expect(parseDate(null as unknown as string)).toBeNull();
      expect(parseDate(undefined as unknown as string)).toBeNull();
    });

    it('возвращает null при неверном количестве частей', () => {
      expect(parseDate('15.03')).toBeNull();
      expect(parseDate('15.03.2025.01')).toBeNull();
      expect(parseDate('15-03-2025')).toBeNull();
    });

    it('возвращает null при нечисловых частях', () => {
      expect(parseDate('ab.03.2025')).toBeNull();
      expect(parseDate('15.xx.2025')).toBeNull();
      expect(parseDate('15.03.год')).toBeNull();
    });

    it('возвращает null при невалидной дате', () => {
      expect(parseDate('32.01.2025')).toBeNull();
      expect(parseDate('31.02.2025')).toBeNull();
      expect(parseDate('00.01.2025')).toBeNull();
      expect(parseDate('15.00.2025')).toBeNull();
      expect(parseDate('15.13.2025')).toBeNull();
    });

    it('возвращает null при году вне диапазона', () => {
      expect(parseDate('01.01.1999')).toBeNull();
      expect(parseDate('01.01.2101')).toBeNull();
    });
  });

  describe('формат даты (без timezone)', () => {
    it('возвращает только дату YYYY-MM-DD без времени', () => {
      const result = parseDate('20.06.2025');
      expect(result).toBe('2025-06-20');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
