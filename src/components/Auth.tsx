import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LanguageSelector } from './LanguageSelector';

export function Auth() {
  const { t } = useTranslation();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isForgotPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSuccess(t('auth.passwordResetSent'));
        setEmail('');
      } else if (isSignUp) {
        const { data, error } = await signUp(email, password);
        if (error) throw error;

        if (data?.user?.id) {
          await new Promise(resolve => setTimeout(resolve, 1500));

          try {
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData?.session?.access_token;
            
            const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/seed-test-data`;
            await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
              },
              body: JSON.stringify({ userId: data.user.id }),
            });
          } catch (seedErr) {
            console.error('Error seeding test data:', seedErr);
          }
        }
      } else {
        await signIn(email, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageSelector />
      </div>
      <div className="bg-slate-800 rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Roomi Pro</h1>
          <p className="text-slate-400">
            {isForgotPassword ? t('auth.resetPassword') : isSignUp ? t('auth.createAccount') : t('auth.signIn')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
              {t('auth.email')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="you@example.com"
            />
          </div>

          {!isForgotPassword && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                {t('auth.password')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="••••••••"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500 text-green-400 px-4 py-2 rounded-lg text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('common.loading') : isForgotPassword ? t('auth.resetPassword') : isSignUp ? t('auth.signUp') : t('auth.signIn')}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          {!isForgotPassword && !isSignUp && (
            <button
              onClick={() => {
                setIsForgotPassword(true);
                setError('');
                setSuccess('');
              }}
              className="block w-full text-teal-400 hover:text-teal-300 text-sm"
            >
              {t('auth.forgotPassword')}
            </button>
          )}

          <button
            onClick={() => {
              if (isForgotPassword) {
                setIsForgotPassword(false);
              } else {
                setIsSignUp(!isSignUp);
              }
              setError('');
              setSuccess('');
            }}
            className="text-teal-400 hover:text-teal-300 text-sm"
          >
            {isForgotPassword ? t('auth.backToSignIn') : isSignUp ? t('auth.alreadyHaveAccount') : t('auth.noAccount')}
          </button>
        </div>
      </div>
    </div>
  );
}
