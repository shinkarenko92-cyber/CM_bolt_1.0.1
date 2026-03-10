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
} from 'lucide-react';
import { Booking, Property, supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import { TIER_OBJECT_RANGE, TIER_PRICE_RUB, getBookingLimit, getPropertyLimit, isDemoExpired } from '@/utils/subscriptionLimits';

interface SettingsViewProps {
  bookings: Booking[];
  properties: Property[];
}

export function SettingsView({ bookings, properties }: SettingsViewProps) {
  const { t, i18n } = useTranslation();
  const { deleteAccount, profile } = useAuth();
  const [exportDateRange, setExportDateRange] = useState('all');
  const [deleteNowModalOpen, setDeleteNowModalOpen] = useState(false);
  const [deleteNowLoading, setDeleteNowLoading] = useState(false);

  const tier = profile?.subscription_tier ?? 'free';
  const tierPriceRub = TIER_PRICE_RUB[tier] ?? null;
  const tierRange = TIER_OBJECT_RANGE[tier] ?? '';
  const expiredDemo = profile ? isDemoExpired(profile) : false;
  const propertyLimit = getPropertyLimit(profile ?? null);
  const bookingLimit = getBookingLimit(profile ?? null);

  const tierLabels: Record<string, string> = {
    free: t('settings.trial5Days', { defaultValue: 'Trial 5 дней' }),
    basic: t('settings.trial5Days', { defaultValue: 'Trial 5 дней' }),
    demo: t('subscription.tiers.demo', { defaultValue: 'Demo' }),
    trial: t('subscription.tiers.demo', { defaultValue: 'Demo' }),
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

  const isTrialPlan = tier === 'free' || tier === 'basic';
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
      enabled: isTrialPlan || (tier !== 'free' && tier !== 'basic'),
    },
    {
      key: 'export',
      label: t('subscription.features.export', { defaultValue: 'Экспорт и отчёты' }),
      enabled: isTrialPlan || (tier !== 'free' && tier !== 'basic'),
    },
    {
      key: 'templates',
      label: t('subscription.features.templates', { defaultValue: 'Шаблоны сообщений' }),
      enabled: isTrialPlan || tier === 'pro' || tier === 'business' || tier === 'premium' || tier === 'enterprise',
    },
    {
      key: 'ai',
      label: t('subscription.features.ai', { defaultValue: 'AI‑поддержка' }),
      enabled: isTrialPlan || tier === 'pro' || tier === 'business' || tier === 'premium' || tier === 'enterprise',
    },
    {
      key: 'mobile',
      label: t('subscription.features.mobileWithSoon', { defaultValue: 'Мобильное приложение (скоро Апрель 2026)' }),
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
    
    const headers = [
      'ID',
      'Объект',
      'Гость',
      'Email',
      'Телефон',
      'Заезд',
      'Выезд',
      'Ночей',
      'Гостей',
      'Сумма (RUB)',
      'Источник',
      'Статус',
    ];
    
    const rows = filteredBookings.map(booking => {
      const property = properties.find(p => p.id === booking.property_id);
      const nights = Math.ceil(
        (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 
        (1000 * 60 * 60 * 24)
      );
      
      return [
        booking.id,
        property?.name || 'Unknown',
        booking.guest_name,
        booking.guest_email || '',
        booking.guest_phone || '',
        booking.check_in,
        booking.check_out,
        nights,
        booking.guests_count,
        convertToRUB(booking.total_price, booking.currency).toFixed(0),
        booking.source,
        booking.status,
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
        (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 
        (1000 * 60 * 60 * 24)
      );
      
      return {
        id: booking.id,
        property: property?.name || 'Unknown',
        guest_name: booking.guest_name,
        guest_email: booking.guest_email,
        guest_phone: booking.guest_phone,
        check_in: booking.check_in,
        check_out: booking.check_out,
        nights,
        guests_count: booking.guests_count,
        total_price_rub: convertToRUB(booking.total_price, booking.currency),
        original_price: booking.total_price,
        original_currency: booking.currency,
        source: booking.source,
        status: booking.status,
      };
    });
    
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, 'bookings.json', 'application/json');
    toast.success(t('settings.exportComplete', { defaultValue: 'Экспорт завершён' }));
  };

  const exportAnalyticsReport = () => {
    const filteredBookings = getFilteredBookings();
    
    const totalRevenue = filteredBookings.reduce((sum, b) => 
      sum + convertToRUB(b.total_price, b.currency), 0
    );
    
    const totalNights = filteredBookings.reduce((sum, b) => {
      return sum + Math.ceil(
        (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 
        (1000 * 60 * 60 * 24)
      );
    }, 0);
    
    const bySource = filteredBookings.reduce((acc, b) => {
      const revenue = convertToRUB(b.total_price, b.currency);
      acc[b.source] = (acc[b.source] || 0) + revenue;
      return acc;
    }, {} as Record<string, number>);
    
    const byProperty = filteredBookings.reduce((acc, b) => {
      const property = properties.find(p => p.id === b.property_id);
      const name = property?.name || 'Unknown';
      const revenue = convertToRUB(b.total_price, b.currency);
      acc[name] = (acc[name] || 0) + revenue;
      return acc;
    }, {} as Record<string, number>);
    
    const report = {
      generated_at: new Date().toISOString(),
      period: exportDateRange,
      summary: {
        total_bookings: filteredBookings.length,
        total_revenue_rub: totalRevenue,
        total_nights: totalNights,
        avg_price_per_night: totalNights > 0 ? totalRevenue / totalNights : 0,
        avg_booking_value: filteredBookings.length > 0 ? totalRevenue / filteredBookings.length : 0,
      },
      by_source: bySource,
      by_property: byProperty,
    };
    
    const json = JSON.stringify(report, null, 2);
    downloadFile(json, 'analytics_report.json', 'application/json');
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

  const [deletionReason, setDeletionReason] = useState('');

  const handleRequestDeletion = async () => {
    try {
      const { error } = await supabase.from('deletion_requests').insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        reason: deletionReason || null,
        status: 'pending',
      });

      if (error) {
        // If table doesn't exist (404), show helpful message
        if (error.code === 'PGRST116' || error.message?.includes('404')) {
          toast.error(t('settings.deletionTableNotFound', { defaultValue: 'Таблица deletion_requests не найдена. Пожалуйста, примените миграцию базы данных.' }));
        } else {
          throw error;
        }
        return;
      }

      toast.success(t('settings.deletionRequestSent', { defaultValue: 'Account deletion request sent. An administrator will review it shortly.' }));
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

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 bg-white text-black">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-black mb-1">{t('settings.title')}</h1>
          <p className="text-slate-600 text-sm">{t('settings.subtitle', { defaultValue: 'Управление настройками и интеграциями' })}</p>
        </div>

        {/* Subscription / Plan */}
        <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-black">{t('settings.planTitle', { defaultValue: 'Тариф' })}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="text-black font-semibold">
              {t('settings.currentPlan', { defaultValue: 'Текущий план:' })}{' '}
              <span className="text-primary">{tierLabels[tier] ?? tier}</span>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-800">
              {tierRange || t('settings.planUnknown', { defaultValue: '—' })}
            </span>
            {tierPriceRub != null && tierPriceRub > 0 && (
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-800">
                {t('settings.planPrice', { defaultValue: '{{price}} ₽/мес', price: tierPriceRub })}
              </span>
            )}
            {(tier === 'demo' || tier === 'trial') && profile?.subscription_expires_at && (
              <span className={`text-xs px-2 py-1 rounded-full ${expiredDemo ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                {expiredDemo
                  ? t('settings.planExpired', { defaultValue: 'Демо истекло' })
                  : t('settings.planExpires', { defaultValue: 'Демо до {{date}}', date: formatDate(profile.subscription_expires_at) })}
              </span>
            )}
          </div>

          {isTrialPlan && (
            <p className="mt-3 text-sm text-slate-700">
              {t('settings.trialDescription', { defaultValue: 'При регистрации вам доступен Trial 5 дней — все функции включены, безлимитное количество объектов.' })}
            </p>
          )}

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <p className="text-xs text-slate-500 mt-4">
            {t('settings.planHelp', { defaultValue: 'Чтобы изменить тариф, напишите в поддержку: support@roomi.pro' })}
          </p>
        </div>

        {/* Language & Theme */}
        <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Globe className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-black">{t('settings.language')}</h2>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => {
                i18n.changeLanguage('ru');
                localStorage.setItem('language', 'ru');
              }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                i18n.language === 'ru' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              🇷🇺 Русский
            </button>
            <button
              onClick={() => {
                i18n.changeLanguage('en');
                localStorage.setItem('language', 'en');
              }}
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

        {/* Export Reports */}
        <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Download className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-black">{t('settings.exportData', { defaultValue: 'Экспорт данных' })}</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-600 mb-2">{t('settings.period', { defaultValue: 'Период' })}</label>
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
        </div>

        {/* Delete Account */}
        <div className="bg-white rounded-lg p-6 border border-red-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-100 rounded-lg">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-black">{t('settings.deleteAccount', { defaultValue: 'Удаление аккаунта' })}</h2>
          </div>
          
          <p className="text-slate-600 text-sm mb-4">
            Для удаления аккаунта отправьте запрос администратору.
            После одобрения все ваши данные будут безвозвратно удалены.
            Либо удалите аккаунт сразу — без запроса (все данные будут удалены без возможности восстановления).
          </p>

          <div className="space-y-3">
            <textarea
              value={deletionReason}
              onChange={(e) => setDeletionReason(e.target.value)}
              placeholder={t('settings.deletionReason', { defaultValue: 'Reason for deletion (optional)' })}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-black min-h-[80px] resize-y placeholder:text-slate-400"
            />
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleRequestDeletion}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                {t('settings.requestDeletion', { defaultValue: 'Request Account Deletion' })}
              </button>
              <button
                onClick={() => setDeleteNowModalOpen(true)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-red-600 border border-red-300 rounded-lg transition-colors"
              >
                {t('settings.deleteAccountNow', { defaultValue: 'Delete account now' })}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteNowModalOpen}
        onClose={() => !deleteNowLoading && setDeleteNowModalOpen(false)}
        onConfirm={handleDeleteNowConfirm}
        title={t('settings.deleteAccountNowTitle', { defaultValue: 'Delete account now' })}
        message={t('settings.deleteAccountNowMessage', {
          defaultValue: 'All your data (properties, bookings, guests, chats) will be permanently deleted and cannot be restored. Are you sure?',
        })}
        confirmText={t('settings.deleteAccountNowConfirm', { defaultValue: 'Delete permanently' })}
        variant="danger"
        loading={deleteNowLoading}
      />
    </div>
  );
}

