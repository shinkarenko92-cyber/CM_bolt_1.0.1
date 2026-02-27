import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'app_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
  // Initialize theme from localStorage or default to 'dark'
  const getInitialTheme = (): Theme => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
      }
    }
    return 'dark';
  };

  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Apply theme to document immediately on mount
  useEffect(() => {
    const initialTheme = getInitialTheme();
    document.documentElement.setAttribute('data-theme', initialTheme);
    setThemeState(initialTheme);
  }, []);

  const loadTheme = useCallback(async () => {
    if (!user) {
      // If no user, use localStorage theme
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setThemeState(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
      }
      return;
    }

    try {
      const { data } = await supabase
        .from('profiles')
        .select('theme')
        .eq('id', user.id)
        .maybeSingle();

      if (data?.theme) {
        const dbTheme = data.theme as Theme;
        setThemeState(dbTheme);
        document.documentElement.setAttribute('data-theme', dbTheme);
        // Sync localStorage with DB
        localStorage.setItem(THEME_STORAGE_KEY, dbTheme);
      } else {
        // If no theme in DB, use localStorage or default
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setThemeState(savedTheme);
          document.documentElement.setAttribute('data-theme', savedTheme);
        }
      }
    } catch (error) {
      console.error('Error loading theme:', error);
      // Fallback to localStorage on error
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setThemeState(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
      }
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
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // Save to localStorage immediately
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);

    // Save to database if user is logged in
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ theme: newTheme })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error saving theme to database:', error);
        // Theme is still saved in localStorage, so it will persist
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
