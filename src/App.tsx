import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { Auth } from './components/Auth';
import { AuthLayout } from './components/AuthLayout';
import { Dashboard } from './components/Dashboard';
import { SignupForm } from './components/SignupForm';
import { YandexMetrika } from './components/YandexMetrika';
import { TermsPage } from './pages/TermsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { OnboardingImport } from './pages/OnboardingImport';

function AvitoCallbackHandler() {
  const [messengerSuccessModalOpen, setMessengerSuccessModalOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname;

    if (path === '/auth/avito-callback') {
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
        // Callback открыт во всплывающем окне — передаём результат в основное окно и закрываем popup
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
      } else if (code && state) {
        // For messenger_auth, process immediately and show success modal
        if (isMessengerAuth) {
          // Process messenger auth callback
          (async () => {
            const { supabase } = await import('./lib/supabase');
            const redirectUri = import.meta.env.VITE_AVITO_REDIRECT_URI || 'https://app.roomi.pro/auth/avito-callback';
            const { data, error: fnError } = await supabase.functions.invoke('avito-oauth-callback', {
              body: { code, state, redirect_uri: redirectUri },
            });
            if (!fnError && data?.success) {
              setMessengerSuccessModalOpen(true);
            } else {
              const errorMsg = fnError?.message || (data as { error?: string })?.error || 'Ошибка подключения';
              localStorage.setItem('avito_oauth_error', JSON.stringify({ error: errorMsg }));
              window.history.replaceState({}, '', '/');
            }
          })();
        } else {
          // Regular OAuth flow - save to localStorage
          const successData = { code, state };
          localStorage.setItem('avito_oauth_success', JSON.stringify(successData));
          window.history.replaceState({}, '', '/');
        }
      }
    }
  }, [navigate]);

  const handleMessengerSuccessClose = () => {
    setMessengerSuccessModalOpen(false);
    navigate('/', { replace: true, state: { openMessages: true } });
  };

  if (!messengerSuccessModalOpen) return null;

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

function MainOrRedirect() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Dashboard />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  return (
    <Routes>
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/login" element={<AuthLayout><Auth showSignUpToggle={false} /></AuthLayout>} />
        <Route path="/signup" element={<AuthLayout><SignupForm /></AuthLayout>} />
        <Route path="/onboarding/import" element={<RequireAuth><OnboardingImport /></RequireAuth>} />
        <Route path="/" element={<MainOrRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AvitoCallbackHandler />
    </>
  );
}

function AppWithTheme() {
  useTheme();
  return <AppContent />;
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <YandexMetrika />
          <AppWithTheme />
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
