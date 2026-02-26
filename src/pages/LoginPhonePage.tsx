import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Phone, MessageCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LanguageSelector } from '../components/LanguageSelector';
import { ThemeToggle } from '../components/ThemeToggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

type Channel = 'telegram' | 'whatsapp';

export function LoginPhonePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<Channel>('telegram');
  const [telegramId, setTelegramId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  const normalizePhone = (raw: string) =>
    raw.trim().replace(/[\s\-()]/g, '').replace(/^\+7/, '7').replace(/^8/, '7');

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const normalized = normalizePhone(phone);
      if (normalized.length < 10) {
        setError(t('auth.phoneInvalid', { defaultValue: 'Введите корректный номер телефона' }));
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-login-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalized,
          channel,
          ...(channel === 'telegram' && telegramId ? { telegram_id: telegramId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || t('errors.somethingWentWrong'));
        return;
      }
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const normalized = normalizePhone(phone);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-login-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized, code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || t('errors.somethingWentWrong'));
        return;
      }
      const tokenHash = data.token_hash;
      if (!tokenHash) {
        setError(t('errors.somethingWentWrong'));
        return;
      }
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink',
      });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      navigate('/', { replace: true });
    } catch (err) {
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
              {step === 'phone'
                ? t('auth.loginByPhone', { defaultValue: 'Вход по телефону' })
                : t('auth.enterCode', { defaultValue: 'Введите код из сообщения' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-foreground">
            {step === 'phone' ? (
              <form onSubmit={handleSendCode} className="space-y-5" noValidate>
                <div>
                  <Label htmlFor="phone" className="mb-2 block text-slate-700 dark:text-slate-300">
                    {t('auth.phone', { defaultValue: 'Номер телефона' })}
                  </Label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      autoComplete="tel"
                      placeholder="+7 900 123-45-67"
                      className="h-12 pl-10 bg-slate-50 border-slate-200 text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block text-slate-700 dark:text-slate-300">
                    {t('auth.codeVia', { defaultValue: 'Код в' })}
                  </Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setChannel('telegram')}
                      className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        channel === 'telegram'
                          ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                          : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <MessageCircle className="h-4 w-4" />
                      Telegram
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel('whatsapp')}
                      className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        channel === 'whatsapp'
                          ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400'
                          : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      WhatsApp
                    </button>
                  </div>
                </div>
                {channel === 'telegram' && (
                  <div>
                    <Label htmlFor="telegram_id" className="mb-2 block text-slate-700 dark:text-slate-300 text-sm">
                      {t('auth.telegramIdOptional', { defaultValue: 'Telegram ID (если известен, для доставки кода)' })}
                    </Label>
                    <Input
                      id="telegram_id"
                      type="text"
                      value={telegramId}
                      onChange={(e) => setTelegramId(e.target.value)}
                      placeholder="123456789"
                      className="h-11 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                )}
                {error && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <Button type="submit" disabled={loading} className="w-full h-12">
                  {loading ? t('common.loading') : t('auth.getCode', { defaultValue: 'Получить код' })}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-5" noValidate>
                <div>
                  <Label htmlFor="code" className="mb-2 block text-slate-700 dark:text-slate-300">
                    {t('auth.code', { defaultValue: 'Код' })}
                  </Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    required
                    placeholder="000000"
                    className="h-12 text-center text-lg tracking-widest bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                {error && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <Button type="submit" disabled={loading || code.length < 4} className="w-full h-12">
                  {loading ? t('common.loading') : t('auth.signIn')}
                </Button>
                <button
                  type="button"
                  onClick={() => { setStep('phone'); setError(''); setCode(''); }}
                  className="w-full text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400"
                >
                  {t('auth.changePhone', { defaultValue: 'Изменить номер' })}
                </button>
              </form>
            )}

            <div className="mt-6 text-center">
              <Link to="/login" className="text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400 underline">
                {t('auth.loginByEmail', { defaultValue: 'Войти по email' })}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
