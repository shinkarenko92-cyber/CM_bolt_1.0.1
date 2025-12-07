import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>('dark');

  const loadTheme = useCallback(async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('theme')
        .eq('id', user.id)
        .maybeSingle();

      if (data?.theme) {
        setThemeState(data.theme as Theme);
      }
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  }, [user]);

  useEffect(() => {
    loadTheme();
  }, [loadTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);

    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ theme: newTheme })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error saving theme:', error);
      }
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
