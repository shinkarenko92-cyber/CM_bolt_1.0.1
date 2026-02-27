import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { LanguageSelector } from '@/components/LanguageSelector';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type AuthProps = {
  showSignUpToggle?: boolean;
};

export function Auth({ showSignUpToggle = true }: AuthProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, signIn, signUp } = useAuth();

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
      return;
    }
    if (location.state?.fromSignup) {
      setSuccess(t('auth.verifyEmailNotice'));
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [user, location.state?.fromSignup, location.pathname, navigate, t]);

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
      } else if (showSignUpToggle && isSignUp) {
        const { data, error } = await signUp({ email, password });
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
                ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
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
      setError(err instanceof Error ? err.message : t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-slate-100 to-sky-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236366f1' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
        <ThemeToggle />
        <LanguageSelector />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 shadow-2xl dark:border-slate-700 dark:bg-slate-900/85">
          <CardHeader className="space-y-2 text-center pb-4">
            <CardTitle className="text-3xl font-bold tracking-tight text-primary">Roomi</CardTitle>
          <CardDescription className="text-sky-500/90">
            {isForgotPassword ? t('auth.resetPassword') : showSignUpToggle && isSignUp ? t('auth.createAccount') : t('auth.signIn')}
          </CardDescription>
          </CardHeader>
          <CardContent className="text-foreground">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <Label htmlFor="email" className="mb-2 block text-slate-700 dark:text-slate-300">
                  {t('auth.email')}
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="h-12 pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-500 hover:border-slate-300 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-0 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-500 dark:hover:border-slate-500"
                  />
                </div>
              </div>

              {!isForgotPassword && (
                <div>
                  <Label htmlFor="password" className="mb-2 block text-slate-700 dark:text-slate-300">
                    {t('auth.password')}
                  </Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="h-12 pl-10 pr-11 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-500 hover:border-slate-300 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-0 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-500 dark:hover:border-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                      aria-label="toggle-password"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-md border border-success/50 bg-success/10 px-3 py-2 text-sm text-success">
                  {success}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
              >
                {loading
                  ? t('common.loading')
                  : isForgotPassword
                    ? t('auth.resetPassword')
                    : showSignUpToggle && isSignUp
                      ? t('auth.signUp')
                      : t('auth.signIn')}
              </Button>
            </form>

            <div className="mt-6 text-center space-y-2">
              {!isForgotPassword && !(showSignUpToggle && isSignUp) && (
                <Link
                  to="/login-phone"
                  className="block w-full text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2 mb-2"
                >
                  {t('auth.loginByPhone', { defaultValue: 'Войти по телефону' })}
                </Link>
              )}
              {!isForgotPassword && !(showSignUpToggle && isSignUp) && (
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(true);
                    setError('');
                    setSuccess('');
                  }}
                  className="block w-full text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2"
                >
                  {t('auth.forgotPassword')}
                </button>
              )}

              {showSignUpToggle ? (
                <button
                  type="button"
                  onClick={() => {
                    if (isForgotPassword) {
                      setIsForgotPassword(false);
                    } else {
                      setIsSignUp(!isSignUp);
                    }
                    setError('');
                    setSuccess('');
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2"
                >
                  {isForgotPassword ? t('auth.backToSignIn') : isSignUp ? t('auth.alreadyHaveAccount') : t('auth.noAccount')}
                </button>
              ) : (
                <Link to="/signup" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2 block">
                  {t('auth.noAccount')}
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
