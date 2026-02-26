/**
 * Определение контекста темы (вынесено для Fast Refresh).
 */
import { createContext } from 'react';
import type { ThemeColors, ThemeMode } from '../constants/theme';

export type ThemeContextType = {
  theme: ThemeMode;
  colors: ThemeColors;
  setTheme: (mode: ThemeMode) => void;
};

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
