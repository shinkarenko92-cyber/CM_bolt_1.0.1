import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Booking, Property } from '@/lib/supabase';

type GuestBookingHistoryListProps = {
  bookings: Booking[];
  properties: Property[];
  currentBookingId?: string;
  emptyMessage: string;
  maxHeightClass?: string;
};

export function GuestBookingHistoryList({
  bookings,
  properties,
  currentBookingId,
  emptyMessage,
  maxHeightClass = 'h-[200px]',
}: GuestBookingHistoryListProps) {
  const { t } = useTranslation();

  const getPropertyName = (id: string) => properties.find((p) => p.id === id)?.name || t('guests.propertyDeleted', { defaultValue: 'Объект удалён' });

  if (bookings.length === 0) {
    return <p className="text-muted-foreground text-center py-4 text-sm">{emptyMessage}</p>;
  }

  return (
    <ScrollArea className={`${maxHeightClass} rounded-md border border-border`}>
      <ul className="divide-y divide-border p-0 m-0 list-none">
        {bookings.map((b) => {
          const isCurrent = currentBookingId && b.id === currentBookingId;
          return (
            <li key={b.id} className="py-3 px-3">
              <div className="w-full flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{getPropertyName(b.property_id)}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(b.check_in).toLocaleDateString('ru-RU')} — {new Date(b.check_out).toLocaleDateString('ru-RU')}
                  </div>
                  {isCurrent && (
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {t('guests.currentBookingBadge', { defaultValue: 'Эта бронь' })}
                    </Badge>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-primary font-semibold text-sm">
                    {b.total_price.toLocaleString()} {b.currency}
                  </div>
                  <Badge variant={b.status === 'confirmed' ? 'success' : 'secondary'} className="mt-0.5">
                    {b.status}
                  </Badge>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
