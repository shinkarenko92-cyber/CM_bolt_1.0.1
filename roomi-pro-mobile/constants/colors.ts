/**
 * Реэкспорт для обратной совместимости. Предпочтительно использовать useTheme().colors.
 * Эти значения — fallback для светлой темы (например, до монтирования ThemeProvider).
 */
import { lightTheme } from './theme';

export const colors = lightTheme;

/** Валюта по умолчанию. */
export const DEFAULT_CURRENCY = '₽';
