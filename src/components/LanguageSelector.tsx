import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const languages = [
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

export function LanguageSelector() {
  const { i18n, t } = useTranslation();

  const currentLanguage = languages.find((l) => l.code === i18n.language) || languages[0];

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    localStorage.setItem('language', langCode);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 md:h-10 md:w-10 rounded-full border border-slate-200 bg-white/80 text-slate-600 shadow-sm hover:bg-white hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white flex items-center justify-center gap-1.5 px-0 md:w-auto md:px-3"
          aria-label={t('settings.language')}
          title={currentLanguage.label}
        >
          <Globe className="h-4 w-4 md:h-5 md:w-5" />
          <span className="text-sm hidden md:inline-block font-medium">{currentLanguage.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[140px]">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`flex items-center gap-3 cursor-pointer ${
              i18n.language === lang.code ? 'bg-accent text-accent-foreground font-semibold' : ''
            }`}
          >
            <span className="text-base">{lang.flag}</span>
            <span className="font-medium">{lang.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
