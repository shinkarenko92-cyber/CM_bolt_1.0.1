/**
 * Backward-compatible re-export from Zustand themeStore.
 * ThemeProvider loads theme on mount; state lives in Zustand.
 */
import { useEffect, type ReactNode } from 'react';
import { useThemeStore, useTheme } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';

export { useTheme };

export function ThemeProvider({ children }: { children: ReactNode }) {
  const loadTheme = useThemeStore((s) => s.loadTheme);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadTheme();
  }, [loadTheme, user]);

  return <>{children}</>;
}
