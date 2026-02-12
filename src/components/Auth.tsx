import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LanguageSelector } from './LanguageSelector';
import { ThemeToggle } from './ThemeToggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { cn } from '@/lib/utils';

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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  useEffect(() => {
    if (location.state?.fromSignup) {
      setSuccess('Проверьте почту — на неё пришло письмо для подтверждения.');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.fromSignup, location.pathname, navigate]);

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
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
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

      <Card className={cn('relative w-full max-w-md glass-card border-border shadow-2xl transition-transform duration-300 hover:scale-[1.01] text-foreground')}>
        <CardHeader className="space-y-2 text-center pb-4">
          <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Roomi</CardTitle>
          <CardDescription className="text-foreground/90">
            {isForgotPassword ? t('auth.resetPassword') : showSignUpToggle && isSignUp ? t('auth.createAccount') : t('auth.signIn')}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-foreground">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="h-11"
              />
            </div>

            {!isForgotPassword && (
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="h-11"
                />
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

            <Button type="submit" disabled={loading} className="w-full h-11 font-medium transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]">
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
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(true);
                  setError('');
                  setSuccess('');
                }}
                className="block w-full text-sm text-primary hover:underline"
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
                className="text-sm text-primary hover:underline"
              >
                {isForgotPassword ? t('auth.backToSignIn') : isSignUp ? t('auth.alreadyHaveAccount') : t('auth.noAccount')}
              </button>
            ) : (
              <Link to="/signup" className="text-sm text-primary hover:underline block">
                {t('auth.noAccount')}
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
