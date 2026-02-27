import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, BedDouble, DollarSign, TrendingUp, Info } from 'lucide-react';
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
const ROOMI_SUCCESS = '#10B981';

const mockOccupancy = 84;
const mockADR = 185;
const mockRevPAR = 155;
const mockRevenue = 124500;
const mockTrend = 12;

const mockRevenueChartData = [
  { week: 'W1', revenue: 28 },
  { week: 'W2', revenue: 45 },
  { week: 'W3', revenue: 33 },
  { week: 'W4', revenue: 121 },
];

const mockRoomTypeData = [
  { name: 'Deluxe', bookings: 30 },
  { name: 'Suite', bookings: 65 },
  { name: 'Standard', bookings: 90 },
  { name: 'Family', bookings: 50 },
];

export interface AnalyticsInsightsProps {
  bookings: Booking[];
  properties: Property[];
}

export function AnalyticsInsights({ bookings, properties }: AnalyticsInsightsProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');

  const hasData = bookings.length > 0 || properties.length > 0;
  const occupancy = hasData ? mockOccupancy : mockOccupancy;
  const adr = hasData ? mockADR : mockADR;
  const revpar = hasData ? mockRevPAR : mockRevPAR;
  const revenue = hasData ? mockRevenue : mockRevenue;
  const trend = hasData ? mockTrend : mockTrend;

  const formatRevenue = (value: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

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
              <TabsTrigger value="day" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0066FF] data-[state=active]:text-[#0066FF] data-[state=active]:shadow-none">
                {t('analytics.day')}
              </TabsTrigger>
              <TabsTrigger value="week" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0066FF] data-[state=active]:text-[#0066FF] data-[state=active]:shadow-none">
                {t('analytics.week')}
              </TabsTrigger>
              <TabsTrigger value="month" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0066FF] data-[state=active]:text-[#0066FF] data-[state=active]:shadow-none font-bold">
                {t('analytics.month')}
              </TabsTrigger>
              <TabsTrigger value="year" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0066FF] data-[state=active]:text-[#0066FF] data-[state=active]:shadow-none">
                {t('analytics.year')}
              </TabsTrigger>
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
              <p className="text-3xl font-extrabold tracking-tight">{occupancy}%</p>
              <div className="flex items-center gap-1">
                <TrendingUp className="size-4 text-[#10B981]" />
                <Badge variant="success" className="text-xs font-bold border-0" style={{ backgroundColor: `${ROOMI_SUCCESS}20`, color: ROOMI_SUCCESS }}>
                  +{trend.toFixed(1)}%
                </Badge>
              </div>
              <Progress value={occupancy} className="h-2 mt-1 [&>div]:bg-[#0066FF]" />
            </CardContent>
          </Card>
          <Card className="border-[#0066FF]/10">
            <CardContent className="p-5 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <p className="text-muted-foreground text-sm font-medium">{t('analytics.adr')}</p>
                <DollarSign className="size-4 text-[#0066FF]" />
              </div>
              <p className="text-3xl font-extrabold tracking-tight">{formatRevenue(adr)}</p>
              <div className="flex items-center gap-1">
                <TrendingUp className="size-4 text-[#10B981]" />
                <span className="text-sm font-bold text-[#10B981]">+1.5%</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-[#0066FF]/10">
            <CardContent className="p-5 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <p className="text-muted-foreground text-sm font-medium">{t('analytics.revpar')}</p>
                <BarChart3 className="size-4 text-[#0066FF]" />
              </div>
              <p className="text-3xl font-extrabold tracking-tight">{formatRevenue(revpar)}</p>
              <div className="flex items-center gap-1">
                <TrendingUp className="size-4 text-[#10B981]" />
                <span className="text-sm font-bold text-[#10B981]">+3.8%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="px-4 py-2">
          <Card className="border-[#0066FF]/10">
            <CardContent className="p-6 flex flex-col gap-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">{t('analytics.revenueVsLastYear')}</p>
                  <p className="text-4xl font-extrabold tracking-tighter truncate">{formatRevenue(revenue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[#10B981] text-sm font-bold">+{trend}%</p>
                  <p className="text-muted-foreground text-xs">{t('analytics.last30Days')}</p>
                </div>
              </div>
              <div className="min-h-[180px] w-full">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={mockRevenueChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ROOMI_PRIMARY} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={ROOMI_PRIMARY} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                    <YAxis hide />
                    <RechartsTooltip
                      formatter={(value: number | undefined) => [value != null ? formatRevenue(value * 1000) : '', t('analytics.revenue')]}
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
                  <BarChart data={mockRoomTypeData} margin={{ left: 8, right: 8 }} barCategoryGap="20%">
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
