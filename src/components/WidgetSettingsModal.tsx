import { BedDouble, TrendingUp, CalendarCheck, AlertCircle, BarChart2, Hash, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useWidgetStore, ALL_WIDGET_IDS, type WidgetId } from '@/stores/widgetStore';

interface WidgetMeta {
  id: WidgetId;
  labelKey: string;
  defaultLabel: string;
  descKey: string;
  defaultDesc: string;
  icon: React.ElementType;
  color: string;
}

const WIDGET_META: WidgetMeta[] = [
  {
    id: 'occupancy',
    labelKey: 'dashboard.occupancy',
    defaultLabel: 'Загрузка',
    descKey: 'widgets.occupancyDesc',
    defaultDesc: 'Процент занятости объектов за текущий месяц',
    icon: BedDouble,
    color: 'text-brand',
  },
  {
    id: 'revenue',
    labelKey: 'dashboard.revenue',
    defaultLabel: 'Выручка',
    descKey: 'widgets.revenueDesc',
    defaultDesc: 'Сумма выручки за текущий месяц',
    icon: TrendingUp,
    color: 'text-green-500',
  },
  {
    id: 'today_activity',
    labelKey: 'dashboard.todayActivity',
    defaultLabel: 'Сегодня',
    descKey: 'widgets.todayDesc',
    defaultDesc: 'Количество заездов и выездов сегодня',
    icon: CalendarCheck,
    color: 'text-blue-500',
  },
  {
    id: 'pending',
    labelKey: 'dashboard.pending',
    defaultLabel: 'Ожидают',
    descKey: 'widgets.pendingDesc',
    defaultDesc: 'Бронирования, ожидающие подтверждения',
    icon: AlertCircle,
    color: 'text-amber-500',
  },
  {
    id: 'adr',
    labelKey: 'widgets.adr',
    defaultLabel: 'ADR',
    descKey: 'widgets.adrDesc',
    defaultDesc: 'Средняя стоимость ночи за текущий месяц',
    icon: BarChart2,
    color: 'text-purple-500',
  },
  {
    id: 'bookings_count',
    labelKey: 'widgets.bookingsCount',
    defaultLabel: 'Брони',
    descKey: 'widgets.bookingsCountDesc',
    defaultDesc: 'Количество активных бронирований за месяц',
    icon: Hash,
    color: 'text-cyan-500',
  },
  {
    id: 'avg_stay',
    labelKey: 'widgets.avgStay',
    defaultLabel: 'Ср. срок',
    descKey: 'widgets.avgStayDesc',
    defaultDesc: 'Средняя продолжительность пребывания в ночах',
    icon: Clock,
    color: 'text-orange-500',
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WidgetSettingsModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { enabledWidgets, toggleWidget } = useWidgetStore();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('widgets.configure', { defaultValue: 'Настройка виджетов' })}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-2 mb-2">
          {t('widgets.configureDesc', { defaultValue: 'Выберите виджеты, которые будут отображаться на главном экране' })}
        </p>

        <div className="space-y-3">
          {ALL_WIDGET_IDS.map((id) => {
            const meta = WIDGET_META.find((m) => m.id === id)!;
            const Icon = meta.icon;
            const enabled = enabledWidgets.includes(id);

            return (
              <div
                key={id}
                className="flex items-center justify-between rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-none">
                      {t(meta.labelKey, { defaultValue: meta.defaultLabel })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t(meta.descKey, { defaultValue: meta.defaultDesc })}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={() => toggleWidget(id)}
                  aria-label={t(meta.labelKey, { defaultValue: meta.defaultLabel })}
                />
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
