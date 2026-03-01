import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Property, Booking } from '@/lib/supabase';

interface DeletePropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property;
  bookings: Booking[];
  onConfirm: (action: 'cancel_unpaid' | 'force_delete' | 'abort') => Promise<void>;
}

export function DeletePropertyModal({
  isOpen,
  onClose,
  property,
  bookings,
  onConfirm,
}: DeletePropertyModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'cancel_unpaid' | 'force_delete' | 'abort' | null>(null);

  // Определяем оплаченные и неоплаченные бронирования
  // Неоплаченные: status='pending' или status='cancelled' (не confirmed)
  // Оплаченные: status='confirmed' (предполагаем, что confirmed = оплачено)
  const unpaidBookings = bookings.filter(b => b.status !== 'confirmed');
  const paidBookings = bookings.filter(b => b.status === 'confirmed');

  const handleConfirm = async (action: 'cancel_unpaid' | 'force_delete' | 'abort') => {
    setSelectedAction(action);
    setLoading(true);
    try {
      await onConfirm(action);
      if (action !== 'abort') {
        onClose();
      }
    } catch (error) {
      console.error('Error in DeletePropertyModal:', error);
    } finally {
      setLoading(false);
      setSelectedAction(null);
    }
  };

  type ColDef = {
    title: string;
    dataIndex: keyof Booking | string;
    key: string;
    render?: (value: unknown, record: Booking) => React.ReactNode;
  };

  const columns: ColDef[] = [
    {
      title: t('bookings.guestName', { defaultValue: 'Гость' }),
      dataIndex: 'guest_name',
      key: 'guest_name',
    },
    {
      title: t('bookings.checkIn', { defaultValue: 'Заезд' }),
      dataIndex: 'check_in',
      key: 'check_in',
      render: (date: unknown) => new Date(String(date)).toLocaleDateString('ru-RU'),
    },
    {
      title: t('bookings.checkOut', { defaultValue: 'Выезд' }),
      dataIndex: 'check_out',
      key: 'check_out',
      render: (date: unknown) => new Date(String(date)).toLocaleDateString('ru-RU'),
    },
    {
      title: t('bookings.status', { defaultValue: 'Статус' }),
      dataIndex: 'status',
      key: 'status',
      render: (status: unknown) => (
        <span className={`px-2 py-1 text-xs font-medium rounded ${
          status === 'confirmed' ? 'bg-blue-500/20 text-blue-400' :
          status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-red-500/20 text-red-400'
        }`}>
          {String(status)}
        </span>
      ),
    },
    {
      title: t('bookings.totalPrice', { defaultValue: 'Цена' }),
      dataIndex: 'total_price',
      key: 'total_price',
      render: (price: unknown, record: Booking) => `${Number(price)} ${record.currency}`,
    },
  ];

  const getCellContent = (col: ColDef, record: Booking) => {
    const value = record[col.dataIndex as keyof Booking];
    return col.render ? col.render(value, record) : (value != null ? String(value) : '—');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[800px]" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle asChild>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span>{t('properties.deleteProperty', { defaultValue: 'Удаление объекта' })}: {property.name}</span>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('properties.deletePropertyWarning', { propertyName: property.name, count: bookings.length, defaultValue: 'У объекта есть бронирования. Выберите действие.' })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-muted-foreground mb-4">
            {t('properties.deletePropertyWarning', {
              defaultValue: 'У объекта "{propertyName}" есть {count} бронирований. Выберите действие:',
              propertyName: property.name,
              count: bookings.length,
            })}
          </p>

          {paidBookings.length > 0 && (
            <div className="mb-4 p-3 bg-warning/10 border border-warning/20 rounded-md">
              <p className="text-warning text-sm">
                {t('properties.paidBookingsWarning', {
                  defaultValue: 'Внимание: {count} бронирований оплачены. При удалении потребуется вернуть деньги вручную.',
                  count: paidBookings.length,
                })}
              </p>
            </div>
          )}

          <div className="mb-4 max-h-[300px] overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col.key}>{col.title}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((row) => (
                  <TableRow key={row.id}>
                    {columns.map((col) => (
                      <TableCell key={col.key} className="text-sm">
                        {getCellContent(col, row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-3 justify-end mt-6">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </Button>

            {unpaidBookings.length > 0 && (
              <Button
                variant="destructive"
                onClick={() => handleConfirm('cancel_unpaid')}
                disabled={loading && selectedAction !== 'cancel_unpaid'}
              >
                {loading && selectedAction === 'cancel_unpaid' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                {t('properties.cancelUnpaid', {
                  defaultValue: 'Отменить неоплаченные ({count})',
                  count: unpaidBookings.length,
                })}
              </Button>
            )}

            <Button
              variant="destructive"
              onClick={() => handleConfirm('force_delete')}
              disabled={loading && selectedAction !== 'force_delete'}
            >
              {loading && selectedAction === 'force_delete' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {t('properties.forceDeleteAll', {
                defaultValue: 'Форсированно удалить всё ({count})',
                count: bookings.length,
              })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

