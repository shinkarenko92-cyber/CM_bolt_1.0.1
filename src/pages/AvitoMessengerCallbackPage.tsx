import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const MESSENGER_REDIRECT_URI = 'https://app.roomi.pro/auth/avito-callback-messenger';

export function AvitoMessengerCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setErrorMessage(errorDescription || error);
      setStatus('error');
      return;
    }
    if (!code || !state) {
      setErrorMessage('Missing code or state');
      setStatus('error');
      return;
    }

    (async () => {
      const { data, error } = await supabase.functions.invoke('avito-oauth-callback', {
        body: { code, state, redirect_uri: MESSENGER_REDIRECT_URI },
      });

      if (error) {
        setErrorMessage(error.message || 'Request failed');
        setStatus('error');
        return;
      }
      if (!data?.success) {
        setErrorMessage((data as { error?: string })?.error || 'Token exchange failed');
        setStatus('error');
        return;
      }
      setStatus('success');
      setSuccessModalOpen(true);
    })();
  }, [searchParams]);

  const handleCloseSuccess = () => {
    setSuccessModalOpen(false);
    navigate('/', { replace: true, state: { openMessages: true } });
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">{t('common.loading', { defaultValue: 'Загрузка...' })}</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold text-destructive mb-2">{t('messages.messengerCta.errorTitle', { defaultValue: 'Ошибка подключения' })}</h1>
          <p className="text-muted-foreground text-sm mb-4">{errorMessage}</p>
          <Button onClick={() => navigate('/', { replace: true })}>{t('common.back', { defaultValue: 'На главную' })}</Button>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={successModalOpen} onOpenChange={(open) => !open && handleCloseSuccess()}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={handleCloseSuccess}>
        <DialogHeader>
          <DialogTitle>{t('messages.messengerSuccess.title')}</DialogTitle>
          <DialogDescription>{t('messages.messengerSuccess.description')}</DialogDescription>
        </DialogHeader>
        <Button className="w-full" onClick={handleCloseSuccess}>
          {t('common.ok', { defaultValue: 'Ок' })}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
