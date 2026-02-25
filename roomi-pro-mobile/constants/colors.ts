/**
 * Цвета приложения — макеты (designPrimary #00bda4) + тёмная тема.
 * primary = designPrimary для единого стиля с макетами.
 */
export const colors = {
  /** Основной акцент из макетов (teal Stitch). */
  primary: '#00bda4',
  designPrimary: '#00bda4',
  primaryDark: '#009b85',
  background: '#FFFFFF',
  backgroundDark: '#0f2321',
  backgroundLight: '#f5f8f8',
  text: '#0f172a',
  textSecondary: '#64748b',
  textDark: '#e2e8f0',
  border: '#e2e8f0',
  error: '#ef4444',
  success: '#10B981',
  successCalendar: '#10B981',
  arrivalGreen: '#10B981',
  departureBlue: '#3B82F6',
  stayLightBlue: '#7DD3FC',
  warning: '#f59e0b',
  warningCalendar: '#F59E0B',
  cancelled: '#EF4444',
  inactiveBadge: '#94a3b8',
  rateCellBg: '#E0F2FE',
  teal: '#00bda4',
  /** Светлая карточка в dark mode. */
  cardDark: '#1e293b',
  slate800: '#1e293b',
  slate100: '#f1f5f9',
} as const;

/** Валюта по умолчанию для total left и цен (можно брать item.currency из брони). */
export const DEFAULT_CURRENCY = '₽';
