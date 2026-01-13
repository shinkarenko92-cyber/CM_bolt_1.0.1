import { useEffect } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';

function AppContent() {
  const { user, loading } = useAuth();

  // Handle Avito OAuth callback
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/74454fc7-45ce-477d-906c-20f245bc9847',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:13',message:'OAuth callback check started',data:{pathname:window.location.pathname,search:window.location.search},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname;

    if (path === '/auth/avito-callback') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/74454fc7-45ce-477d-906c-20f245bc9847',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:18',message:'OAuth callback detected',data:{path,hasCode:!!params.get('code'),hasError:!!params.get('error')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      console.log('App: OAuth callback detected', { path, search: window.location.search });
      
      const error = params.get('error');
      const errorDescription = params.get('error_description');
      const code = params.get('code');
      const state = params.get('state');

      console.log('App: OAuth callback parameters', {
        hasError: !!error,
        hasCode: !!code,
        hasState: !!state,
        error,
        errorDescription
      });

      if (error) {
        // Store error for modal to display
        const errorData = {
          error,
          error_description: errorDescription || 'Неизвестная ошибка',
        };
        console.log('App: Storing OAuth error in localStorage', errorData);
        localStorage.setItem('avito_oauth_error', JSON.stringify(errorData));
      } else if (code && state) {
        // Store success for modal to process
        const successData = { code, state };
        console.log('App: Storing OAuth success in localStorage', {
          hasCode: !!code,
          hasState: !!state,
          codeLength: code.length,
          stateLength: state.length
        });
        localStorage.setItem('avito_oauth_success', JSON.stringify(successData));
      } else {
        console.warn('App: OAuth callback missing required parameters', {
          hasCode: !!code,
          hasState: !!state,
          hasError: !!error
        });
      }

      // Clean URL and redirect to home
      console.log('App: Cleaning URL and redirecting to home');
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
