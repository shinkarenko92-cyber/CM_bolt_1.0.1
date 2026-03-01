/**
 * Subscribes to avito_logs (errors) via Realtime and shows toast + journal dialog.
 * Mount inside SyncLogProvider when user is authenticated.
 */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSyncLog } from '@/contexts/SyncLogContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

type AvitoLogRow = {
  id: string;
  integration_id: string;
  property_id: string;
  action: string;
  status: string;
  error: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  properties?: { name: string } | null;
};

const ACTION_LABELS: Record<string, string> = {
  sync: 'Синхронизация (цены/календарь)',
  sync_bookings: 'Загрузка бронирований',
  sync_calendar_bookings: 'Календарь занятости',
  open_dates_after_delete: 'Открытие дат',
  open_all_dates_after_delete: 'Открытие всех дат',
  refresh_token: 'Обновление токена',
  close_availability: 'Закрытие календаря',
};

function SyncLogDialog() {
  const syncLog = useSyncLog();
  const [logs, setLogs] = useState<AvitoLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!syncLog?.isOpen) return;

    let cancelled = false;
    setLoading(true);
    supabase
      .from('avito_logs')
      .select('id, integration_id, property_id, action, status, error, details, created_at, properties(name)')
      .eq('status', 'error')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          toast.error('Не удалось загрузить журнал: ' + error.message);
          return;
        }
        setLogs((data as AvitoLogRow[]) ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [syncLog?.isOpen]);

  if (!syncLog) return null;

  return (
    <Dialog open={syncLog.isOpen} onOpenChange={(open) => !open && syncLog.closeSyncLog()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Журнал ошибок синхронизации Avito</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0 rounded-md border">
          {loading ? (
            <div className="p-4 text-muted-foreground">Загрузка...</div>
          ) : logs.length === 0 ? (
            <div className="p-4 text-muted-foreground">Ошибок пока нет.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Время</TableHead>
                  <TableHead>Операция</TableHead>
                  <TableHead>Объект</TableHead>
                  <TableHead className="max-w-[280px]">Ошибка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(row.created_at).toLocaleString('ru-RU')}
                    </TableCell>
                    <TableCell>{ACTION_LABELS[row.action] ?? row.action}</TableCell>
                    <TableCell>{(row.properties as { name?: string } | null)?.name ?? '—'}</TableCell>
                    <TableCell className="text-destructive text-xs break-words max-w-[280px]">
                      {row.error ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={syncLog.closeSyncLog}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AvitoSyncErrorsHandler() {
  const { user } = useAuth();
  const syncLog = useSyncLog();

  useEffect(() => {
    if (!user || !syncLog) return;

    const channel = supabase
      .channel('avito_logs_errors')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'avito_logs',
          filter: 'status=eq.error',
        },
        (payload) => {
          const row = payload.new as { action?: string; error?: string };
          const msg = row.error || 'Ошибка синхронизации с Avito';
          toast.error(msg, {
            duration: 12_000,
            id: `avito-sync-error-${payload.new?.id ?? Date.now()}`,
            action: {
              label: 'Подробнее',
              onClick: () => syncLog.openSyncLog(),
            },
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, syncLog]);

  useEffect(() => {
    if (!syncLog) return;
    const handler = () => syncLog.openSyncLog();
    window.addEventListener('roomi-open-sync-log', handler);
    return () => window.removeEventListener('roomi-open-sync-log', handler);
  }, [syncLog]);

  return <SyncLogDialog />;
}
