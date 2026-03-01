import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, Mail, Phone, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { LanguageSelector } from '@/components/LanguageSelector';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const normalizePhone = (v: string) => v.replace(/[\s\-()]/g, '');

type SignupFields = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  termsAccepted: boolean;
};

export function SignupForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isValid },
  } = useForm<SignupFields>({
    mode: 'onChange',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      termsAccepted: false,
    },
  });

  const termsAccepted = watch('termsAccepted');

  const handleSignup = async (values: SignupFields) => {
    setSubmitError('');
    setLoading(true);
    const phoneNormalized = normalizePhone(values.phone);

    try {
      if (import.meta.env.DEV) console.log('Форма отправлена:', values);
      const { data, error } = await signUp({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: phoneNormalized || undefined,
      });
      if (import.meta.env.DEV) console.log('Supabase:', { data, error });

      if (error) {
        toast.error(error.message);
        setSubmitError(error.message);
        return;
      }

      if (data?.user && !data?.session) {
        setVerifyModalOpen(true);
        return;
      }

      if (data?.session) {
        toast.success(t('auth.signupSuccess'));
        navigate('/', { replace: true });
        return;
      }

      if (data?.user) {
        setVerifyModalOpen(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('errors.somethingWentWrong');
      toast.error(msg);
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyModalOk = () => {
    setVerifyModalOpen(false);
    navigate('/login', { replace: true, state: { fromSignup: true } });
  };

  return (
    <>
      <Dialog open={verifyModalOpen} onOpenChange={setVerifyModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('auth.verifyEmail', { defaultValue: 'Подтвердите email' })}</DialogTitle>
            <DialogDescription className="sr-only">{t('auth.verifyEmailNotice')}</DialogDescription>
          </DialogHeader>
          <p className="text-muted-foreground">{t('auth.verifyEmailNotice')}</p>
          <DialogFooter>
            <Button onClick={handleVerifyModalOk}>{t('common.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    <div className="min-h-screen w-full relative overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-slate-100 to-sky-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%236366f1\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
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
            <CardDescription className="text-sky-500/90">{t('auth.signUp')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(handleSignup)} noValidate className="space-y-5">
              <div>
                <Label htmlFor="firstName" className="mb-2 block text-slate-700 dark:text-slate-300">
                  {t('auth.firstName')}
                </Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    id="firstName"
                    autoComplete="given-name"
                    placeholder={t('auth.firstName')}
                    className={`h-12 pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-500 hover:border-slate-300 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-0 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-500 dark:hover:border-slate-500 ${errors.firstName ? 'border-destructive' : ''}`}
                    {...register('firstName', {
                      required: t('auth.enterFirstName'),
                      minLength: { value: 2, message: t('auth.minTwoChars') },
                    })}
                  />
                </div>
                {errors.firstName && <p className="mt-1 text-sm text-destructive">{errors.firstName.message}</p>}
              </div>

              <div>
                <Label htmlFor="lastName" className="mb-2 block text-slate-700 dark:text-slate-300">
                  {t('auth.lastName')}
                </Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    id="lastName"
                    autoComplete="family-name"
                    placeholder={t('auth.lastName')}
                    className={`h-12 pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-500 hover:border-slate-300 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-0 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-500 dark:hover:border-slate-500 ${errors.lastName ? 'border-destructive' : ''}`}
                    {...register('lastName', {
                      required: t('auth.enterLastName'),
                      minLength: { value: 2, message: t('auth.minTwoChars') },
                    })}
                  />
                </div>
                {errors.lastName && <p className="mt-1 text-sm text-destructive">{errors.lastName.message}</p>}
              </div>

              <div>
                <Label htmlFor="email" className="mb-2 block text-slate-700 dark:text-slate-300">
                  {t('auth.email')}
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={`h-12 pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-500 hover:border-slate-300 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-0 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-500 dark:hover:border-slate-500 ${errors.email ? 'border-destructive' : ''}`}
                    {...register('email', {
                      required: t('auth.enterEmail'),
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: t('errors.invalidEmail'),
                      },
                    })}
                  />
                </div>
                {errors.email && <p className="mt-1 text-sm text-destructive">{errors.email.message}</p>}
              </div>

              <div>
                <Label htmlFor="phone" className="mb-2 block text-slate-700 dark:text-slate-300">
                  {t('auth.phone')}
                </Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder={t('auth.phone')}
                    className={`h-12 pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-500 hover:border-slate-300 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-0 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-500 dark:hover:border-slate-500 ${errors.phone ? 'border-destructive' : ''}`}
                    {...register('phone', {
                      required: t('auth.enterPhone'),
                      minLength: { value: 9, message: t('auth.internationalPhoneFormat') },
                    })}
                  />
                </div>
                {errors.phone && <p className="mt-1 text-sm text-destructive">{errors.phone.message}</p>}
              </div>

              <div>
                <Label htmlFor="password" className="mb-2 block text-slate-700 dark:text-slate-300">
                  {t('auth.password')}
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={`h-12 pl-10 pr-11 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-500 hover:border-slate-300 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-0 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-500 dark:hover:border-slate-500 ${errors.password ? 'border-destructive' : ''}`}
                    {...register('password', {
                      required: t('auth.enterPassword'),
                      minLength: { value: 6, message: t('auth.passwordMinChars') },
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-sm text-destructive">{errors.password.message}</p>}
              </div>

              <div className="pt-1">
                <div className="flex items-start gap-3">
                  <Controller
                    name="termsAccepted"
                    control={control}
                    rules={{
                      validate: (value) => value || t('auth.requiredConsent'),
                    }}
                    render={({ field }) => (
                      <Checkbox
                        id="terms"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                        className={`${errors.termsAccepted ? 'border-destructive' : 'border-slate-400 dark:border-slate-500'} data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 mt-0.5`}
                      />
                    )}
                  />
                  <Label htmlFor="terms" className="cursor-pointer text-sm leading-5 text-slate-600 dark:text-slate-300 font-normal">
                    {t('auth.agreeWith')}{' '}
                    <Link
                      to="/terms"
                      className="text-blue-600 hover:text-blue-700 underline underline-offset-2 dark:text-blue-400 dark:hover:text-blue-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t('auth.termsOfUse')}
                    </Link>{' '}
                    {t('common.and')}{' '}
                    <Link
                      to="/privacy"
                      className="text-blue-600 hover:text-blue-700 underline underline-offset-2 dark:text-blue-400 dark:hover:text-blue-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t('auth.privacyPolicy')}
                    </Link>
                  </Label>
                </div>
                {errors.termsAccepted && <p className="mt-1 text-sm text-destructive">{errors.termsAccepted.message}</p>}
              </div>

              {submitError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {submitError}
                </div>
              )}

              <Button
                type="submit"
                disabled={!termsAccepted || !isValid || loading}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
              >
                {loading ? t('common.loading') : t('auth.signUp')}
              </Button>

              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                <Link to="/login" className="text-blue-600 hover:text-blue-700 font-semibold underline underline-offset-2 dark:text-blue-400 dark:hover:text-blue-300">
                  {t('auth.alreadyHaveAccount')}
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
}
