import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Download,
  Globe,
  FileSpreadsheet,
  FileText,
  Trash2,
  CreditCard,
  CheckCircle2,
  XCircle,
  Sun,
  Moon,
  Bell,
  BellOff,
  Lock,
  User,
} from 'lucide-react';
import { Booking, Property, supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { ConfirmModal } from '@/components/ConfirmModal';
import { TIER_OBJECT_RANGE, TIER_PRICE_RUB, getBookingLimit, getPropertyLimit, isDemoExpired } from '@/utils/subscriptionLimits';

type Tab = 'subscription' | 'appearance' | 'notifications' | 'export' | 'account';

interface SettingsViewProps {
  bookings: Booking[];
  properties: Property[];
}

export function SettingsView({ bookings, properties }: SettingsViewProps) {
  const { t, i18n } = useTranslation();
  const { deleteAccount, profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { permission: notifPermission, requestPermission, supported: notifSupported } = useNotificationPermission();

  const [activeTab, setActiveTab] = useState<Tab>('subscription');
  const [exportDateRange, setExportDateRange] = useState('all');
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [deleteNowModalOpen, setDeleteNowModalOpen] = useState(false);
  const [deleteNowLoading, setDeleteNowLoading] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const tier = profile?.subscription_tier ?? 'free';
  const tierPriceRub = TIER_PRICE_RUB[tier] ?? null;
  const tierRange = TIER_OBJECT_RANGE[tier] ?? '';
  const expiredDemo = profile ? isDemoExpired(profile) : false;
  const propertyLimit = getPropertyLimit(profile ?? null);
  const bookingLimit = getBookingLimit(profile ?? null);

  const tierLabels: Record<string, string> = {
    free: t('subscription.tiers.demo', { defaultValue: 'Demo 5 дней' }),
    basic: t('subscription.tiers.demo', { defaultValue: 'Demo 5 дней' }),
    demo: t('subscription.tiers.demo', { defaultValue: 'Demo 5 дней' }),
    trial: t('subscription.tiers.demo', { defaultValue: 'Demo 5 дней' }),
    start: t('subscription.tiers.standard', { defaultValue: 'Standard' }),
    starter: t('subscription.tiers.standard', { defaultValue: 'Standard' }),
    pro: t('subscription.tiers.pro', { defaultValue: 'Pro' }),
    business: t('subscription.tiers.business', { defaultValue: 'Business' }),
    premium: t('subscription.tiers.business', { defaultValue: 'Business' }),
    enterprise: t('subscription.tiers.enterprise', { defaultValue: 'Enterprise' }),
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string | null | undefined) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    const locale = i18n.language === 'ru' ? 'ru-RU' : 'en-US';
    const date = d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return `${date}, ${time}`;
  };

  const isDemoPlan = tier === 'free' || tier === 'basic' || tier === 'demo' || tier === 'trial';
  const planFeatures = [
    {
      key: 'calendar',
      label: t('subscription.features.calendar', { defaultValue: 'Календарь и бронирования' }),
      enabled: true,
    },
    {
      key: 'excel',
      label: t('subscription.features.excel', { defaultValue: 'Импорт бронирований из Excel' }),
      enabled: true,
    },
    {
      key: 'channel',
      label: t('subscription.features.channels', { defaultValue: 'Подключение Avito/других площадок' }),
      enabled: isDemoPlan || tier === 'start' || tier === 'starter' || tier === 'pro' || tier === 'business' || tier === 'premium' || tier === 'enterprise',
    },
    {
      key: 'export',
      label: t('subscription.features.export', { defaultValue: 'Экспорт и отчёты' }),
      enabled: isDemoPlan || tier === 'start' || tier === 'starter' || tier === 'pro' || tier === 'business' || tier === 'premium' || tier === 'enterprise',
    },
    {
      key: 'templates',
      label: t('subscription.features.templates', { defaultValue: 'Шаблоны сообщений' }),
      enabled: isDemoPlan || tier === 'pro' || tier === 'business' || tier === 'premium' || tier === 'enterprise',
    },
    {
      key: 'ai',
      label: t('subscription.features.ai', { defaultValue: 'AI‑поддержка' }),
      enabled: isDemoPlan || tier === 'pro' || tier === 'business' || tier === 'premium' || tier === 'enterprise',
    },
    {
      key: 'mobile',
      label: t('subscription.features.mobileWithSoon', { defaultValue: 'Мобильное приложение (скоро апрель 2026)' }),
      enabled: true,
    },
  ] as const;

  const convertToRUB = (amount: number, currency: string) => {
    const rates: { [key: string]: number } = { RUB: 1, EUR: 100, USD: 92 };
    return amount * (rates[currency] || 1);
  };

  const getFilteredBookings = () => {
    if (exportDateRange === 'all') return bookings;
    const now = new Date();
    let startDate: Date;
    switch (exportDateRange) {
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        return bookings;
    }
    return bookings.filter(b => new Date(b.check_in) >= startDate);
  };

  const exportBookingsCSV = () => {
    const filteredBookings = getFilteredBookings();
    const headers = ['ID', 'Объект', 'Гость', 'Email', 'Телефон', 'Заезд', 'Выезд', 'Ночей', 'Гостей', 'Сумма (RUB)', 'Источник', 'Статус'];
    const rows = filteredBookings.map(booking => {
      const property = properties.find(p => p.id === booking.property_id);
      const nights = Math.ceil(
        (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / (1000 * 60 * 60 * 24)
      );
      return [
        booking.id, property?.name || 'Unknown', booking.guest_name,
        booking.guest_email || '', booking.guest_phone || '',
        booking.check_in, booking.check_out, nights, booking.guests_count,
        convertToRUB(booking.total_price, booking.currency).toFixed(0),
        booking.source, booking.status,
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    downloadFile(csv, 'bookings.csv', 'text/csv');
    toast.success(t('settings.exportComplete', { defaultValue: 'Экспорт завершён' }));
  };

  const exportBookingsJSON = () => {
    const filteredBookings = getFilteredBookings();
    const data = filteredBookings.map(booking => {
      const property = properties.find(p => p.id === booking.property_id);
      const nights = Math.ceil(
        (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: booking.id, property: property?.name || 'Unknown',
        guest_name: booking.guest_name, guest_email: booking.guest_email,
        guest_phone: booking.guest_phone, check_in: booking.check_in,
        check_out: booking.check_out, nights, guests_count: booking.guests_count,
        total_price_rub: convertToRUB(booking.total_price, booking.currency),
        original_price: booking.total_price, original_currency: booking.currency,
        source: booking.source, status: booking.status,
      };
    });
    downloadFile(JSON.stringify(data, null, 2), 'bookings.json', 'application/json');
    toast.success(t('settings.exportComplete', { defaultValue: 'Экспорт завершён' }));
  };

  const exportAnalyticsReport = () => {
    const filteredBookings = getFilteredBookings();
    const totalRevenue = filteredBookings.reduce((sum, b) => sum + convertToRUB(b.total_price, b.currency), 0);
    const totalNights = filteredBookings.reduce((sum, b) =>
      sum + Math.ceil((new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / (1000 * 60 * 60 * 24)), 0
    );
    const bySource = filteredBookings.reduce((acc, b) => {
      acc[b.source] = (acc[b.source] || 0) + convertToRUB(b.total_price, b.currency);
      return acc;
    }, {} as Record<string, number>);
    const byProperty = filteredBookings.reduce((acc, b) => {
      const name = properties.find(p => p.id === b.property_id)?.name || 'Unknown';
      acc[name] = (acc[name] || 0) + convertToRUB(b.total_price, b.currency);
      return acc;
    }, {} as Record<string, number>);
    const report = {
      generated_at: new Date().toISOString(), period: exportDateRange,
      summary: {
        total_bookings: filteredBookings.length, total_revenue_rub: totalRevenue,
        total_nights: totalNights,
        avg_price_per_night: totalNights > 0 ? totalRevenue / totalNights : 0,
        avg_booking_value: filteredBookings.length > 0 ? totalRevenue / filteredBookings.length : 0,
      },
      by_source: bySource, by_property: byProperty,
    };
    downloadFile(JSON.stringify(report, null, 2), 'analytics_report.json', 'application/json');
    toast.success(t('settings.reportGenerated', { defaultValue: 'Отчёт сформирован' }));
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRequestDeletion = async () => {
    try {
      const { error } = await supabase.from('deletion_requests').insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        reason: deletionReason || null,
        status: 'pending',
      });
      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('404')) {
          toast.error(t('settings.deletionTableNotFound', { defaultValue: 'Таблица deletion_requests не найдена. Пожалуйста, примените миграцию базы данных.' }));
        } else {
          throw error;
        }
        return;
      }
      toast.success(t('settings.deletionRequestSent', { defaultValue: 'Запрос на удаление отправлен. Администратор рассмотрит его в ближайшее время.' }));
      setDeletionReason('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.requestError', { defaultValue: 'Ошибка при отправке запроса' }));
    }
  };

  const handleDeleteNowConfirm = async () => {
    setDeleteNowLoading(true);
    try {
      await deleteAccount();
      setDeleteNowModalOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.deleteError', { defaultValue: 'Ошибка удаления аккаунта' }));
    } finally {
      setDeleteNowLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    if (!user) return;
    setTestPushLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: {
          user_id: user.id,
          title: 'Тестовое уведомление Roomi',
          body: 'Если вы видите это сообщение, значит Web Push настроен верно! 🚀',
          url: '/?view=settings',
        },
      });

      if (error) throw error;

      if (data?.sent > 0) {
        toast.success(t('settings.testPushSent', { defaultValue: 'Тестовый пуш отправлен!' }));
      } else {
        toast.error(t('settings.testPushNoSubs', { defaultValue: 'Активные подписки не найдены. Сначала включите уведомления.' }));
      }
    } catch (error) {
      console.error('Test push error:', error);
      toast.error(t('settings.testPushError', { defaultValue: 'Ошибка при отправке пуша' }));
    } finally {
      setTestPushLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword) {
      toast.error(t('settings.passwordEmpty', { defaultValue: 'Введите новый пароль' }));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t('settings.passwordTooShort', { defaultValue: 'Пароль должен быть не менее 6 символов' }));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('settings.passwordMismatch', { defaultValue: 'Пароли не совпадают' }));
      return;
    }
    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(t('settings.passwordChanged', { defaultValue: 'Пароль успешно изменён' }));
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.passwordChangeError', { defaultValue: 'Ошибка при смене пароля' }));
    } finally {
      setPasswordLoading(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'subscription', label: t('settings.tabSubscription', { defaultValue: 'Подписка' }), icon: <CreditCard className="w-4 h-4" /> },
    { id: 'appearance', label: t('settings.tabAppearance', { defaultValue: 'Внешний вид' }), icon: <Globe className="w-4 h-4" /> },
    { id: 'notifications', label: t('settings.tabNotifications', { defaultValue: 'Уведомления' }), icon: <Bell className="w-4 h-4" /> },
    { id: 'export', label: t('settings.tabExport', { defaultValue: 'Экспорт' }), icon: <Download className="w-4 h-4" /> },
    { id: 'account', label: t('settings.tabAccount', { defaultValue: 'Аккаунт' }), icon: <User className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 bg-white text-black">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-black mb-1">{t('settings.title')}</h1>
          <p className="text-slate-600 text-sm">{t('settings.subtitle', { defaultValue: 'Управление настройками и интеграциями' })}</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                activeTab === tab.id
                  ? 'bg-white text-black shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Подписка */}
        {activeTab === 'subscription' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-black font-semibold">
                {t('settings.currentPlan', { defaultValue: 'Текущий план:' })}{' '}
                <span className="text-primary">{tierLabels[tier] ?? tier}</span>
                {isDemoPlan && profile?.subscription_expires_at && !expiredDemo && (
                  <span className="text-slate-600 font-normal text-sm ml-1">
                    {' '}({t('settings.demoUntilDateTime', { defaultValue: 'до {{dateTime}}', dateTime: formatDateTime(profile.subscription_expires_at) })})
                  </span>
                )}
              </div>
              {isDemoPlan && profile?.subscription_expires_at ? (
                <span className={`text-xs px-2 py-1 rounded-full ${expiredDemo ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-800'}`}>
                  {expiredDemo
                    ? t('settings.planExpired', { defaultValue: 'Демо истекло' })
                    : t('settings.planExpires', { defaultValue: 'До {{date}}', date: formatDate(profile.subscription_expires_at) })}
                </span>
              ) : !isDemoPlan ? (
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-800">
                  {tierRange || t('settings.planUnknown', { defaultValue: '—' })}
                </span>
              ) : null}
              {tierPriceRub != null && tierPriceRub > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-800">
                  {t('settings.planPrice', { defaultValue: '{{price}} ₽/мес', price: tierPriceRub })}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-sm font-semibold text-black mb-2">
                  {t('settings.planLimits', { defaultValue: 'Лимиты' })}
                </p>
                <div className="text-sm text-slate-700 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('settings.planLimitProperties', { defaultValue: 'Объекты' })}</span>
                    <span className="text-black font-medium">
                      {propertyLimit >= 999 ? t('settings.unlimited', { defaultValue: 'Без ограничений' }) : propertyLimit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('settings.planLimitBookings', { defaultValue: 'Бронирования/мес' })}</span>
                    <span className="text-black font-medium">
                      {bookingLimit === -1 ? t('settings.unlimited', { defaultValue: 'Без ограничений' }) : bookingLimit}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-sm font-semibold text-black mb-2">
                  {t('settings.planFeatures', { defaultValue: 'Особенности тарифа' })}
                </p>
                <ul className="space-y-1">
                  {planFeatures.map((f) => (
                    <li key={f.key} className="flex items-center gap-2 text-sm">
                      {f.enabled ? (
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className={f.enabled ? 'text-slate-800' : 'text-slate-500'}>{f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              {t('settings.planHelp', { defaultValue: 'Чтобы изменить тариф, напишите в поддержку: support@roomi.pro' })}
            </p>
          </div>
        )}

        {/* Tab: Внешний вид */}
        {activeTab === 'appearance' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-3">{t('settings.language')}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { i18n.changeLanguage('ru'); localStorage.setItem('language', 'ru'); }}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    i18n.language === 'ru'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  🇷🇺 Русский
                </button>
                <button
                  onClick={() => { i18n.changeLanguage('en'); localStorage.setItem('language', 'en'); }}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    i18n.language === 'en'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  🇬🇧 English
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <p className="text-sm font-medium text-slate-700 mb-3">{t('settings.theme', { defaultValue: 'Тема оформления' })}</p>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-3 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors text-slate-800"
              >
                {theme === 'dark' ? (
                  <>
                    <Moon className="w-4 h-4" />
                    {t('settings.themeDark', { defaultValue: 'Тёмная тема' })}
                  </>
                ) : (
                  <>
                    <Sun className="w-4 h-4 text-yellow-500" />
                    {t('settings.themeLight', { defaultValue: 'Светлая тема' })}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab: Уведомления */}
        {activeTab === 'notifications' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            {!notifSupported ? (
              <p className="text-sm text-slate-500">{t('settings.notificationsNotSupported', { defaultValue: 'Браузерные уведомления не поддерживаются.' })}</p>
            ) : notifPermission === 'granted' ? (
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg shrink-0">
                  <Bell className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{t('settings.notificationsEnabled', { defaultValue: 'Уведомления включены' })}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t('settings.notificationsEnabledHint', { defaultValue: 'Вы будете получать уведомления о новых сообщениях.' })}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSendTestPush}
                  disabled={testPushLoading}
                  className="shrink-0"
                >
                  {testPushLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5 mr-1.5" />}
                  {t('settings.sendTestPush', { defaultValue: 'Тест' })}
                </Button>
              </div>
            ) : notifPermission === 'denied' ? (
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg shrink-0">
                  <BellOff className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{t('settings.notificationsBlocked', { defaultValue: 'Уведомления заблокированы' })}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t('settings.notificationsBlockedHint', { defaultValue: 'Разрешите уведомления в настройках браузера.' })}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">{t('settings.notificationsPrompt', { defaultValue: 'Включите уведомления, чтобы не пропускать новые сообщения от гостей.' })}</p>
                <button
                  onClick={requestPermission}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors text-sm"
                >
                  <Bell className="w-4 h-4" />
                  {t('settings.notificationsEnable', { defaultValue: 'Включить уведомления' })}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab: Экспорт */}
        {activeTab === 'export' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">{t('settings.period', { defaultValue: 'Период' })}</label>
              <select
                value={exportDateRange}
                onChange={(e) => setExportDateRange(e.target.value)}
                className="w-full md:w-auto px-4 py-2 bg-white border border-slate-300 rounded-lg text-black"
              >
                <option value="all">{t('settings.allTime', { defaultValue: 'Все время' })}</option>
                <option value="year">{t('settings.thisYear', { defaultValue: 'Этот год' })}</option>
                <option value="quarter">{t('settings.thisQuarter', { defaultValue: 'Этот квартал' })}</option>
                <option value="month">{t('settings.thisMonth', { defaultValue: 'Этот месяц' })}</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={exportBookingsCSV}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-lg transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {t('settings.exportCSV', { defaultValue: 'Экспорт бронирований (CSV)' })}
              </button>

              <button
                onClick={exportBookingsJSON}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-lg transition-colors"
              >
                <FileText className="w-4 h-4" />
                {t('settings.exportJSON', { defaultValue: 'Экспорт бронирований (JSON)' })}
              </button>

              <button
                onClick={exportAnalyticsReport}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                {t('settings.exportAnalytics', { defaultValue: 'Аналитический отчёт' })}
              </button>
            </div>

            <p className="text-xs text-slate-500">
              {t('settings.exportFound', { count: getFilteredBookings().length, defaultValue: 'Найдено {{count}} бронирований для экспорта' })}
            </p>
          </div>
        )}

        {/* Tab: Аккаунт */}
        {activeTab === 'account' && (
          <div className="space-y-5">
            {/* Change Password */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Lock className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-base font-semibold text-black">{t('settings.changePassword', { defaultValue: 'Сменить пароль' })}</h2>
              </div>

              <div className="space-y-3 max-w-sm">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('settings.newPassword', { defaultValue: 'Новый пароль' })}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('settings.confirmPassword', { defaultValue: 'Повторите пароль' })}
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <button
                  onClick={handleChangePassword}
                  disabled={passwordLoading}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground rounded-lg transition-colors text-sm font-medium"
                >
                  {passwordLoading
                    ? t('common.loading', { defaultValue: 'Сохранение...' })
                    : t('settings.savePassword', { defaultValue: 'Сохранить пароль' })}
                </button>
              </div>
            </div>

            {/* Delete Account */}
            <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-base font-semibold text-black">{t('settings.deleteAccount', { defaultValue: 'Удаление аккаунта' })}</h2>
              </div>

              <p className="text-slate-600 text-sm mb-4">
                {t('settings.deleteAccountDescription', { defaultValue: 'Для удаления аккаунта отправьте запрос администратору. После одобрения все ваши данные будут безвозвратно удалены. Либо удалите аккаунт сразу — без запроса (все данные будут удалены без возможности восстановления).' })}
              </p>

              <div className="space-y-3">
                <textarea
                  value={deletionReason}
                  onChange={(e) => setDeletionReason(e.target.value)}
                  placeholder={t('settings.deletionReason', { defaultValue: 'Причина удаления (необязательно)' })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-black min-h-[80px] resize-y placeholder:text-slate-400"
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleRequestDeletion}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                  >
                    {t('settings.requestDeletion', { defaultValue: 'Запросить удаление аккаунта' })}
                  </button>
                  <button
                    onClick={() => setDeleteNowModalOpen(true)}
                    className="px-4 py-2 bg-white hover:bg-slate-50 text-red-600 border border-red-300 rounded-lg transition-colors text-sm"
                  >
                    {t('settings.deleteAccountNow', { defaultValue: 'Удалить сейчас' })}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteNowModalOpen}
        onClose={() => !deleteNowLoading && setDeleteNowModalOpen(false)}
        onConfirm={handleDeleteNowConfirm}
        title={t('settings.deleteAccountNowTitle', { defaultValue: 'Удалить аккаунт сейчас' })}
        message={t('settings.deleteAccountNowMessage', {
          defaultValue: 'Все ваши данные (объекты, бронирования, гости, чаты) будут безвозвратно удалены. Вы уверены?',
        })}
        confirmText={t('settings.deleteAccountNowConfirm', { defaultValue: 'Удалить безвозвратно' })}
        variant="danger"
        loading={deleteNowLoading}
      />
    </div>
  );
}
