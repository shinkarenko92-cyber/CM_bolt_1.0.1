import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Download,
  Globe,
  FileSpreadsheet,
  FileText,
  Trash2,
} from 'lucide-react';
import { Booking, Property, supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmModal } from './ConfirmModal';

interface SettingsViewProps {
  bookings: Booking[];
  properties: Property[];
}

export function SettingsView({ bookings, properties }: SettingsViewProps) {
  const { t, i18n } = useTranslation();
  const { deleteAccount } = useAuth();
  const [exportDateRange, setExportDateRange] = useState('all');
  const [deleteNowModalOpen, setDeleteNowModalOpen] = useState(false);
  const [deleteNowLoading, setDeleteNowLoading] = useState(false);

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
    toast.success('Экспорт завершён');
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
    toast.success('Экспорт завершён');
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
    toast.success('Отчёт сформирован');
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
          toast.error('Таблица deletion_requests не найдена. Пожалуйста, примените миграцию базы данных.');
        } else {
          throw error;
        }
        return;
      }

      toast.success(t('settings.deletionRequestSent', { defaultValue: 'Account deletion request sent. An administrator will review it shortly.' }));
      setDeletionReason('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при отправке запроса');
    }
  };

  const handleDeleteNowConfirm = async () => {
    setDeleteNowLoading(true);
    try {
      await deleteAccount();
      setDeleteNowModalOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка удаления аккаунта');
    } finally {
      setDeleteNowLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white mb-1">{t('settings.title')}</h1>
          <p className="text-slate-400 text-sm">Управление настройками и интеграциями</p>
        </div>

        {/* Language & Theme */}
        <div className="bg-slate-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Globe className="w-5 h-5 text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">{t('settings.language')}</h2>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => {
                i18n.changeLanguage('ru');
                localStorage.setItem('language', 'ru');
              }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                i18n.language === 'ru' 
                  ? 'bg-teal-600 text-white' 
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
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
                  ? 'bg-teal-600 text-white' 
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              🇬🇧 English
            </button>
          </div>
        </div>

        {/* Export Reports */}
        <div className="bg-slate-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Download className="w-5 h-5 text-green-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Экспорт данных</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Период</label>
              <select
                value={exportDateRange}
                onChange={(e) => setExportDateRange(e.target.value)}
                className="w-full md:w-auto px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              >
                <option value="all">Все время</option>
                <option value="year">Этот год</option>
                <option value="quarter">Этот квартал</option>
                <option value="month">Этот месяц</option>
              </select>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button
                onClick={exportBookingsCSV}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Экспорт бронирований (CSV)
              </button>
              
              <button
                onClick={exportBookingsJSON}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                <FileText className="w-4 h-4" />
                Экспорт бронирований (JSON)
              </button>
              
              <button
                onClick={exportAnalyticsReport}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Аналитический отчёт
              </button>
            </div>
            
            <p className="text-xs text-slate-500">
              Найдено {getFilteredBookings().length} бронирований для экспорта
            </p>
          </div>
        </div>

        {/* Delete Account */}
        <div className="bg-slate-800 rounded-lg p-6 border border-red-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Удаление аккаунта</h2>
          </div>
          
          <p className="text-slate-400 text-sm mb-4">
            Для удаления аккаунта отправьте запрос администратору.
            После одобрения все ваши данные будут безвозвратно удалены.
            Либо удалите аккаунт сразу — без запроса (все данные будут удалены без возможности восстановления).
          </p>

          <div className="space-y-3">
            <textarea
              value={deletionReason}
              onChange={(e) => setDeletionReason(e.target.value)}
              placeholder={t('settings.deletionReason', { defaultValue: 'Reason for deletion (optional)' })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white min-h-[80px] resize-y"
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
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-red-400 border border-red-500/50 rounded-lg transition-colors"
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

