import { describe, it, expect } from 'vitest';
import { parseGuestContacts } from './guestParser';

describe('guestParser', () => {
  describe('нормальные контакты', () => {
    it('извлекает имя и телефон из строки', () => {
      const r = parseGuestContacts('Иван Петров +7 999 123-45-67');
      expect(r.name).toBe('Иван Петров');
      expect(r.phone).toBe('+79991234567');
    });

    it('нормализует 8 в +7', () => {
      const r = parseGuestContacts('Анна 8 916 000-11-22');
      expect(r.phone).toBe('+79160001122');
    });

    it('нормализует 7 без плюса', () => {
      const r = parseGuestContacts('Мария 7 903 111-22-33');
      expect(r.phone).toBe('+79031112233');
    });
  });

  describe('пустые и невалидные поля', () => {
    it('возвращает Гость и null при null/undefined', () => {
      expect(parseGuestContacts(null)).toEqual({ name: 'Гость', phone: null });
      expect(parseGuestContacts(undefined)).toEqual({ name: 'Гость', phone: null });
    });

    it('возвращает Гость при пустой строке', () => {
      expect(parseGuestContacts('')).toEqual({ name: 'Гость', phone: null });
      expect(parseGuestContacts('   ')).toEqual({ name: 'Гость', phone: null });
    });

    it('если нет телефона — вся строка как имя', () => {
      const r = parseGuestContacts('Только имя без номера');
      expect(r.name).toBe('Только имя без номера');
      expect(r.phone).toBeNull();
    });

    it('пустое имя при наличии только телефона', () => {
      const r = parseGuestContacts('+7 999 123-45-67');
      expect(r.name).toBe('Гость');
      expect(r.phone).toBe('+79991234567');
    });
  });

  describe('спецсимволы и дубликаты в именах', () => {
    it('сохраняет спецсимволы в имени', () => {
      const r = parseGuestContacts('О\'Брайен-Смит +7 999 111-22-33');
      expect(r.name).toContain('О\'Брайен-Смит');
      expect(r.phone).toBe('+79991112233');
    });

    it('имя с запятыми и точками', () => {
      const r = parseGuestContacts('Иванов, И.И. +79031234567');
      expect(r.name).toBe('Иванов, И.И.');
      expect(r.phone).toBe('+79031234567');
    });

    it('не создаёт дубликат имени при нескольких пробелах', () => {
      const r = parseGuestContacts('  Иван   Петров   +7 999 123-45-67');
      expect(r.name.trim()).toBe('Иван   Петров');
      expect(r.phone).toBe('+79991234567');
    });
  });

  describe('разные форматы телефона', () => {
    it('принимает скобки и дефисы', () => {
      const r = parseGuestContacts('Тест +7 (999) 123-45-67');
      expect(r.phone).toBe('+79991234567');
    });

    it('принимает пробелы в номере', () => {
      const r = parseGuestContacts('Гость 7 999 123 45 67');
      expect(r.phone).toBe('+79991234567');
    });
  });
});
