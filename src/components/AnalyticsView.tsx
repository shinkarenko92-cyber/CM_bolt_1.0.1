import { useMemo, useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Percent, Home, BedDouble, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Booking, Property } from '../lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
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

const CHART_HEIGHT = 256;

/** Статусы бронирований, учитываемые в аналитике (confirmed, paid, completed) */
const ANALYTICS_BOOKING_STATUSES = new Set(['confirmed', 'paid', 'completed']);

interface AnalyticsViewProps {
  bookings: Booking[];
  properties: Property[];
}

const COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#22c55e'];

type DateRangeType = 'month' | 'custom';
type ComparisonMode = 'sply' | 'previous_month' | 'none';

export function AnalyticsView({ bookings, properties }: AnalyticsViewProps) {
  const { t } = useTranslation();
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [customStartDate, setCustomStartDate] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return start.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('sply');
  const [bookingsDynamicsPeriod, setBookingsDynamicsPeriod] = useState<'month' | 'halfYear'>('month');

  const convertToRUB = (amount: number, currency: string) => {
    const rates: { [key: string]: number } = {
      RUB: 1,
      EUR: 100,
      USD: 92,
    };
    return amount * (rates[currency] || 1);
  };

  // Полный месяц: 1-е число — последний день месяца (все брони, включая будущие)
  const dateRange = useMemo(() => {
    if (dateRangeType === 'custom') {
      return {
        start: new Date(customStartDate + 'T00:00:00'),
        end: new Date(customEndDate + 'T23:59:59'),
      };
    }
    const [year, month] = selectedMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1, 0, 0, 0);
    const lastDay = new Date(year, month, 0).getDate();
    const end = new Date(year, month - 1, lastDay, 23, 59, 59);
    return { start, end };
  }, [dateRangeType, selectedMonth, customStartDate, customEndDate]);

  const analytics = useMemo(() => {
    const { start: currentStart, end: currentEnd } = dateRange;

    // Только подтверждённые/оплаченные/завершённые брони
    const activeBookings = bookings.filter((b) =>
      ANALYTICS_BOOKING_STATUSES.has((b.status || '').toLowerCase())
    );

    // Период сравнения: SPLY (тот же период прошлый год) или тот же период предыдущий месяц
    const daysInPeriod = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    let comparisonStart: Date;
    let comparisonEnd: Date;

    if (comparisonMode === 'sply') {
      comparisonStart = new Date(currentStart);
      comparisonStart.setFullYear(comparisonStart.getFullYear() - 1);
      const lastDayPrevYear = new Date(comparisonStart.getFullYear(), comparisonStart.getMonth() + 1, 0).getDate();
      comparisonEnd = new Date(comparisonStart.getFullYear(), comparisonStart.getMonth(), lastDayPrevYear, 23, 59, 59);
    } else if (comparisonMode === 'previous_month') {
      comparisonStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1, 0, 0, 0);
      const lastDayPrevMonth = new Date(comparisonStart.getFullYear(), comparisonStart.getMonth() + 1, 0).getDate();
      const prevEndDay = Math.min(daysInPeriod, lastDayPrevMonth);
      comparisonEnd = new Date(comparisonStart.getFullYear(), comparisonStart.getMonth(), prevEndDay, 23, 59, 59);
    } else {
      comparisonStart = new Date(0);
      comparisonEnd = new Date(0);
    }

    // Бронирование пересекается с периодом: check_in ≤ periodEnd и check_out > periodStart
    const filterBookingsByDateRange = (start: Date, end: Date) => {
      return activeBookings.filter((booking) => {
        const checkIn = new Date(booking.check_in);
        const checkOut = new Date(booking.check_out);
        return checkIn <= end && checkOut > start;
      });
    };

    const getProportionalRevenue = (booking: Booking, start: Date, end: Date): number => {
      const checkIn = new Date(booking.check_in);
      const checkOut = new Date(booking.check_out);
      const totalNights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      const effectiveStart = checkIn > start ? checkIn : start;
      const effectiveEnd = checkOut < end ? checkOut : end;
      let nightsInPeriod = 0;
      if (effectiveStart < effectiveEnd) {
        nightsInPeriod = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24));
      }
      const totalRevenue = convertToRUB(booking.total_price, booking.currency);
      return totalNights > 0 ? (totalRevenue / totalNights) * nightsInPeriod : 0;
    };

    const calculateRevenue = (list: Booking[], start: Date, end: Date) =>
      list.reduce((sum, b) => sum + getProportionalRevenue(b, start, end), 0);

    const calculateOccupiedNights = (list: Booking[], start: Date, end: Date) => {
      let total = 0;
      list.forEach((booking) => {
        const checkIn = new Date(booking.check_in);
        const checkOut = new Date(booking.check_out);
        const effectiveStart = checkIn > start ? checkIn : start;
        const effectiveEnd = checkOut < end ? checkOut : end;
        if (effectiveStart < effectiveEnd) {
          total += Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24));
        }
      });
      return total;
    };

    const currentBookings = filterBookingsByDateRange(currentStart, currentEnd);
    const currentRevenue = calculateRevenue(currentBookings, currentStart, currentEnd);
    const occupiedNights = calculateOccupiedNights(currentBookings, currentStart, currentEnd);
    const totalPossibleNights = properties.length > 0 ? properties.length * daysInPeriod : daysInPeriod;
    const occupancyRate = totalPossibleNights > 0 ? (occupiedNights / totalPossibleNights) * 100 : 0;

    const adr = occupiedNights > 0 ? currentRevenue / occupiedNights : 0;
    const revPar = totalPossibleNights > 0 ? currentRevenue / totalPossibleNights : 0;
    const avgPricePerNight = adr;
    const dailyAvgRevenue = daysInPeriod > 0 ? currentRevenue / daysInPeriod : 0;
    const avgBookingValue = currentBookings.length > 0 ? currentRevenue / currentBookings.length : 0;

    const totalNightsBooked = currentBookings.reduce((sum, b) => {
      const checkIn = new Date(b.check_in);
      const checkOut = new Date(b.check_out);
      return sum + Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    }, 0);
    const avgLengthOfStay = currentBookings.length > 0 ? totalNightsBooked / currentBookings.length : 0;

    let previousRevenue = 0;
    let revenueChange: number | null = null;
    let comparisonBookings: Booking[] = [];
    let comparisonRevenue = 0;
    let comparisonOccupancyRate = 0;

    if (comparisonMode !== 'none' && comparisonEnd > comparisonStart) {
      comparisonBookings = filterBookingsByDateRange(comparisonStart, comparisonEnd);
      previousRevenue = calculateRevenue(comparisonBookings, comparisonStart, comparisonEnd);
      if (previousRevenue > 0) {
        revenueChange = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
      }
      comparisonRevenue = previousRevenue;
      const compOccupied = calculateOccupiedNights(comparisonBookings, comparisonStart, comparisonEnd);
      const compDays = Math.ceil((comparisonEnd.getTime() - comparisonStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const compPossible = properties.length * compDays;
      comparisonOccupancyRate = compPossible > 0 ? (compOccupied / compPossible) * 100 : 0;
    }

    const mapSourceToStandard = (source: string): string => {
      const normalized = source.toLowerCase().trim().replace(/\s+/g, '');
      const sourceMap: { [key: string]: string } = {
        'авито': 'avito', avito: 'avito', booking: 'booking', 'booking.com': 'booking',
        airbnb: 'airbnb', cian: 'cian', 'циан': 'cian', manual: 'manual', 'вручную': 'manual',
        excel_import: 'manual',
      };
      if (sourceMap[normalized]) return sourceMap[normalized];
      for (const [key, value] of Object.entries(sourceMap)) {
        if (normalized.includes(key) || key.includes(normalized)) return value;
      }
      return source === 'excel_import' ? 'manual' : source;
    };

    const sourceBreakdown = currentBookings.reduce((acc, booking) => {
      const revenue = getProportionalRevenue(booking, currentStart, currentEnd);
      const mappedSource = mapSourceToStandard(booking.source);
      acc[mappedSource] = (acc[mappedSource] || 0) + revenue;
      return acc;
    }, {} as { [key: string]: number });

    const propertyBreakdown = currentBookings.reduce((acc, booking) => {
      const revenue = getProportionalRevenue(booking, currentStart, currentEnd);
      acc[booking.property_id] = (acc[booking.property_id] || 0) + revenue;
      return acc;
    }, {} as { [key: string]: number });

    const topProperties = Object.entries(propertyBreakdown)
      .map(([id, revenue]) => ({ property: properties.find((p) => p.id === id), revenue }))
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
      daysInPeriod,
      currentBookings: currentBookings.length,
      avgBookingValue,
      avgLengthOfStay,
      sourceBreakdown,
      topProperties,
      comparisonBookings,
      comparisonRevenue,
      comparisonOccupancyRate,
    };
  }, [bookings, properties, dateRange, comparisonMode]);

  // Helper function to calculate proportional revenue for a single booking
  const getProportionalRevenue = useCallback((booking: Booking, start: Date, end: Date): number => {
    const checkIn = new Date(booking.check_in);
    const checkOut = new Date(booking.check_out);
    
    // Calculate total nights in booking
    const totalNights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    
    // Calculate nights within the period
    const effectiveStart = checkIn > start ? checkIn : start;
    const effectiveEnd = checkOut < end ? checkOut : end;
    
    let nightsInPeriod = 0;
    if (effectiveStart < effectiveEnd) {
      const diffTime = effectiveEnd.getTime() - effectiveStart.getTime();
      nightsInPeriod = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    
    // Calculate proportional revenue for nights in period
    const totalRevenue = convertToRUB(booking.total_price, booking.currency);
    const proportionalRevenue = totalNights > 0 ? (totalRevenue / totalNights) * nightsInPeriod : 0;
    
    return proportionalRevenue;
  }, []);

  const monthlyRevenueData = useMemo(() => {
    const data: { month: string; revenue: number; bookings: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
      const monthLabel = date.toLocaleDateString('ru-RU', { month: 'short' });

      const monthBookings = bookings.filter((booking) => {
        const checkIn = new Date(booking.check_in);
        const checkOut = new Date(booking.check_out);
        return (
          (checkIn >= date && checkIn <= monthEnd) ||
          (checkOut >= date && checkOut <= monthEnd) ||
          (checkIn <= date && checkOut >= monthEnd)
        );
      });

      const revenue = monthBookings.reduce((sum, b) => sum + getProportionalRevenue(b, date, monthEnd), 0);

      data.push({
        month: monthLabel,
        revenue: Math.round(revenue),
        bookings: monthBookings.length,
      });
    }

    return data;
  }, [bookings, getProportionalRevenue]);

  // Data for bookings dynamics chart (month by days or half year by months)
  const bookingsDynamicsData = useMemo(() => {
    const now = new Date();
    const data: { month: string; date: string; revenue: number; bookings: number }[] = [];

    if (bookingsDynamicsPeriod === 'month') {
      // Show data by days for current month
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

      for (let day = 1; day <= daysInMonth; day++) {
        const dayStart = new Date(currentYear, currentMonth, day, 0, 0, 0);
        const dayEnd = new Date(currentYear, currentMonth, day, 23, 59, 59);
        const dayLabel = `${day}`;
        const dateLabel = dayStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

        const dayBookings = bookings.filter((booking) => {
          const checkIn = new Date(booking.check_in);
          const checkOut = new Date(booking.check_out);
          return (
            (checkIn >= dayStart && checkIn <= dayEnd) ||
            (checkOut >= dayStart && checkOut <= dayEnd) ||
            (checkIn <= dayStart && checkOut >= dayEnd)
          );
        });

        const revenue = dayBookings.reduce((sum, b) => sum + getProportionalRevenue(b, dayStart, dayEnd), 0);

        data.push({
          month: dayLabel,
          date: dateLabel,
          revenue: Math.round(revenue),
          bookings: dayBookings.length,
        });
      }
    } else {
      // Show data by months for last 6 months
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
        const monthLabel = date.toLocaleDateString('ru-RU', { month: 'short' });

        const monthBookings = bookings.filter((booking) => {
          const checkIn = new Date(booking.check_in);
          const checkOut = new Date(booking.check_out);
          return (
            (checkIn >= date && checkIn <= monthEnd) ||
            (checkOut >= date && checkOut <= monthEnd) ||
            (checkIn <= date && checkOut >= monthEnd)
          );
        });

        const revenue = monthBookings.reduce((sum, b) => sum + getProportionalRevenue(b, date, monthEnd), 0);

        data.push({
          month: monthLabel,
          date: monthLabel,
          revenue: Math.round(revenue),
          bookings: monthBookings.length,
        });
      }
    }

    return data;
  }, [bookings, bookingsDynamicsPeriod, getProportionalRevenue]);

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
    const { start: monthStart, end: monthEnd } = dateRange;
    const daysInPeriod = Math.ceil((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

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
      let revenue = 0;
      propertyBookings.forEach((booking) => {
        const checkIn = new Date(booking.check_in);
        const checkOut = new Date(booking.check_out);
        const effectiveStart = checkIn > monthStart ? checkIn : monthStart;
        const effectiveEnd = checkOut < monthEnd ? checkOut : monthEnd;
        if (effectiveStart < effectiveEnd) {
          const nights = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24));
          occupiedNights += nights;
        }
        // Calculate proportional revenue for this booking
        revenue += getProportionalRevenue(booking, monthStart, monthEnd);
      });

      const occupancy = Math.round((occupiedNights / daysInPeriod) * 100);
      return {
        name: property.name.length > 15 ? property.name.substring(0, 15) + '...' : property.name,
        occupancy,
        nights: occupiedNights,
        revenue: Math.round(revenue),
      };
    });
  }, [bookings, properties, dateRange, getProportionalRevenue]);

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
        <div className="rounded-md border border-border bg-popover p-3 shadow-md">
          <p className="text-muted-foreground text-sm mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-foreground text-sm font-medium">
              {entry.name}: {formatCurrency(entry.value)} {entry.name === 'revenue' ? '₽' : ''}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderCustomLegend = () => (
    <div className="flex flex-wrap justify-center gap-3 mt-4">
      {sourceChartData.map((entry, index) => (
        <div key={entry.name} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
          <span className="text-sm text-muted-foreground">{entry.name}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 bg-background">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">{t('analytics.title')}</h1>
            <p className="text-muted-foreground text-sm md:text-base mt-1">{t('analytics.subtitle')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={dateRangeType} onValueChange={(v) => setDateRangeType(v as DateRangeType)}>
              <TabsList className="bg-muted">
                <TabsTrigger value="month">Месяц</TabsTrigger>
                <TabsTrigger value="custom" className="gap-1">
                  <Calendar className="h-4 w-4" />
                  Период
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {dateRangeType === 'month' ? (
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[200px] h-10" data-testid="select-month">
                  <SelectValue placeholder="Месяц" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-10 w-[140px]"
                />
                <span className="text-muted-foreground">—</span>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-10 w-[140px]"
                />
              </div>
            )}

            <Select value={comparisonMode} onValueChange={(v) => setComparisonMode(v as ComparisonMode)}>
              <SelectTrigger className="w-[220px] h-10" aria-label={t('analytics.compareWith')}>
                <SelectValue placeholder={t('analytics.compareWith')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sply">{t('analytics.compareSply')}</SelectItem>
                <SelectItem value="previous_month">{t('analytics.comparePreviousMonth')}</SelectItem>
                <SelectItem value="none">{t('analytics.compareNone')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 cursor-help" title={t('analytics.monthlyRevenueTooltip')}>
                  <DollarSign className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                </div>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('analytics.monthlyRevenue')}
                </CardTitle>
              </div>
              <div className="flex items-center gap-1">
                {analytics.revenueChange !== null && analytics.revenueChange !== undefined ? (
                  <span
                    className={`flex items-center gap-0.5 text-xs md:text-sm font-medium ${
                      analytics.revenueChange > 0 ? 'text-green-500' : analytics.revenueChange < 0 ? 'text-destructive' : 'text-muted-foreground'
                    }`}
                  >
                    {analytics.revenueChange > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {Math.abs(analytics.revenueChange).toFixed(1)}%
                  </span>
                ) : comparisonMode !== 'none' ? (
                  <span className="text-xs text-muted-foreground">{t('analytics.noComparisonData')}</span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-lg md:text-2xl font-bold">{formatCurrency(analytics.currentRevenue)} ₽</p>
              {comparisonMode !== 'none' && analytics.comparisonRevenue > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {comparisonMode === 'sply' ? t('analytics.compareSply') : t('analytics.comparePreviousMonth')}: {formatCurrency(analytics.comparisonRevenue)} ₽
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('analytics.avgPricePerNight')}</CardTitle>
              <div className="p-2 rounded-lg bg-blue-500/10 cursor-help" title={t('analytics.adrTooltip')}>
                <BedDouble className="h-5 w-5 md:h-6 md:w-6 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-lg md:text-2xl font-bold">{formatCurrency(analytics.adr)} ₽</p>
              <span className="text-xs text-blue-500 font-medium">ADR</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('analytics.avgDailyRevenue')}</CardTitle>
              <div className="p-2 rounded-lg bg-purple-500/10 cursor-help" title={t('analytics.revParTooltip')}>
                <Home className="h-5 w-5 md:h-6 md:w-6 text-purple-500" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-lg md:text-2xl font-bold">{formatCurrency(analytics.revPar)} ₽</p>
              <span className="text-xs text-purple-500 font-medium">RevPAR</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('analytics.occupancyRate')}</CardTitle>
              <div className="p-2 rounded-lg bg-green-500/10 cursor-help" title={t('analytics.occupancyRateTooltip')}>
                <Percent className="h-5 w-5 md:h-6 md:w-6 text-green-500" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-lg md:text-2xl font-bold">{analytics.occupancyRate.toFixed(1)}%</p>
              {comparisonMode !== 'none' && analytics.comparisonRevenue > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {comparisonMode === 'sply' ? t('analytics.compareSply') : t('analytics.comparePreviousMonth')}: {analytics.comparisonOccupancyRate.toFixed(1)}%
                </p>
              )}
              <CardDescription className="mt-1">
                {analytics.occupiedNights}/{analytics.totalPossibleNights}
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('analytics.revenueByMonth')}</CardTitle>
            </CardHeader>
            <CardContent>
            {monthlyRevenueData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">{t('analytics.noData')}</p>
            ) : (
              <div className="w-full min-w-0" style={{ minHeight: CHART_HEIGHT }}>
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('analytics.revenueBySource')}</CardTitle>
            </CardHeader>
            <CardContent>
            {sourceChartData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">{t('analytics.noDataForPeriod')}</p>
            ) : (
              <div className="h-48 min-h-48 md:h-64 md:min-h-64 flex flex-col w-full min-w-0">
                <div className="flex-1 min-w-0" style={{ minHeight: CHART_HEIGHT }}>
                  <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                    <PieChart>
                      <Pie
                        data={sourceChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {sourceChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number | undefined) => value !== undefined ? [`${formatCurrency(value)} ₽`, t('analytics.revenue')] : ['', '']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {renderCustomLegend()}
              </div>
            )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('analytics.occupancyByProperty')}</CardTitle>
            </CardHeader>
            <CardContent>
            {propertyOccupancyData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">{t('analytics.noData')}</p>
            ) : (
              <div className="w-full min-w-0" style={{ minHeight: CHART_HEIGHT }}>
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <BarChart data={propertyOccupancyData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" stroke="#9ca3af" fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={11} width={100} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-md border border-border bg-popover p-3 shadow-md">
                              <p className="text-muted-foreground text-sm mb-1">{data.name}</p>
                              <p className="text-foreground text-sm font-medium">
                                {t('analytics.occupancyRate')}: {data.occupancy}%
                              </p>
                              <p className="text-foreground text-sm font-medium">
                                {t('analytics.revenue')}: {formatCurrency(data.revenue)} ₽
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="occupancy" name={t('analytics.occupancyRate')} fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('analytics.topProperties')}</CardTitle>
            </CardHeader>
            <CardContent>
            {analytics.topProperties.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">{t('analytics.noDataForPeriod')}</p>
            ) : (
              <div className="space-y-3">
                {analytics.topProperties.map((item, idx) => {
                  const percentage = analytics.currentRevenue > 0 ? (item.revenue / analytics.currentRevenue) * 100 : 0;
                  return (
                    <div key={item.property!.id} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                        <span className="text-muted-foreground text-sm font-medium">{idx + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate max-w-[120px]">
                            {item.property!.name}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {formatCurrency(item.revenue)} ₽
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-primary to-blue-500 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t('analytics.bookingsDynamics')}</CardTitle>
            <Tabs value={bookingsDynamicsPeriod} onValueChange={(v) => setBookingsDynamicsPeriod(v as 'month' | 'halfYear')}>
              <TabsList className="bg-muted">
                <TabsTrigger value="month">Месяц</TabsTrigger>
                <TabsTrigger value="halfYear">Полгода</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
          <div className="w-full min-w-0" style={{ minHeight: CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={bookingsDynamicsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="month" 
                  stroke="#9ca3af" 
                  fontSize={12}
                  angle={bookingsDynamicsPeriod === 'month' ? -45 : 0}
                  textAnchor={bookingsDynamicsPeriod === 'month' ? 'end' : 'middle'}
                  height={bookingsDynamicsPeriod === 'month' ? 60 : 30}
                  interval={bookingsDynamicsPeriod === 'month' ? Math.ceil(bookingsDynamicsData.length / 10) : 0}
                />
                <YAxis yAxisId="left" stroke="#9ca3af" fontSize={12} />
                <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-md border border-border bg-popover p-3 shadow-md">
                          <p className="text-muted-foreground text-sm mb-1">{data.date || label}</p>
                          {payload.map((entry, index) => (
                            <p key={index} className="text-foreground text-sm font-medium">
                              {entry.name}: {entry.name === t('analytics.revenue') ? formatCurrency(entry.value as number) + ' ₽' : entry.value}
                            </p>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="bookings" name={t('analytics.bookingsCount')} stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
                <Line yAxisId="right" type="monotone" dataKey="revenue" name={t('analytics.revenue')} stroke="#14b8a6" strokeWidth={2} dot={{ fill: '#14b8a6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
