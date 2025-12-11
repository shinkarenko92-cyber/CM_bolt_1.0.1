import { useEffect } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';

function AppContent() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();

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

function AppWithTheme() {
  const { theme } = useTheme();
  
  const antdThemeConfig = {
    token: {
      colorPrimary: '#14b8a6', // teal-600
      colorBgBase: theme === 'light' ? '#ffffff' : '#1e293b', // white for light, slate-800 for dark
      colorText: theme === 'light' ? '#111827' : '#f1f5f9', // gray-900 for light, slate-100 for dark
      colorBgContainer: theme === 'light' ? '#f8fafc' : '#1e293b', // slate-50 for light, slate-800 for dark
      colorBorder: theme === 'light' ? '#e2e8f0' : '#475569', // gray-200 for light, slate-600 for dark
    },
    algorithm: theme === 'light' ? antdTheme.defaultAlgorithm : antdTheme.darkAlgorithm,
  };

  return (
    <ConfigProvider theme={antdThemeConfig}>
      <AppContent />
    </ConfigProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppWithTheme />
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
