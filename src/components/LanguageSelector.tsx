import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

export function LanguageSelector() {
  const { i18n } = useTranslation();

  const languages = [
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
  ];

  const currentLanguage = languages.find(l => l.code === i18n.language) || languages[0];

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    localStorage.setItem('language', langCode);
  };

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-2 px-3 py-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-300 hover:text-white"
        title={currentLanguage.label}
      >
        <Globe className="w-4 h-4" />
        <span className="text-sm hidden sm:inline">{currentLanguage.flag}</span>
      </button>
      
      <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[140px]">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
              i18n.language === lang.code
                ? 'bg-teal-600 text-white'
                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <span>{lang.flag}</span>
            <span>{lang.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

