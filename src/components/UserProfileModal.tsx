import { useState, useEffect } from 'react';
import { X, CreditCard, CheckCircle, XCircle, Sun, Moon, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Profile, supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';

type UserProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
};

export function UserProfileModal({ isOpen, onClose, profile }: UserProfileModalProps) {
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const { refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setEmail(profile.email ?? '');
    }
  }, [profile]);

  if (!isOpen || !profile) return null;

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    try {
      localStorage.setItem('language', langCode);
    } catch {
      // ignore
    }
  };

  const handleSaveProfile = async () => {
    if (!profile?.id) return;
    setSaving(true);
    try {
      const updates: { full_name?: string; email?: string } = {};
      if (fullName.trim() !== (profile.full_name ?? '')) updates.full_name = fullName.trim() || undefined;
      if (email.trim() !== (profile.email ?? '')) updates.email = email.trim() || undefined;

      if (Object.keys(updates).length === 0) {
        setSaving(false);
        return;
      }

      if (updates.email !== undefined) {
        const { error: authError } = await supabase.auth.updateUser({ email: updates.email });
        if (authError) {
          toast.error(authError.message || t('settings.profileUpdateError', { defaultValue: 'Ошибка обновления email' }));
          setSaving(false);
          return;
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id);

      if (error) {
        toast.error(error.message || t('errors.somethingWentWrong'));
        setSaving(false);
        return;
      }

      await refreshProfile();
      toast.success(t('settings.profileUpdated', { defaultValue: 'Профиль обновлён' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.somethingWentWrong'));
    } finally {
      setSaving(false);
    }
  };

  const isPaid = !['free', 'basic', 'trial'].includes(profile.subscription_tier);
  const isExpired = profile.subscription_expires_at
    ? new Date(profile.subscription_expires_at) < new Date()
    : false;

  const tierLabels: Record<string, string> = {
    free: 'Free',
    basic: 'Basic',
    trial: 'Триал',
    start: 'Start',
    starter: 'Start',
    pro: 'Pro',
    business: 'Business',
    premium: 'Premium',
    enterprise: 'Enterprise',
  };

  const PAYMENT_CONTACT_EMAIL = 'support@roomi.pro';
  const paymentSubject = encodeURIComponent('Запрос на оплату по счёту — Roomi Pro');
  const paymentMailto = `mailto:${PAYMENT_CONTACT_EMAIL}?subject=${paymentSubject}`;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">My Profile</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <Label className="text-slate-300">
              {t('settings.language', { defaultValue: 'Язык' })}
            </Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleLanguageChange('ru')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  i18n.language === 'ru' ? 'bg-teal-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Globe className="w-4 h-4" />
                Русский
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  i18n.language === 'en' ? 'bg-teal-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Globe className="w-4 h-4" />
                English
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-full-name" className="text-slate-300">
              {t('settings.fullName', { defaultValue: 'ФИО' })}
            </Label>
            <Input
              id="profile-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('settings.fullNamePlaceholder', { defaultValue: 'Введите имя' })}
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-email" className="text-slate-300">
              Email
            </Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
            />
          </div>

          <Button
            onClick={handleSaveProfile}
            disabled={saving}
            className="w-full bg-teal-600 hover:bg-teal-700"
          >
            {saving ? t('common.loading', { defaultValue: 'Сохранение...' }) : t('common.save', { defaultValue: 'Сохранить' })}
          </Button>

          {profile.business_name && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Business Name
              </label>
              <div className="text-white font-medium">{profile.business_name}</div>
            </div>
          )}

          {profile.phone && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Phone
              </label>
              <div className="text-white font-medium">{profile.phone}</div>
            </div>
          )}

          <div className="border-t border-slate-700 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Subscription Tier
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">
                    {tierLabels[profile.subscription_tier] || profile.subscription_tier}
                  </span>
                  {isPaid && !isExpired ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-slate-500" />
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-400">Status</div>
                <div
                  className={`text-sm font-semibold ${
                    isPaid && !isExpired ? 'text-green-500' : 'text-slate-500'
                  }`}
                >
                  {isPaid && !isExpired ? 'Paid' : 'Unpaid'}
                </div>
              </div>
            </div>

            {profile.subscription_expires_at && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Subscription Expires
                </label>
                <div
                  className={`text-sm ${
                    isExpired ? 'text-red-400' : 'text-slate-300'
                  }`}
                >
                  {formatDate(profile.subscription_expires_at)}
                  {isExpired && ' (Expired)'}
                </div>
              </div>
            )}

            {(!isPaid || isExpired) && (
              <div className="space-y-2">
                <p className="text-sm text-slate-400">
                  Оплата по счёту: свяжитесь с нами для выставления счёта и подключения тарифа.
                </p>
                <a
                  href={paymentMailto}
                  className="w-full px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-5 h-5" />
                  Запросить счёт / Подключить тариф
                </a>
              </div>
            )}
          </div>

          <div className="border-t border-slate-700 pt-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Тема оформления
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleTheme}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  {theme === 'dark' ? (
                    <>
                      <Moon className="w-5 h-5 text-slate-300" />
                      <span className="text-white font-medium">Темная тема</span>
                    </>
                  ) : (
                    <>
                      <Sun className="w-5 h-5 text-yellow-400" />
                      <span className="text-white font-medium">Светлая тема</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-700 pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Account Status</span>
              <span
                className={`font-medium ${
                  profile.is_active ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {profile.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            {profile.role === 'admin' && (
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-slate-400">Role</span>
                <span className="font-medium text-teal-400">Administrator</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-900 rounded-b-lg border-t border-slate-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
