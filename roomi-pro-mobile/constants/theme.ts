/**
 * Палитры из design-html: light (background-light #f5f8f8) и dark (background-dark #0f2321).
 * primary #00bda4 общий для обеих тем.
 */
export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  primary: string;
  primaryMuted: string;
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  /** Бейджи, иконки в карточках */
  muted: string;
  /** Фон полей ввода, поиска */
  input: string;
  /** Progress bar track */
  progressTrack: string;
  /** Для таб-бара и header */
  tabBar: string;
};

export const lightTheme: ThemeColors = {
  primary: '#00bda4',
  primaryMuted: 'rgba(0,189,164,0.15)',
  background: '#f5f8f8',
  card: '#ffffff',
  text: '#0f172a',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  error: '#ef4444',
  success: '#10B981',
  warning: '#f59e0b',
  muted: '#94a3b8',
  input: '#f1f5f9',
  progressTrack: '#e2e8f0',
  tabBar: '#ffffff',
};

export const darkTheme: ThemeColors = {
  primary: '#00bda4',
  primaryMuted: 'rgba(0,189,164,0.2)',
  background: '#0f2321',
  card: '#1e293b',
  text: '#f8fafc',
  textSecondary: '#94a3b8',
  border: '#334155',
  error: '#ef4444',
  success: '#10B981',
  warning: '#f59e0b',
  muted: '#94a3b8',
  input: '#1e293b',
  progressTrack: '#334155',
  tabBar: '#0f2321',
};

export const themePalettes: Record<ThemeMode, ThemeColors> = {
  light: lightTheme,
  dark: darkTheme,
};
