import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Download, X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

function isInStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone);
}

const DISMISSED_KEY = 'pwa-install-dismissed';

export function InstallPWA() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      const val = localStorage.getItem(DISMISSED_KEY);
      if (!val) return false;
      const ts = parseInt(val, 10);
      return Date.now() - ts < 7 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isInStandaloneMode()) return;

    if (isIOS()) {
      setShowIOSBanner(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch { /* noop */ }
  };

  if (dismissed || isInStandaloneMode()) return null;
  if (!deferredPrompt && !showIOSBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-lg">
        {showIOSBanner ? (
          <Share className="h-6 w-6 shrink-0 text-primary" />
        ) : (
          <Download className="h-6 w-6 shrink-0 text-primary" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {t('pwa.installTitle', { defaultValue: 'Установить приложение' })}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {showIOSBanner
              ? t('pwa.iosInstruction', { defaultValue: 'Нажмите «Поделиться» → «На экран Домой»' })
              : t('pwa.installDescription', { defaultValue: 'Быстрый доступ к задачам с главного экрана' })}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          {!showIOSBanner && (
            <Button size="sm" onClick={handleInstall}>
              {t('pwa.install', { defaultValue: 'Установить' })}
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
