import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, BedDouble, DollarSign, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import type { Booking, Property } from '@/lib/supabase';

const ROOMI_PRIMARY = '#0066FF';
const ROOMI_SUCCESS = 'hsl(var(--brand))';

const ANALYTICS_STATUSES = new Set(['confirmed', 'paid', 'completed']);

function convertToRUB(amount: number, currency: string): number {
  switch (currency?.toUpperCase()) {
    case 'EUR': return amount * 100;
    case 'USD': return amount * 92;
    default: return amount;
  }
}

export interface AnalyticsInsightsProps {
  bookings: Booking[];
  properties: Property[];
}

export function AnalyticsInsights({ bookings, properties }: AnalyticsInsightsProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');

  const analytics = useMemo(() => {
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;
    let prevStart: Date;
    let prevEnd: Date;

    switch (period) {
      case 'day':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodEnd = new Date(periodStart.getTime() + 86400000);
        prevStart = new Date(periodStart.getTime() - 86400000);
        prevEnd = new Date(periodStart);
        break;
      case 'week': {
        const dayOfWeek = now.getDay() || 7;
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
        periodEnd = new Date(periodStart.getTime() + 7 * 86400000);
        prevStart = new Date(periodStart.getTime() - 7 * 86400000);
        prevEnd = new Date(periodStart);
        break;
      }
      case 'year':
        periodStart = new Date(now.getFullYear(), 0, 1);
        periodEnd = new Date(now.getFullYear() + 1, 0, 1);
        prevStart = new Date(now.getFullYear() - 1, 0, 1);
        prevEnd = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    }

    const pStartStr = periodStart.toISOString().slice(0, 10);
    const pEndStr = periodEnd.toISOString().slice(0, 10);
    const prevStartStr = prevStart.toISOString().slice(0, 10);
    const prevEndStr = prevEnd.toISOString().slice(0, 10);

    const activeBookings = bookings.filter(b => ANALYTICS_STATUSES.has(b.status?.toLowerCase() ?? ''));

    const inPeriod = activeBookings.filter(b => {
      const ci = b.check_in?.slice(0, 10) ?? '';
      const co = b.check_out?.slice(0, 10) ?? '';
      return ci < pEndStr && co > pStartStr;
    });

    const inPrevPeriod = activeBookings.filter(b => {
      const ci = b.check_in?.slice(0, 10) ?? '';
      const co = b.check_out?.slice(0, 10) ?? '';
      return ci < prevEndStr && co > prevStartStr;
    });

    const daysInPeriod = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000));
    const totalPossibleNights = properties.length * daysInPeriod;

    let occupiedNights = 0;
    let revenue = 0;

    for (const b of inPeriod) {
      const ci = new Date(Math.max(new Date(b.check_in).getTime(), periodStart.getTime()));
      const co = new Date(Math.min(new Date(b.check_out).getTime(), periodEnd.getTime()));
      const nights = Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86400000));
      occupiedNights += nights;

      const totalNights = Math.max(1, Math.round(
        (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000
      ));
      const price = convertToRUB(b.total_price ?? 0, b.currency ?? 'RUB');
      revenue += (price / totalNights) * nights;
    }

    let prevRevenue = 0;
    for (const b of inPrevPeriod) {
      const ci = new Date(Math.max(new Date(b.check_in).getTime(), prevStart.getTime()));
      const co = new Date(Math.min(new Date(b.check_out).getTime(), prevEnd.getTime()));
      const nights = Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86400000));
      const totalNights = Math.max(1, Math.round(
        (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000
      ));
      const price = convertToRUB(b.total_price ?? 0, b.currency ?? 'RUB');
      prevRevenue += (price / totalNights) * nights;
    }

    const occupancy = totalPossibleNights > 0 ? Math.round((occupiedNights / totalPossibleNights) * 100) : 0;
    const adr = occupiedNights > 0 ? Math.round(revenue / occupiedNights) : 0;
    const revpar = totalPossibleNights > 0 ? Math.round(revenue / totalPossibleNights) : 0;
    const revenueChange = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;

    const weeklyData: { week: string; revenue: number }[] = [];
    const weeksCount = Math.min(4, Math.ceil(daysInPeriod / 7));
    for (let i = 0; i < weeksCount; i++) {
      const wStart = new Date(periodStart.getTime() + i * 7 * 86400000);
      const wEnd = new Date(Math.min(wStart.getTime() + 7 * 86400000, periodEnd.getTime()));
      const wStartStr = wStart.toISOString().slice(0, 10);
      const wEndStr = wEnd.toISOString().slice(0, 10);

      let wRevenue = 0;
      for (const b of inPeriod) {
        const ci = b.check_in?.slice(0, 10) ?? '';
        const co = b.check_out?.slice(0, 10) ?? '';
        if (ci < wEndStr && co > wStartStr) {
          const overlapStart = new Date(Math.max(new Date(ci).getTime(), wStart.getTime()));
          const overlapEnd = new Date(Math.min(new Date(co).getTime(), wEnd.getTime()));
          const nights = Math.max(0, Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86400000));
          const totalNights = Math.max(1, Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000));
          const price = convertToRUB(b.total_price ?? 0, b.currency ?? 'RUB');
          wRevenue += (price / totalNights) * nights;
        }
      }
      weeklyData.push({ week: `W${i + 1}`, revenue: Math.round(wRevenue / 1000) });
    }

    const propertyBookingsMap = new Map<string, number>();
    for (const b of inPeriod) {
      const pid = b.property_id;
      propertyBookingsMap.set(pid, (propertyBookingsMap.get(pid) ?? 0) + 1);
    }
    const propertyData = properties.slice(0, 6).map(p => ({
      name: (p.name ?? '').length > 10 ? (p.name ?? '').slice(0, 10) + '…' : (p.name ?? '—'),
      bookings: propertyBookingsMap.get(p.id) ?? 0,
    }));

    return { occupancy, adr, revpar, revenue: Math.round(revenue), revenueChange, weeklyData, propertyData };
  }, [bookings, properties, period]);

  const formatRevenue = (value: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);

  const TrendIcon = analytics.revenueChange >= 0 ? TrendingUp : TrendingDown;
  const trendColor = analytics.revenueChange >= 0 ? 'text-brand' : 'text-destructive';

  return (
    <div className="min-h-screen bg-background text-foreground pb-32">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="flex items-center justify-between p-4 max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#0066FF]/10">
              <BarChart3 className="size-5 text-[#0066FF]" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">{t('analytics.insightsTitle')}</h1>
          </div>
          <button
            type="button"
            className="size-10 flex items-center justify-center rounded-full bg-muted"
            aria-label="Notifications"
          >
            <Info className="size-5 text-muted-foreground" />
          </button>
        </div>
        <div className="max-w-lg mx-auto">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <TabsList className="w-full rounded-none border-0 bg-transparent p-0 h-auto gap-6 flex px-4">
              {(['day', 'week', 'month', 'year'] as const).map(p => (
                <TabsTrigger
                  key={p}
                  value={p}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0066FF] data-[state=active]:text-[#0066FF] data-[state=active]:shadow-none"
                >
                  {t(`analytics.${p}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="max-w-lg mx-auto">
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
          <Card className="border-[#0066FF]/10">
            <CardContent className="p-5 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <p className="text-muted-foreground text-sm font-medium">{t('analytics.occupancyRate')}</p>
                <BedDouble className="size-4 text-[#0066FF]" />
              </div>
              <p className="text-3xl font-extrabold tracking-tight">{analytics.occupancy}%</p>
              <Progress value={analytics.occupancy} className="h-2 mt-1 [&>div]:bg-[#0066FF]" />
            </CardContent>
          </Card>
          <Card className="border-[#0066FF]/10">
            <CardContent className="p-5 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <p className="text-muted-foreground text-sm font-medium">{t('analytics.adr')}</p>
                <DollarSign className="size-4 text-[#0066FF]" />
              </div>
              <p className="text-3xl font-extrabold tracking-tight">{formatRevenue(analytics.adr)}</p>
            </CardContent>
          </Card>
          <Card className="border-[#0066FF]/10">
            <CardContent className="p-5 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <p className="text-muted-foreground text-sm font-medium">{t('analytics.revpar')}</p>
                <BarChart3 className="size-4 text-[#0066FF]" />
              </div>
              <p className="text-3xl font-extrabold tracking-tight">{formatRevenue(analytics.revpar)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="px-4 py-2">
          <Card className="border-[#0066FF]/10">
            <CardContent className="p-6 flex flex-col gap-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">{t('analytics.revenueVsLastYear')}</p>
                  <p className="text-4xl font-extrabold tracking-tighter truncate">{formatRevenue(analytics.revenue)}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <TrendIcon className={`size-4 ${trendColor}`} />
                    <Badge
                      variant={analytics.revenueChange >= 0 ? 'default' : 'destructive'}
                      className="text-xs font-bold border-0"
                      style={analytics.revenueChange >= 0 ? { backgroundColor: `${ROOMI_SUCCESS}20`, color: ROOMI_SUCCESS } : undefined}
                    >
                      {analytics.revenueChange >= 0 ? '+' : ''}{analytics.revenueChange.toFixed(1)}%
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">{t('analytics.last30Days')}</p>
                </div>
              </div>
              <div className="min-h-[180px] w-full">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={analytics.weeklyData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ROOMI_PRIMARY} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={ROOMI_PRIMARY} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                    <YAxis hide />
                    <RechartsTooltip
                      formatter={(value: number | undefined) => [value != null ? `${value}K ₽` : '', t('analytics.revenue')]}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke={ROOMI_PRIMARY}
                      strokeWidth={2}
                      fill="url(#revenueGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="px-4 py-4">
          <Card className="border-[#0066FF]/10">
            <CardHeader className="flex flex-row justify-between items-center pb-2">
              <div>
                <CardTitle className="text-lg">{t('analytics.roomTypePerformance')}</CardTitle>
                <p className="text-muted-foreground text-sm font-medium">{t('analytics.bookingsByCategory')}</p>
              </div>
              <Info className="size-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height={192}>
                  <BarChart data={analytics.propertyData} margin={{ left: 8, right: 8 }} barCategoryGap="20%">
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground" />
                    <YAxis hide />
                    <RechartsTooltip
                      formatter={(value: number | undefined) => [value ?? 0, t('analytics.bookingsCount')]}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Bar dataKey="bookings" radius={[4, 4, 0, 0]} fill={ROOMI_PRIMARY} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
