import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function AvitoCallbackPage() {
  const [messengerSuccessModalOpen, setMessengerSuccessModalOpen] = useState(false);
  const [noAvitoIntegrationDialogOpen, setNoAvitoIntegrationDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    const code = params.get('code');
    const state = params.get('state');
    const isPopup = typeof window !== 'undefined' && !!window.opener;

    // Check if this is messenger_auth flow
    let isMessengerAuth = false;
    if (state) {
      try {
        const stateData = JSON.parse(atob(state));
        isMessengerAuth = stateData?.type === 'messenger_auth';
      } catch {
        // Ignore parse errors
      }
    }

    if (isPopup) {
      if (error) {
        window.opener?.postMessage(
          { type: 'avito-oauth-result', success: false, error, error_description: errorDescription || 'Неизвестная ошибка' },
          window.location.origin
        );
      } else if (code && state) {
        window.opener?.postMessage(
          { type: 'avito-oauth-result', success: true, code, state, isMessengerAuth },
          window.location.origin
        );
      }
      window.close();
      return;
    }

    // Полный редирект в той же вкладке
    if (error) {
      const errorData = {
        error,
        error_description: errorDescription || 'Неизвестная ошибка',
      };
      localStorage.setItem('avito_oauth_error', JSON.stringify(errorData));
      window.history.replaceState({}, '', '/');
      return;
    }

    if (code && state) {
      if (isMessengerAuth) {
        (async () => {
          const { supabase } = await import('../lib/supabase');
          const redirectUri = import.meta.env.VITE_AVITO_REDIRECT_URI || 'https://app.roomi.pro/auth/avito-callback';
          const { data, error: fnError } = await supabase.functions.invoke('avito-oauth-callback', {
            body: { code, state, redirect_uri: redirectUri },
          });
          if (!fnError && data?.success) {
            setMessengerSuccessModalOpen(true);
          } else if ((data as { reason?: string })?.reason === 'no_avito_integration') {
            setNoAvitoIntegrationDialogOpen(true);
          } else {
            const errorMsg = fnError?.message || (data as { error?: string })?.error || 'Ошибка подключения';
            localStorage.setItem('avito_oauth_error', JSON.stringify({ error: errorMsg }));
            window.history.replaceState({}, '', '/');
          }
        })();
      } else {
        const successData = { code, state };
        localStorage.setItem('avito_oauth_success', JSON.stringify(successData));
        window.history.replaceState({}, '', '/');
      }
    }
  }, []);

  const handleMessengerSuccessClose = () => {
    setMessengerSuccessModalOpen(false);
    navigate('/', { replace: true, state: { openMessages: true } });
  };

  const handleNoAvitoIntegrationClose = () => {
    setNoAvitoIntegrationDialogOpen(false);
    navigate('/', { replace: true, state: { openProperties: true } });
  };

  if (noAvitoIntegrationDialogOpen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md">
        <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
          <h2 className="text-lg font-semibold mb-2">{t('messages.noAvitoIntegration.title')}</h2>
          <p className="text-muted-foreground mb-4">{t('messages.noAvitoIntegration.description')}</p>
          <button
            onClick={handleNoAvitoIntegrationClose}
            className="w-full bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90"
          >
            {t('messages.noAvitoIntegration.connectButton')}
          </button>
        </div>
      </div>
    );
  }

  if (messengerSuccessModalOpen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md">
        <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
          <h2 className="text-lg font-semibold mb-2">{t('messages.messengerSuccess.title')}</h2>
          <p className="text-muted-foreground mb-4">{t('messages.messengerSuccess.description')}</p>
          <button
            onClick={handleMessengerSuccessClose}
            className="w-full bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90"
          >
            {t('common.ok', { defaultValue: 'Ок' })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Обработка авторизации Avito...</p>
      </div>
    </div>
  );
}
