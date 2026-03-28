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
    free: t('subscription.tiers.demo'),
    basic: t('subscription.tiers.demo'),
    demo: t('subscription.tiers.demo'),
    trial: t('subscription.tiers.demo'),
    start: t('subscription.tiers.standard'),
    starter: t('subscription.tiers.standard'),
    pro: t('subscription.tiers.pro'),
    business: t('subscription.tiers.business'),
    premium: t('subscription.tiers.business'),
    enterprise: t('subscription.tiers.enterprise'),
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
      label: t('subscription.features.calendar'),
      enabled: true,
    },
    {
      key: 'excel',
      label: t('subscription.features.excel'),
      enabled: true,
    },
    {
      key: 'channel',
      label: t('subscription.features.channels'),
      enabled: isDemoPlan || tier === 'start' || tier === 'starter' || tier === 'pro' || tier === 'business' || tier === 'premium' || tier === 'enterprise',
    },
    {
      key: 'export',
      label: t('subscription.features.export'),
      enabled: isDemoPlan || tier === 'start' || tier === 'starter' || tier === 'pro' || tier === 'business' || tier === 'premium' || tier === 'enterprise',
    },
    {
      key: 'templates',
      label: t('subscription.features.templates'),
      enabled: isDemoPlan || tier === 'pro' || tier === 'business' || tier === 'premium' || tier === 'enterprise',
    },
    {
      key: 'ai',
      label: t('subscription.features.ai'),
      enabled: isDemoPlan || tier === 'pro' || tier === 'business' || tier === 'premium' || tier === 'enterprise',
    },
    {
      key: 'mobile',
      label: t('subscription.features.mobileWithSoon'),
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
    const headers = ['ID', 'Property', 'Guest', 'Email', 'Phone', 'Check-in', 'Check-out', 'Nights', 'Guests', 'Amount (RUB)', 'Source', 'Status'];
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
    toast.success(t('settings.exportComplete'));
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
    toast.success(t('settings.exportComplete'));
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
    toast.success(t('settings.reportGenerated'));
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
          toast.error(t('settings.deletionTableNotFound'));
        } else {
          throw error;
        }
        return;
      }
      toast.success(t('settings.deletionRequestSent'));
      setDeletionReason('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.requestError'));
    }
  };

  const handleDeleteNowConfirm = async () => {
    setDeleteNowLoading(true);
    try {
      await deleteAccount();
      setDeleteNowModalOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.deleteError'));
    } finally {
      setDeleteNowLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword) {
      toast.error(t('settings.passwordEmpty'));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t('settings.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('settings.passwordMismatch'));
      return;
    }
    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(t('settings.passwordChanged'));
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.passwordChangeError'));
    } finally {
      setPasswordLoading(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'subscription', label: t('settings.tabSubscription'), icon: <CreditCard className="w-4 h-4" /> },
    { id: 'appearance', label: t('settings.tabAppearance'), icon: <Globe className="w-4 h-4" /> },
    { id: 'notifications', label: t('settings.tabNotifications'), icon: <Bell className="w-4 h-4" /> },
    { id: 'export', label: t('settings.tabExport'), icon: <Download className="w-4 h-4" /> },
    { id: 'account', label: t('settings.tabAccount'), icon: <User className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 bg-background text-foreground">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-foreground mb-1">{t('settings.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('settings.subtitle')}</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-muted p-1 rounded-xl mb-6 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Подписка */}
        {activeTab === 'subscription' && (
          <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm p-6 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-foreground font-semibold">
                {t('settings.currentPlan')}{' '}
                <span className="text-primary">{tierLabels[tier] ?? tier}</span>
                {isDemoPlan && profile?.subscription_expires_at && !expiredDemo && (
                  <span className="text-muted-foreground font-normal text-sm ml-1">
                    {' '}({t('settings.demoUntilDateTime', { dateTime: formatDateTime(profile.subscription_expires_at) })})
                  </span>
                )}
              </div>
              {isDemoPlan && profile?.subscription_expires_at ? (
                <span className={`text-xs px-2 py-1 rounded-full ${expiredDemo ? 'bg-red-100 text-red-700' : 'bg-muted text-foreground'}`}>
                  {expiredDemo
                    ? t('settings.planExpired')
                    : t('settings.planExpires', { date: formatDate(profile.subscription_expires_at) })}
                </span>
              ) : !isDemoPlan ? (
                <span className="text-xs px-2 py-1 rounded-full bg-muted text-foreground">
                  {tierRange || t('settings.planUnknown')}
                </span>
              ) : null}
              {tierPriceRub != null && tierPriceRub > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-muted text-foreground">
                  {t('settings.planPrice', { price: tierPriceRub })}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <p className="text-sm font-semibold text-foreground mb-2">
                  {t('settings.planLimits')}
                </p>
                <div className="text-sm text-foreground space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('settings.planLimitProperties')}</span>
                    <span className="text-foreground font-medium">
                      {propertyLimit >= 999 ? t('settings.unlimited') : propertyLimit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('settings.planLimitBookings')}</span>
                    <span className="text-foreground font-medium">
                      {bookingLimit === -1 ? t('settings.unlimited') : bookingLimit}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <p className="text-sm font-semibold text-foreground mb-2">
                  {t('settings.planFeatures')}
                </p>
                <ul className="space-y-1">
                  {planFeatures.map((f) => (
                    <li key={f.key} className="flex items-center gap-2 text-sm">
                      {f.enabled ? (
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className={f.enabled ? 'text-foreground' : 'text-muted-foreground'}>{f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {t('settings.planHelp')}
            </p>
          </div>
        )}

        {/* Tab: Внешний вид */}
        {activeTab === 'appearance' && (
          <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm p-6 space-y-6">
            <div>
              <p className="text-sm font-medium text-foreground mb-3">{t('settings.language')}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { i18n.changeLanguage('ru'); localStorage.setItem('language', 'ru'); }}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    i18n.language === 'ru'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
                  }`}
                >
                  🇷🇺 Русский
                </button>
                <button
                  onClick={() => { i18n.changeLanguage('en'); localStorage.setItem('language', 'en'); }}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    i18n.language === 'en'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
                  }`}
                >
                  🇬🇧 English
                </button>
              </div>
            </div>

            <div className="border-t border-border pt-5">
              <p className="text-sm font-medium text-foreground mb-3">{t('settings.theme')}</p>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-3 px-4 py-2 bg-muted hover:bg-muted/80 border border-border rounded-lg transition-colors text-foreground"
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
          <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm p-6">
            {!notifSupported ? (
              <p className="text-sm text-muted-foreground">{t('settings.notificationsNotSupported')}</p>
            ) : notifPermission === 'granted' ? (
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg shrink-0">
                  <Bell className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{t('settings.notificationsEnabled')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('settings.notificationsEnabledHint')}</p>
                </div>
              </div>
            ) : notifPermission === 'denied' ? (
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg shrink-0">
                  <BellOff className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{t('settings.notificationsBlocked')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('settings.notificationsBlockedHint')}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{t('settings.notificationsPrompt')}</p>
                <button
                  onClick={requestPermission}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors text-sm"
                >
                  <Bell className="w-4 h-4" />
                  {t('settings.notificationsEnable')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab: Экспорт */}
        {activeTab === 'export' && (
          <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">{t('settings.period')}</label>
              <select
                value={exportDateRange}
                onChange={(e) => setExportDateRange(e.target.value)}
                className="w-full md:w-auto px-4 py-2 bg-background border border-input rounded-lg text-foreground"
              >
                <option value="all">{t('settings.allTime')}</option>
                <option value="year">{t('settings.thisYear')}</option>
                <option value="quarter">{t('settings.thisQuarter')}</option>
                <option value="month">{t('settings.thisMonth')}</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={exportBookingsCSV}
                className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {t('settings.exportCSV')}
              </button>

              <button
                onClick={exportBookingsJSON}
                className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg transition-colors"
              >
                <FileText className="w-4 h-4" />
                {t('settings.exportJSON')}
              </button>

              <button
                onClick={exportAnalyticsReport}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                {t('settings.exportAnalytics')}
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              {t('settings.exportFound', { count: getFilteredBookings().length })}
            </p>
          </div>
        )}

        {/* Tab: Аккаунт */}
        {activeTab === 'account' && (
          <div className="space-y-5">
            {/* Change Password */}
            <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Lock className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-base font-semibold text-foreground">{t('settings.changePassword')}</h2>
              </div>

              <div className="space-y-3 max-w-sm">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('settings.newPassword')}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('settings.confirmPassword')}
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <button
                  onClick={handleChangePassword}
                  disabled={passwordLoading}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground rounded-lg transition-colors text-sm font-medium"
                >
                  {passwordLoading
                    ? t('modals.saving')
                    : t('settings.savePassword')}
                </button>
              </div>
            </div>

            {/* Delete Account */}
            <div className="bg-card text-card-foreground rounded-xl border border-red-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-base font-semibold text-foreground">{t('settings.deleteAccount')}</h2>
              </div>

              <p className="text-muted-foreground text-sm mb-4">
                {t('settings.deleteAccountDescription')}
              </p>

              <div className="space-y-3">
                <textarea
                  value={deletionReason}
                  onChange={(e) => setDeletionReason(e.target.value)}
                  placeholder={t('settings.deletionReason')}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground min-h-[80px] resize-y placeholder:text-muted-foreground"
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleRequestDeletion}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                  >
                    {t('settings.requestDeletion')}
                  </button>
                  <button
                    onClick={() => setDeleteNowModalOpen(true)}
                    className="px-4 py-2 bg-background hover:bg-muted/20 text-red-600 border border-red-300 rounded-lg transition-colors text-sm"
                  >
                    {t('settings.deleteAccountNow')}
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
        title={t('settings.deleteAccountNowTitle')}
        message={t('settings.deleteAccountNowMessage')}
        confirmText={t('settings.deleteAccountNowConfirm')}
        variant="danger"
        loading={deleteNowLoading}
      />
    </div>
  );
}
