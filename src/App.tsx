import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { Auth } from '@/components/Auth';
import { AuthLayout } from '@/components/AuthLayout';
import { Dashboard } from '@/components/Dashboard';
import { SignupForm } from '@/components/SignupForm';
import { YandexMetrika } from '@/components/YandexMetrika';
import BoltChat, { type PlanType } from '@/components/BoltChat';
import { isDemoExpired } from '@/utils/subscriptionLimits';
import { TermsPage } from '@/pages/TermsPage';
import { PrivacyPage } from '@/pages/PrivacyPage';
import { OnboardingImport } from '@/pages/OnboardingImport';
import { LoginPhonePage } from '@/pages/LoginPhonePage';
import { AvitoCallbackPage } from '@/pages/AvitoCallbackPage';
import { CookieConsentBanner } from '@/components/CookieConsentBanner';
import { AvitoErrorQueue } from '@/components/AvitoErrorQueue';
import { SyncLogProvider } from '@/contexts/SyncLogContext';
import { AvitoSyncErrorsHandler } from '@/components/AvitoSyncErrorsHandler';

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
    <SyncLogProvider>
      <Routes>
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/login" element={<AuthLayout><Auth showSignUpToggle={false} /></AuthLayout>} />
        <Route path="/login-phone" element={<AuthLayout><LoginPhonePage /></AuthLayout>} />
        <Route path="/signup" element={<AuthLayout><SignupForm /></AuthLayout>} />
        <Route path="/onboarding/import" element={<RequireAuth><OnboardingImport /></RequireAuth>} />
        <Route path="/auth/avito-callback" element={<AvitoCallbackPage />} />
        <Route path="/" element={<MainOrRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AvitoErrorQueue />
      <AvitoSyncErrorsHandler />
      <BoltChatWidget />
      <CookieConsentBanner />
    </SyncLogProvider>
  );
}

function BoltChatWidget() {
  const { user, profile } = useAuth();
  const [userToken, setUserToken] = useState<string | undefined>();

  useEffect(() => {
    if (!user) {
      setUserToken(undefined);
      return;
    }
    (async () => {
      const { data: { session } } = await import('./lib/supabase').then(m => m.supabase.auth.getSession());
      setUserToken(session?.access_token);
    })();
  }, [user]);

  const isDemoActive = (profile?.subscription_tier === 'demo' || profile?.subscription_tier === 'trial') && !isDemoExpired(profile);
  const plan: PlanType = isDemoActive
    ? 'pro'
    : (profile?.subscription_tier === 'pro' || profile?.subscription_tier === 'enterprise' || profile?.subscription_tier === 'business')
      ? profile.subscription_tier
      : 'free';

  return (
    <BoltChat
      userId={user?.id}
      userToken={userToken}
      plan={plan}
    />
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
