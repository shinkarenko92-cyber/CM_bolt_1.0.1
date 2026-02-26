/**
 * Провайдер темы: light | dark, палитра из theme.ts, сохранение в AsyncStorage.
 */
import React, { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { themePalettes, type ThemeMode } from '../constants/theme';
import { ThemeContext } from './ThemeContextRef';

const THEME_STORAGE_KEY = 'roomi_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((s) => {
        if (s === 'light' || s === 'dark') setThemeState(s);
      })
      .catch(() => {});
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  }, []);

  const colors = themePalettes[theme];

  return (
    <ThemeContext.Provider value={{ theme, colors, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
