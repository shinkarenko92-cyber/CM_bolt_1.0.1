import { useEffect } from 'react';
import { ConfigProvider } from 'antd';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';

function AppContent() {
  const { user, loading } = useAuth();

  // Handle Avito OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname;

    if (path === '/auth/avito-callback') {
      const error = params.get('error');
      const errorDescription = params.get('error_description');
      const code = params.get('code');
      const state = params.get('state');

      if (error) {
        // Store error for modal to display
        localStorage.setItem(
          'avito_oauth_error',
          JSON.stringify({
            error,
            error_description: errorDescription || 'Неизвестная ошибка',
          })
        );
      } else if (code && state) {
        // Store success for modal to process
        localStorage.setItem('avito_oauth_success', JSON.stringify({ code, state }));
      }

      // Clean URL and redirect to home
      window.history.replaceState({}, '', '/');
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return user ? <Dashboard /> : <Auth />;
}

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#14b8a6', // teal-600
          colorBgBase: '#1e293b', // slate-800
          colorText: '#f1f5f9', // slate-100
        },
        algorithm: undefined, // Use default algorithm (dark mode handled by CSS)
      }}
    >
      <AuthProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;
