import { useMemo } from 'react';
import { CalendarCheck, TrendingUp, BedDouble, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import type { Booking, Property } from '@/lib/supabase';

interface DashboardKPIProps {
  bookings: Booking[];
  properties: Property[];
}

const ANALYTICS_STATUSES = new Set(['confirmed', 'paid', 'completed']);

function convertToRUB(amount: number, currency: string): number {
  switch (currency?.toUpperCase()) {
    case 'EUR': return amount * 100;
    case 'USD': return amount * 92;
    default: return amount;
  }
}

export function DashboardKPI({ bookings, properties }: DashboardKPIProps) {
  const { t, i18n } = useTranslation();
  const monthName = new Date().toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', { month: 'long' });

  const kpi = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const today = now.toISOString().slice(0, 10);

    const activeBookings = bookings.filter(b => ANALYTICS_STATUSES.has(b.status?.toLowerCase() ?? ''));

    const monthBookings = activeBookings.filter(b => {
      const ci = b.check_in?.slice(0, 10) ?? '';
      const co = b.check_out?.slice(0, 10) ?? '';
      return ci <= monthEnd.toISOString().slice(0, 10) && co > monthStart.toISOString().slice(0, 10);
    });

    let revenue = 0;
    let occupiedNights = 0;
    const totalDays = monthEnd.getDate();
    const totalPossibleNights = properties.length * totalDays;

    for (const b of monthBookings) {
      const ci = new Date(Math.max(new Date(b.check_in).getTime(), monthStart.getTime()));
      const co = new Date(Math.min(new Date(b.check_out).getTime(), monthEnd.getTime() + 86400000));
      const nights = Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86400000));
      occupiedNights += nights;

      const totalNights = Math.max(1, Math.round(
        (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000
      ));
      const price = convertToRUB(b.total_price ?? 0, b.currency ?? 'RUB');
      revenue += (price / totalNights) * nights;
    }

    const occupancy = totalPossibleNights > 0 ? Math.round((occupiedNights / totalPossibleNights) * 100) : 0;

    const checkInsToday = activeBookings.filter(b => b.check_in?.slice(0, 10) === today).length;
    const checkOutsToday = activeBookings.filter(b => b.check_out?.slice(0, 10) === today).length;

    const pendingBookings = bookings.filter(b => b.status?.toLowerCase() === 'pending').length;

    return { revenue, occupancy, checkInsToday, checkOutsToday, pendingBookings };
  }, [bookings, properties]);

  const cards = [
    {
      label: t('dashboard.occupancy', { defaultValue: 'Загрузка' }),
      value: `${kpi.occupancy}%`,
      icon: BedDouble,
      color: 'text-brand',
    },
    {
      label: t('dashboard.revenueMonth', { month: monthName, defaultValue: `Выручка ${monthName}` }),
      value: `${Math.round(kpi.revenue).toLocaleString('ru-RU')} ₽`,
      icon: TrendingUp,
      color: 'text-green-500',
    },
    {
      label: t('dashboard.todayActivity', { defaultValue: 'Сегодня' }),
      value: `${kpi.checkInsToday} / ${kpi.checkOutsToday}`,
      subtitle: t('dashboard.checkInOut', { defaultValue: 'заезд / выезд' }),
      icon: CalendarCheck,
      color: 'text-blue-500',
    },
    ...(kpi.pendingBookings > 0 ? [{
      label: t('dashboard.pending', { defaultValue: 'Ожидают' }),
      value: String(kpi.pendingBookings),
      icon: AlertCircle,
      color: 'text-amber-500',
    }] : []),
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 px-4 md:px-6">
      {cards.map((card) => (
        <Card key={card.label} className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {card.label}
              </span>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{card.value}</p>
            {'subtitle' in card && card.subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
