/**
 * Хук темы. Вынесен в отдельный файл для корректной работы Fast Refresh.
 */
import { useContext } from 'react';
import { ThemeContext } from './ThemeContextRef';

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
