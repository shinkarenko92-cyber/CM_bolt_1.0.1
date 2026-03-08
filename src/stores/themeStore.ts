import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
}

interface ThemeActions {
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  loadTheme: () => Promise<void>;
}

type ThemeStore = ThemeState & ThemeActions;

const THEME_STORAGE_KEY = 'app_theme';

function getInitialTheme(): Theme {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (saved === 'light' || saved === 'dark') return saved;
  }
  return 'dark';
}

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: getInitialTheme(),

  setTheme: (newTheme: Theme) => {
    set({ theme: newTheme });
    applyTheme(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);

    const user = useAuthStore.getState().user;
    if (user) {
      supabase
        .from('profiles')
        .update({ theme: newTheme })
        .eq('id', user.id)
        .then(({ error }) => {
          if (error) console.error('Error saving theme to database:', error);
        });
    }
  },

  toggleTheme: () => {
    const { theme, setTheme } = get();
    setTheme(theme === 'dark' ? 'light' : 'dark');
  },

  loadTheme: async () => {
    const user = useAuthStore.getState().user;
    if (!user) {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (saved === 'light' || saved === 'dark') {
        set({ theme: saved });
        applyTheme(saved);
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
        set({ theme: dbTheme });
        applyTheme(dbTheme);
        localStorage.setItem(THEME_STORAGE_KEY, dbTheme);
      } else {
        const defaultTheme: Theme = 'light';
        set({ theme: defaultTheme });
        applyTheme(defaultTheme);
        localStorage.setItem(THEME_STORAGE_KEY, defaultTheme);
        try {
          await supabase.from('profiles').update({ theme: defaultTheme }).eq('id', user.id);
        } catch (e) {
          console.warn('Could not save default theme to profile:', e);
        }
      }
    } catch (error) {
      console.error('Error loading theme:', error);
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (saved === 'light' || saved === 'dark') {
        set({ theme: saved });
        applyTheme(saved);
      }
    }
  },
}));

// Apply theme on module load
applyTheme(getInitialTheme());

export function useTheme() {
  return useThemeStore();
}
