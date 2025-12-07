import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App.tsx';
import './i18n';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: '#1e293b',
          color: '#f1f5f9',
          border: '1px solid #334155',
        },
        success: {
          iconTheme: {
            primary: '#14b8a6',
            secondary: '#f1f5f9',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#f1f5f9',
          },
        },
      }}
    />
  </StrictMode>
);
