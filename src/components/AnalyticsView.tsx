import { useMemo, useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Percent, Home, BedDouble } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Booking, Property } from '../lib/supabase';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';

interface AnalyticsViewProps {
  bookings: Booking[];
  properties: Property[];
}

const COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#22c55e'];

export function AnalyticsView({ bookings, properties }: AnalyticsViewProps) {
  const { t } = useTranslation();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const convertToRUB = (amount: number, currency: string) => {
    const rates: { [key: string]: number } = {
      RUB: 1,
      EUR: 100,
      USD: 92,
    };
    return amount * (rates[currency] || 1);
  };

  const analytics = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const currentMonthStart = new Date(year, month - 1, 1);
    const currentMonthEnd = new Date(year, month, 0);
    const previousMonthStart = new Date(year, month - 2, 1);
    const previousMonthEnd = new Date(year, month - 1, 0);

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

    // ADR (Average Daily Rate) - average revenue per occupied night
    const adr = occupiedNights > 0 ? currentRevenue / occupiedNights : 0;
    
    // RevPAR (Revenue Per Available Room) - revenue per available room night
    const revPar = totalPossibleNights > 0 ? currentRevenue / totalPossibleNights : 0;
    
    // For backwards compatibility
    const avgPricePerNight = adr;
    const dailyAvgRevenue = daysInCurrentMonth > 0 ? currentRevenue / daysInCurrentMonth : 0;
    
    // Average booking value
    const avgBookingValue = currentBookings.length > 0 ? currentRevenue / currentBookings.length : 0;
    
    // Average length of stay
    const totalNightsBooked = currentBookings.reduce((sum, b) => {
      const checkIn = new Date(b.check_in);
      const checkOut = new Date(b.check_out);
      return sum + Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    }, 0);
    const avgLengthOfStay = currentBookings.length > 0 ? totalNightsBooked / currentBookings.length : 0;

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
      adr,
      revPar,
      avgPricePerNight,
      dailyAvgRevenue,
      occupancyRate,
      occupiedNights,
      totalPossibleNights,
      currentBookings: currentBookings.length,
      avgBookingValue,
      avgLengthOfStay,
      sourceBreakdown,
      topProperties,
    };
  }, [bookings, properties, selectedMonth]);

  const monthlyRevenueData = useMemo(() => {
    const data: { month: string; revenue: number; bookings: number }[] = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const monthLabel = date.toLocaleDateString('ru-RU', { month: 'short' });
      
      const monthBookings = bookings.filter((booking) => {
        const checkIn = new Date(booking.check_in);
        return checkIn >= date && checkIn <= monthEnd;
      });
      
      const revenue = monthBookings.reduce((sum, b) => sum + convertToRUB(b.total_price, b.currency), 0);
      
      data.push({
        month: monthLabel,
        revenue: Math.round(revenue),
        bookings: monthBookings.length,
      });
    }
    
    return data;
  }, [bookings]);

  const getSourceLabel = useCallback((source: string) => {
    const labels: { [key: string]: string } = {
      manual: t('sources.manual'),
      airbnb: t('sources.airbnb'),
      booking: t('sources.booking'),
      avito: t('sources.avito'),
      cian: t('sources.cian'),
    };
    return labels[source] || source;
  }, [t]);

  const sourceChartData = useMemo(() => {
    return Object.entries(analytics.sourceBreakdown).map(([source, revenue]) => ({
      name: getSourceLabel(source),
      value: Math.round(revenue),
    }));
  }, [analytics.sourceBreakdown, getSourceLabel]);

  const propertyOccupancyData = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const daysInMonth = monthEnd.getDate();

    return properties.map((property) => {
      const propertyBookings = bookings.filter((b) => {
        if (b.property_id !== property.id) return false;
        const checkIn = new Date(b.check_in);
        const checkOut = new Date(b.check_out);
        return (
          (checkIn >= monthStart && checkIn <= monthEnd) ||
          (checkOut >= monthStart && checkOut <= monthEnd) ||
          (checkIn <= monthStart && checkOut >= monthEnd)
        );
      });

      let occupiedNights = 0;
      propertyBookings.forEach((booking) => {
        const checkIn = new Date(booking.check_in);
        const checkOut = new Date(booking.check_out);
        const effectiveStart = checkIn > monthStart ? checkIn : monthStart;
        const effectiveEnd = checkOut < monthEnd ? checkOut : monthEnd;
        if (effectiveStart < effectiveEnd) {
          const nights = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24));
          occupiedNights += nights;
        }
      });

      const occupancy = Math.round((occupiedNights / daysInMonth) * 100);
      return {
        name: property.name.length > 15 ? property.name.substring(0, 15) + '...' : property.name,
        occupancy,
        nights: occupiedNights,
      };
    });
  }, [bookings, properties, selectedMonth]);

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

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg">
          <p className="text-slate-300 text-sm mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-white text-sm font-medium">
              {entry.name}: {formatCurrency(entry.value)} {entry.name === 'revenue' ? '₽' : ''}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white mb-1">{t('analytics.title')}</h1>
            <p className="text-slate-400 text-sm md:text-base">{t('analytics.subtitle')}</p>
          </div>

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            data-testid="select-month"
          >
            {months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <div className="bg-slate-800 rounded-lg p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 md:p-3 bg-teal-500/20 rounded-lg">
                <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-teal-400" />
              </div>
              {analytics.revenueChange !== 0 && (
                <div
                  className={`flex items-center gap-1 text-xs md:text-sm font-medium ${
                    analytics.revenueChange > 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {analytics.revenueChange > 0 ? (
                    <TrendingUp size={14} />
                  ) : (
                    <TrendingDown size={14} />
                  )}
                  {Math.abs(analytics.revenueChange).toFixed(1)}%
                </div>
              )}
            </div>
            <div className="text-lg md:text-2xl font-bold text-white mb-1">
              {formatCurrency(analytics.currentRevenue)} ₽
            </div>
            <div className="text-xs md:text-sm text-slate-400">{t('analytics.monthlyRevenue')}</div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 md:p-3 bg-blue-500/20 rounded-lg">
                <BedDouble className="w-5 h-5 md:w-6 md:h-6 text-blue-400" />
              </div>
              <span className="text-xs text-blue-400 font-medium">ADR</span>
            </div>
            <div className="text-lg md:text-2xl font-bold text-white mb-1">
              {formatCurrency(analytics.adr)} ₽
            </div>
            <div className="text-xs md:text-sm text-slate-400">{t('analytics.avgPricePerNight')}</div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 md:p-3 bg-purple-500/20 rounded-lg">
                <Home className="w-5 h-5 md:w-6 md:h-6 text-purple-400" />
              </div>
              <span className="text-xs text-purple-400 font-medium">RevPAR</span>
            </div>
            <div className="text-lg md:text-2xl font-bold text-white mb-1">
              {formatCurrency(analytics.revPar)} ₽
            </div>
            <div className="text-xs md:text-sm text-slate-400">{t('analytics.avgDailyRevenue')}</div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 md:p-3 bg-green-500/20 rounded-lg">
                <Percent className="w-5 h-5 md:w-6 md:h-6 text-green-400" />
              </div>
            </div>
            <div className="text-lg md:text-2xl font-bold text-white mb-1">
              {analytics.occupancyRate.toFixed(1)}%
            </div>
            <div className="text-xs md:text-sm text-slate-400">
              {t('analytics.occupancyRate')} ({analytics.occupiedNights}/{analytics.totalPossibleNights})
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-slate-800 rounded-lg p-4 md:p-6">
            <h3 className="text-lg font-semibold text-white mb-4">{t('analytics.revenueByMonth')}</h3>
            {monthlyRevenueData.length === 0 ? (
              <p className="text-slate-400 text-center py-8">{t('analytics.noData')}</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyRevenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                    <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" name={t('analytics.revenue')} fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-slate-800 rounded-lg p-4 md:p-6">
            <h3 className="text-lg font-semibold text-white mb-4">{t('analytics.revenueBySource')}</h3>
            {sourceChartData.length === 0 ? (
              <p className="text-slate-400 text-center py-8">{t('analytics.noDataForPeriod')}</p>
            ) : (
              <div className="h-64 flex items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {sourceChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`${formatCurrency(value)} ₽`, t('analytics.revenue')]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-slate-800 rounded-lg p-4 md:p-6">
            <h3 className="text-lg font-semibold text-white mb-4">{t('analytics.occupancyByProperty')}</h3>
            {propertyOccupancyData.length === 0 ? (
              <p className="text-slate-400 text-center py-8">{t('analytics.noData')}</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={propertyOccupancyData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" stroke="#9ca3af" fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={11} width={100} />
                    <Tooltip formatter={(value: number) => [`${value}%`, t('analytics.occupancyRate')]} />
                    <Bar dataKey="occupancy" name={t('analytics.occupancyRate')} fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-slate-800 rounded-lg p-4 md:p-6">
            <h3 className="text-lg font-semibold text-white mb-4">{t('analytics.topProperties')}</h3>
            {analytics.topProperties.length === 0 ? (
              <p className="text-slate-400 text-center py-8">{t('analytics.noDataForPeriod')}</p>
            ) : (
              <div className="space-y-3">
                {analytics.topProperties.map((item, idx) => {
                  const percentage = analytics.currentRevenue > 0 ? (item.revenue / analytics.currentRevenue) * 100 : 0;
                  return (
                    <div key={item.property!.id} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
                        <span className="text-slate-300 text-sm font-medium">{idx + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-white font-medium truncate max-w-[120px]">
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

        <div className="bg-slate-800 rounded-lg p-4 md:p-6">
          <h3 className="text-lg font-semibold text-white mb-4">{t('analytics.bookingsDynamics')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                <YAxis yAxisId="left" stroke="#9ca3af" fontSize={12} />
                <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="bookings" name={t('analytics.bookingsCount')} stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
                <Line yAxisId="right" type="monotone" dataKey="revenue" name={t('analytics.revenue')} stroke="#14b8a6" strokeWidth={2} dot={{ fill: '#14b8a6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
