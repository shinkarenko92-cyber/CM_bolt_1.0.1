import { useMemo, useState } from 'react';
import { CalendarCheck, TrendingUp, BedDouble, AlertCircle, Settings2, BarChart2, Hash, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { Booking, Property } from '@/lib/supabase';
import { useWidgetStore } from '@/stores/widgetStore';
import { WidgetSettingsModal } from '@/components/WidgetSettingsModal';

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
  const { enabledWidgets } = useWidgetStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    let totalStayNights = 0;
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
      totalStayNights += totalNights;
      const price = convertToRUB(b.total_price ?? 0, b.currency ?? 'RUB');
      revenue += (price / totalNights) * nights;
    }

    const occupancy = totalPossibleNights > 0 ? Math.round((occupiedNights / totalPossibleNights) * 100) : 0;

    const checkInsToday = activeBookings.filter(b => b.check_in?.slice(0, 10) === today).length;
    const checkOutsToday = activeBookings.filter(b => b.check_out?.slice(0, 10) === today).length;

    const pendingBookings = bookings.filter(b => b.status?.toLowerCase() === 'pending').length;

    const adr = occupiedNights > 0 ? Math.round(revenue / occupiedNights) : 0;
    const avgStay = monthBookings.length > 0 ? Math.round((totalStayNights / monthBookings.length) * 10) / 10 : 0;

    return {
      revenue,
      occupancy,
      checkInsToday,
      checkOutsToday,
      pendingBookings,
      adr,
      bookingsCount: monthBookings.length,
      avgStay,
    };
  }, [bookings, properties]);

  const allCards = [
    {
      id: 'occupancy' as const,
      label: t('dashboard.occupancy', { defaultValue: 'Загрузка' }),
      value: `${kpi.occupancy}%`,
      icon: BedDouble,
      color: 'text-brand',
    },
    {
      id: 'revenue' as const,
      label: t('dashboard.revenueMonth', { month: monthName, defaultValue: `Выручка ${monthName}` }),
      value: `${Math.round(kpi.revenue).toLocaleString('ru-RU')} ₽`,
      icon: TrendingUp,
      color: 'text-green-500',
    },
    {
      id: 'today_activity' as const,
      label: t('dashboard.todayActivity', { defaultValue: 'Сегодня' }),
      value: `${kpi.checkInsToday} / ${kpi.checkOutsToday}`,
      subtitle: t('dashboard.checkInOut', { defaultValue: 'заезд / выезд' }),
      icon: CalendarCheck,
      color: 'text-blue-500',
    },
    {
      id: 'pending' as const,
      label: t('dashboard.pending', { defaultValue: 'Ожидают' }),
      value: String(kpi.pendingBookings),
      icon: AlertCircle,
      color: 'text-amber-500',
    },
    {
      id: 'adr' as const,
      label: t('widgets.adr', { defaultValue: 'ADR' }),
      value: `${kpi.adr.toLocaleString('ru-RU')} ₽`,
      subtitle: t('widgets.adrPerNight', { defaultValue: 'за ночь' }),
      icon: BarChart2,
      color: 'text-purple-500',
    },
    {
      id: 'bookings_count' as const,
      label: t('widgets.bookingsCount', { defaultValue: 'Брони' }),
      value: String(kpi.bookingsCount),
      subtitle: t('widgets.bookingsCountMonth', { defaultValue: 'за месяц' }),
      icon: Hash,
      color: 'text-cyan-500',
    },
    {
      id: 'avg_stay' as const,
      label: t('widgets.avgStay', { defaultValue: 'Ср. срок' }),
      value: `${kpi.avgStay}`,
      subtitle: t('widgets.avgStayNights', { defaultValue: 'ночей' }),
      icon: Clock,
      color: 'text-orange-500',
    },
  ];

  const visibleCards = allCards.filter(card => enabledWidgets.includes(card.id));

  return (
    <>
      <div className="px-4 md:px-6 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {visibleCards.map((card) => (
            <Card key={card.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {card.label}
                  </span>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                {'subtitle' in card && card.subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-end mt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5 h-7 px-2"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t('widgets.configure', { defaultValue: 'Настроить виджеты' })}
          </Button>
        </div>
      </div>

      <WidgetSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
