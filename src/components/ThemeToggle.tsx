import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from './ui/button';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title={theme === 'dark' ? t('settings.lightTheme') : t('settings.darkTheme')}
      className="rounded-full border border-slate-200 bg-white/80 text-slate-600 shadow-sm hover:bg-white hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5 text-amber-500" />
      ) : (
        <Moon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
      )}
    </Button>
  );
}
