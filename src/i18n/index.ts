import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from '@/i18n/locales/ru.json';
import en from '@/i18n/locales/en.json';

const savedLanguage = localStorage.getItem('language') || 'ru';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ru: { translation: ru },
      en: { translation: en },
    },
    lng: savedLanguage,
    fallbackLng: 'ru',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

