import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';

const STORAGE_KEY = 'cookie_consent';

export function CookieConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: true, date: new Date().toISOString() }));
    } catch {
      // ignore
    }
    setVisible(false);
  };

  const handleDecline = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: false, date: new Date().toISOString() }));
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-3 shadow-lg">
      <div className="container mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('cookieConsent.text', {
            defaultValue: 'Мы используем cookies для работы сессий и аналитики. Продолжая, вы соглашаетесь с использованием cookies.',
          })}{' '}
          <Link to="/privacy" className="underline hover:text-foreground">
            {t('cookieConsent.policy', { defaultValue: 'Политика конфиденциальности' })}
          </Link>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleDecline}>
            {t('cookieConsent.decline', { defaultValue: 'Отклонить' })}
          </Button>
          <Button size="sm" onClick={handleAccept}>
            {t('cookieConsent.accept', { defaultValue: 'Принять' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
