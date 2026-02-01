/**
 * Цвета приложения — в духе веб-версии Roomi Pro (тёмно-синий/белый/акцент).
 * Единый стиль кнопок: primary bg #3B82F6, radius 12, paddingV 14, bold.
 * backgroundDark/textDark — подготовка к тёмной теме.
 */
export const colors = {
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  background: '#FFFFFF',
  backgroundDark: '#1e3a5f',
  backgroundLight: '#F9FAFB',
  text: '#0f172a',
  textSecondary: '#64748b',
  textDark: '#e2e8f0',
  border: '#e2e8f0',
  error: '#ef4444',
  success: '#22c55e',
  successCalendar: '#10B981',
  arrivalGreen: '#10B981',
  departureBlue: '#3B82F6',
  stayLightBlue: '#7DD3FC',
  warning: '#f59e0b',
  warningCalendar: '#F59E0B',
  cancelled: '#EF4444',
  inactiveBadge: '#94a3b8',
  /** Фон ячеек Standard rate в таблице доступности. */
  rateCellBg: '#E0F2FE',
} as const;

/** Валюта по умолчанию для total left и цен (можно брать item.currency из брони). */
export const DEFAULT_CURRENCY = '₽';
