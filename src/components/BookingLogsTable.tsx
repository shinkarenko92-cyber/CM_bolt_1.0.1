// Component for displaying booking logs in a table
import { useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import { BookingLog } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { isDemoExpired } from '@/utils/subscriptionLimits';

interface BookingLogsTableProps {
  logs: BookingLog[];
  loading?: boolean;
}

const actionBadgeVariant: Record<string, 'success' | 'secondary' | 'destructive' | 'warning' | 'outline'> = {
  create: 'success',
  update: 'secondary',
  delete: 'destructive',
  created: 'success',
  updated: 'secondary',
  deleted: 'destructive',
  status_changed: 'warning',
};

const actionLabels: Record<string, string> = {
  create: 'Создано',
  update: 'Обновлено',
  delete: 'Удалено',
  created: 'Создано', // Legacy support
  updated: 'Обновлено', // Legacy support
  deleted: 'Удалено', // Legacy support
  status_changed: 'Изменен статус',
};

export function BookingLogsTable({ logs, loading }: BookingLogsTableProps) {
  const { profile } = useAuth();
  const tier = profile?.subscription_tier ?? '';
  const isDemoActive = (tier === 'demo' || tier === 'trial') && profile && !isDemoExpired(profile);
  const canAccessLogs = ['pro', 'business', 'enterprise'].includes(tier) || isDemoActive;

  const [page, setPage] = useState(0);
  const pageSize = 10;
  const sortedLogs = useMemo(() => [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [logs]);
  const paginatedLogs = useMemo(() => sortedLogs.slice(page * pageSize, page * pageSize + pageSize), [sortedLogs, page, pageSize]);
  const totalPages = Math.ceil(sortedLogs.length / pageSize);

  const exportToCSV = () => {
    if (!canAccessLogs) {
      return;
    }

    const headers = ['Дата', 'Действие', 'Источник', 'Изменения'];
    const rows = logs.map((log) => {
      const timestamp = format(new Date(log.timestamp), 'dd.MM.yyyy HH:mm', { locale: ru });
      const action = actionLabels[log.action] || log.action;
      const source = log.source || 'manual';
      const changes = log.changes_json && Object.keys(log.changes_json).length > 0
        ? Object.entries(log.changes_json)
            .map(([field, change]) => {
              const fieldLabels: Record<string, string> = {
                guest_name: 'Имя гостя',
                guest_email: 'Email',
                guest_phone: 'Телефон',
                check_in: 'Заезд',
                check_out: 'Выезд',
                guests_count: 'Количество гостей',
                total_price: 'Цена',
                currency: 'Валюта',
                status: 'Статус',
                notes: 'Заметки',
                extra_services_amount: 'Доп. услуги',
                property_id: 'Объект',
              };
              const fieldLabel = fieldLabels[field] || field;
              const oldVal = change && change.old !== undefined ? String(change.old) : '—';
              const newVal = change && change.new !== undefined ? String(change.new) : '—';
              return `${fieldLabel}: ${oldVal} → ${newVal}`;
            })
            .join('; ')
        : '—';

      return [timestamp, action, source, changes];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `booking_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sourceLabels: Record<string, string> = {
    manual: 'Ручное',
    avito: 'Avito',
    cian: 'ЦИАН',
    booking: 'Booking.com',
    airbnb: 'Airbnb',
  };

  const formatChanges = (changes: Record<string, { old?: unknown; new?: unknown }> | null): string => {
    if (!changes || Object.keys(changes).length === 0) return '—';
    const fieldLabels: Record<string, string> = {
      guest_name: 'Имя гостя',
      guest_email: 'Email',
      guest_phone: 'Телефон',
      check_in: 'Заезд',
      check_out: 'Выезд',
      guests_count: 'Количество гостей',
      total_price: 'Цена',
      currency: 'Валюта',
      status: 'Статус',
      notes: 'Заметки',
      extra_services_amount: 'Доп. услуги',
      property_id: 'Объект',
    };
    return Object.entries(changes)
      .map(([field, change]) => {
        const label = fieldLabels[field] || field;
        const oldVal = change && change.old !== undefined ? String(change.old) : '—';
        const newVal = change && change.new !== undefined ? String(change.new) : '—';
        return `${label}: ${oldVal} → ${newVal}`;
      })
      .join('; ');
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {canAccessLogs && logs.length > 0 && (
          <div className="flex justify-end">
            <Button onClick={exportToCSV}>
              <Download className="h-4 w-4" />
              Экспорт CSV
            </Button>
          </div>
        )}
        <div className="relative min-w-0 overflow-x-auto">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 rounded-md">
              <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Дата</TableHead>
                <TableHead className="w-[150px]">Пользователь</TableHead>
                <TableHead className="w-[120px]">Действие</TableHead>
                <TableHead className="w-[120px]">Источник</TableHead>
                <TableHead>Изменения</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(log.timestamp), 'dd.MM.yyyy HH:mm', { locale: ru })}
                  </TableCell>
                  <TableCell>
                    {log.user_id ? (
                      <span className="text-muted-foreground">{log.user_id.substring(0, 8)}...</span>
                    ) : (
                      <span className="text-muted-foreground">Система</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={actionBadgeVariant[log.action] ?? 'outline'}>
                      {actionLabels[log.action] || log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{sourceLabels[log.source || 'manual'] || log.source}</Badge>
                  </TableCell>
                  <TableCell>
                    {log.changes_json && Object.keys(log.changes_json).length > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block max-w-[300px] truncate text-muted-foreground cursor-default">
                            {formatChanges(log.changes_json)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-md whitespace-pre-wrap">
                          {formatChanges(log.changes_json)}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {(totalPages > 1 || sortedLogs.length > 0) && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Всего: {sortedLogs.length}</span>
            {totalPages > 1 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                Назад
              </Button>
              <span className="py-2">
                {page + 1} / {totalPages}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                Вперёд
              </Button>
            </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
