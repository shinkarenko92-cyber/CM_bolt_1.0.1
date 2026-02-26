import { X, CreditCard, CheckCircle, XCircle, Sun, Moon } from 'lucide-react';
import { Profile } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

type UserProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
};

export function UserProfileModal({ isOpen, onClose, profile }: UserProfileModalProps) {
  const { theme, toggleTheme } = useTheme();

  if (!isOpen || !profile) return null;

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
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Full Name
            </label>
            <div className="text-white font-medium">
              {profile.full_name || 'Not set'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Email
            </label>
            <div className="text-white font-medium">
              {profile.email || 'Not set'}
            </div>
          </div>

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
