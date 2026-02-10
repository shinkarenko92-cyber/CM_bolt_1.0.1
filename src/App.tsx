import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { Auth } from './components/Auth';
import { AuthLayout } from './components/AuthLayout';
import { Dashboard } from './components/Dashboard';
import { SignupForm } from './components/SignupForm';
import { TermsPage } from './pages/TermsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { VerifyPhonePage } from './pages/VerifyPhonePage';

function AvitoCallbackHandler() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname;

    if (path === '/auth/avito-callback') {
      const error = params.get('error');
      const errorDescription = params.get('error_description');
      const code = params.get('code');
      const state = params.get('state');

      if (error) {
        const errorData = {
          error,
          error_description: errorDescription || 'Неизвестная ошибка',
        };
        localStorage.setItem('avito_oauth_error', JSON.stringify(errorData));
      } else if (code && state) {
        const successData = { code, state };
        localStorage.setItem('avito_oauth_success', JSON.stringify(successData));
      }

      window.history.replaceState({}, '', '/');
    }
  }, []);
  return null;
}

function MainOrRedirect() {
  const { user, profile, loading } = useAuth();
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

  if (profile?.phone && !profile?.phone_confirmed_at) {
    return <Navigate to="/verify-phone" replace />;
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
    <>
      <AvitoCallbackHandler />
      <Routes>
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/login" element={<AuthLayout><Auth showSignUpToggle={false} /></AuthLayout>} />
        <Route path="/signup" element={<AuthLayout><SignupForm /></AuthLayout>} />
        <Route path="/verify-phone" element={<RequireAuth><VerifyPhonePage /></RequireAuth>} />
        <Route path="/" element={<MainOrRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
          <AppWithTheme />
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
