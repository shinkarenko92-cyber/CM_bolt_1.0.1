import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Calendar, Home, Percent } from 'lucide-react';
import { Booking, Property } from '../lib/supabase';

interface AnalyticsViewProps {
  bookings: Booking[];
  properties: Property[];
}

export function AnalyticsView({ bookings, properties }: AnalyticsViewProps) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const analytics = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const currentMonthStart = new Date(year, month - 1, 1);
    const currentMonthEnd = new Date(year, month, 0);
    const previousMonthStart = new Date(year, month - 2, 1);
    const previousMonthEnd = new Date(year, month - 1, 0);

    const convertToRUB = (amount: number, currency: string) => {
      const rates: { [key: string]: number } = {
        RUB: 1,
        EUR: 100,
        USD: 92,
      };
      return amount * (rates[currency] || 1);
    };

    const filterBookingsByDateRange = (start: Date, end: Date) => {
      return bookings.filter((booking) => {
        const checkIn = new Date(booking.check_in);
        const checkOut = new Date(booking.check_out);
        return (
          (checkIn >= start && checkIn <= end) ||
          (checkOut >= start && checkOut <= end) ||
          (checkIn <= start && checkOut >= end)
        );
      });
    };

    const calculateRevenue = (bookingsList: Booking[]) => {
      return bookingsList.reduce((sum, booking) => {
        return sum + convertToRUB(booking.total_price, booking.currency);
      }, 0);
    };

    const calculateOccupiedNights = (bookingsList: Booking[], start: Date, end: Date) => {
      let totalNights = 0;

      bookingsList.forEach((booking) => {
        const checkIn = new Date(booking.check_in);
        const checkOut = new Date(booking.check_out);

        const effectiveStart = checkIn > start ? checkIn : start;
        const effectiveEnd = checkOut < end ? checkOut : end;

        if (effectiveStart < effectiveEnd) {
          const diffTime = effectiveEnd.getTime() - effectiveStart.getTime();
          const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          totalNights += nights;
        }
      });

      return totalNights;
    };

    const currentBookings = filterBookingsByDateRange(currentMonthStart, currentMonthEnd);
    const previousBookings = filterBookingsByDateRange(previousMonthStart, previousMonthEnd);

    const currentRevenue = calculateRevenue(currentBookings);
    const previousRevenue = calculateRevenue(previousBookings);
    const revenueChange = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    const daysInCurrentMonth = currentMonthEnd.getDate();
    const totalPossibleNights = properties.length * daysInCurrentMonth;
    const occupiedNights = calculateOccupiedNights(currentBookings, currentMonthStart, currentMonthEnd);
    const occupancyRate = totalPossibleNights > 0 ? (occupiedNights / totalPossibleNights) * 100 : 0;

    const avgPricePerNight = occupiedNights > 0 ? currentRevenue / occupiedNights : 0;
    const dailyAvgRevenue = daysInCurrentMonth > 0 ? currentRevenue / daysInCurrentMonth : 0;

    const sourceBreakdown = currentBookings.reduce((acc, booking) => {
      const revenue = convertToRUB(booking.total_price, booking.currency);
      acc[booking.source] = (acc[booking.source] || 0) + revenue;
      return acc;
    }, {} as { [key: string]: number });

    const propertyBreakdown = currentBookings.reduce((acc, booking) => {
      const revenue = convertToRUB(booking.total_price, booking.currency);
      acc[booking.property_id] = (acc[booking.property_id] || 0) + revenue;
      return acc;
    }, {} as { [key: string]: number });

    const topProperties = Object.entries(propertyBreakdown)
      .map(([id, revenue]) => ({
        property: properties.find((p) => p.id === id),
        revenue,
      }))
      .filter((item) => item.property)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      currentRevenue,
      previousRevenue,
      revenueChange,
      avgPricePerNight,
      dailyAvgRevenue,
      occupancyRate,
      occupiedNights,
      totalPossibleNights,
      currentBookings: currentBookings.length,
      sourceBreakdown,
      topProperties,
    };
  }, [bookings, properties, selectedMonth]);

  const getSourceLabel = (source: string) => {
    const labels: { [key: string]: string } = {
      manual: 'Вручную',
      airbnb: 'Airbnb',
      booking: 'Booking.com',
      avito: 'Avito',
      cian: 'CIAN',
    };
    return labels[source] || source;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ru-RU').format(Math.round(amount));
  };

  const months = useMemo(() => {
    const result = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      result.push({ value, label });
    }
    return result;
  }, []);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Аналитика</h1>
            <p className="text-slate-400">Доходы и статистика бронирований</p>
          </div>

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
          >
            {months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-teal-500/20 rounded-lg">
                <DollarSign className="w-6 h-6 text-teal-400" />
              </div>
              {analytics.revenueChange !== 0 && (
                <div
                  className={`flex items-center gap-1 text-sm font-medium ${
                    analytics.revenueChange > 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {analytics.revenueChange > 0 ? (
                    <TrendingUp size={16} />
                  ) : (
                    <TrendingDown size={16} />
                  )}
                  {Math.abs(analytics.revenueChange).toFixed(1)}%
                </div>
              )}
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {formatCurrency(analytics.currentRevenue)} ₽
            </div>
            <div className="text-sm text-slate-400">Доход за месяц</div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <Calendar className="w-6 h-6 text-blue-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {formatCurrency(analytics.avgPricePerNight)} ₽
            </div>
            <div className="text-sm text-slate-400">Средняя цена за ночь</div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-purple-500/20 rounded-lg">
                <DollarSign className="w-6 h-6 text-purple-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {formatCurrency(analytics.dailyAvgRevenue)} ₽
            </div>
            <div className="text-sm text-slate-400">Средний доход в день</div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-green-500/20 rounded-lg">
                <Percent className="w-6 h-6 text-green-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {analytics.occupancyRate.toFixed(1)}%
            </div>
            <div className="text-sm text-slate-400">
              Загруженность ({analytics.occupiedNights}/{analytics.totalPossibleNights} ночей)
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-slate-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Доход по источникам</h3>
            {Object.keys(analytics.sourceBreakdown).length === 0 ? (
              <p className="text-slate-400 text-center py-8">Нет данных за выбранный период</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(analytics.sourceBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([source, revenue]) => {
                    const percentage = (revenue / analytics.currentRevenue) * 100;
                    return (
                      <div key={source}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-300">{getSourceLabel(source)}</span>
                          <span className="text-sm font-medium text-white">
                            {formatCurrency(revenue)} ₽ ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          <div className="bg-slate-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Топ объектов по доходу</h3>
            {analytics.topProperties.length === 0 ? (
              <p className="text-slate-400 text-center py-8">Нет данных за выбранный период</p>
            ) : (
              <div className="space-y-3">
                {analytics.topProperties.map((item, idx) => {
                  const percentage = (item.revenue / analytics.currentRevenue) * 100;
                  return (
                    <div key={item.property!.id} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
                        <span className="text-slate-300 text-sm font-medium">{idx + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-white font-medium">
                            {item.property!.name}
                          </span>
                          <span className="text-sm text-slate-300">
                            {formatCurrency(item.revenue)} ₽
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-teal-500 to-blue-500 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Сравнение с предыдущим месяцем</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-slate-400 mb-2">Текущий месяц</div>
              <div className="text-2xl font-bold text-white">
                {formatCurrency(analytics.currentRevenue)} ₽
              </div>
              <div className="text-sm text-slate-500 mt-1">
                {analytics.currentBookings} бронирований
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-400 mb-2">Предыдущий месяц</div>
              <div className="text-2xl font-bold text-slate-400">
                {formatCurrency(analytics.previousRevenue)} ₽
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-400 mb-2">Изменение</div>
              <div
                className={`text-2xl font-bold ${
                  analytics.revenueChange > 0
                    ? 'text-green-400'
                    : analytics.revenueChange < 0
                    ? 'text-red-400'
                    : 'text-slate-400'
                }`}
              >
                {analytics.revenueChange > 0 ? '+' : ''}
                {analytics.revenueChange.toFixed(1)}%
              </div>
              <div className="text-sm text-slate-500 mt-1">
                {analytics.revenueChange > 0 ? (
                  <span className="text-green-400">
                    +{formatCurrency(analytics.currentRevenue - analytics.previousRevenue)} ₽
                  </span>
                ) : (
                  <span className="text-red-400">
                    {formatCurrency(analytics.currentRevenue - analytics.previousRevenue)} ₽
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
