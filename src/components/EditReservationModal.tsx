import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Booking, Property, supabase, BookingLog } from '@/lib/supabase';
import { PriceRecalculationModal } from '@/components/PriceRecalculationModal';
import { calculateNights, validateDateRange, fetchCalculatedPrice } from '@/utils/bookingUtils';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface EditReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  properties: Property[];
  onUpdate: (id: string, data: Partial<Booking>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDuplicate?: (booking: Booking) => void;
}

type HistoryEvent = {
  timestamp: string;
  action: string;
  source: string | null;
  changes?: Record<string, { old?: unknown; new?: unknown }> | null;
};

export function EditReservationModal({
  isOpen,
  onClose,
  booking,
  properties,
  onUpdate,
  onDelete,
  onDuplicate,
}: EditReservationModalProps) {
  const { t } = useTranslation();

  const ACTION_LABELS: Record<string, string> = {
    create: t('history.created', { defaultValue: 'Бронирование создано' }),
    update: t('history.updated', { defaultValue: 'Бронирование обновлено' }),
    delete: t('history.deleted', { defaultValue: 'Бронирование удалено' }),
    created: t('history.created', { defaultValue: 'Бронирование создано' }),
    updated: t('history.updated', { defaultValue: 'Бронирование обновлено' }),
    deleted: t('history.deleted', { defaultValue: 'Бронирование удалено' }),
    status_changed: t('history.statusChanged', { defaultValue: 'Изменен статус' }),
  };

  const SOURCE_LABELS: Record<string, string> = {
    manual: t('sources.manual', { defaultValue: 'Ручное создание' }),
    avito: t('sources.avito', { defaultValue: 'Avito' }),
    cian: t('sources.cian', { defaultValue: 'ЦИАН' }),
    booking: t('sources.booking', { defaultValue: 'Booking.com' }),
    airbnb: t('sources.airbnb', { defaultValue: 'Airbnb' }),
  };

  const FIELD_LABELS: Record<string, string> = {
    guest_name: t('fields.guestName', { defaultValue: 'Имя гостя' }),
    guest_email: t('fields.guestEmail', { defaultValue: 'Email' }),
    guest_phone: t('fields.guestPhone', { defaultValue: 'Телефон' }),
    check_in: t('fields.checkIn', { defaultValue: 'Заезд' }),
    check_out: t('fields.checkOut', { defaultValue: 'Выезд' }),
    guests_count: t('fields.guestsCount', { defaultValue: 'Количество гостей' }),
    total_price: t('fields.totalPrice', { defaultValue: 'Цена' }),
    currency: t('fields.currency', { defaultValue: 'Валюта' }),
    status: t('fields.status', { defaultValue: 'Статус' }),
    notes: t('fields.notes', { defaultValue: 'Заметки' }),
    extra_services_amount: t('fields.extraServices', { defaultValue: 'Доп. услуги' }),
    property_id: t('fields.property', { defaultValue: 'Объект' }),
  };

  const [formData, setFormData] = useState({
    property_id: '',
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    check_in: '',
    check_out: '',
    check_in_time: '14:00',
    check_out_time: '12:00',
    price_per_night: '',
    total_price: '',
    currency: 'RUB',
    status: 'confirmed',
    guests_count: '1',
    notes: '',
    extra_services_amount: '0',
  });
  const [priceSource, setPriceSource] = useState<'perNight' | 'total' | null>(null);
  const [originalPropertyId, setOriginalPropertyId] = useState('');
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [calculatedPrice, setCalculatedPrice] = useState(0);
  const [bookingLogs, setBookingLogs] = useState<BookingLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (booking) {
      const nights = calculateNights(booking.check_in || '', booking.check_out || '');
      const pricePerNight =
        nights > 0 && booking.total_price ? Math.round(booking.total_price / nights).toString() : '';
      const extraServices = booking.extra_services_amount || 0;
      const basePrice = (booking.total_price || 0) - extraServices;
      const correctedPricePerNight =
        nights > 0 && basePrice > 0 ? Math.round(basePrice / nights).toString() : pricePerNight;

      setFormData({
        property_id: booking.property_id || '',
        guest_name: booking.guest_name || '',
        guest_email: booking.guest_email || '',
        guest_phone: booking.guest_phone || '',
        check_in: booking.check_in || '',
        check_out: booking.check_out || '',
        check_in_time: booking.check_in_time || '14:00',
        check_out_time: booking.check_out_time || '12:00',
        price_per_night: correctedPricePerNight,
        total_price: booking.total_price?.toString() || '',
        currency: booking.currency || 'RUB',
        status: booking.status || 'confirmed',
        guests_count: booking.guests_count?.toString() || '1',
        notes: booking.notes || '',
        extra_services_amount: extraServices.toString(),
      });
      setOriginalPropertyId(booking.property_id);
      loadBookingLogs(booking.id);
    }
  }, [booking]);

  const loadBookingLogs = async (bookingId: string) => {
    if (!bookingId) return;
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('booking_logs')
        .select('*')
        .eq('booking_id', bookingId)
        .order('timestamp', { ascending: false })
        .limit(50);
      if (error) {
        // Таблица booking_logs может отсутствовать (миграции не применены) — 404 / PGRST205 / PGRST301
        const err = error as { code?: string; status?: number; message?: string };
        if (err.code === 'PGRST205' || err.status === 404 || err.message?.includes('404') || err.code === 'PGRST301') {
          setBookingLogs([]);
          return;
        }
        throw error;
      }
      setBookingLogs(data || []);
    } catch (err) {
      console.error('Error loading booking logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  // price_per_night → total_price (user edited per-night rate OR dates changed)
  useEffect(() => {
    if (priceSource !== 'perNight') return;
    const nights = calculateNights(formData.check_in, formData.check_out);
    if (nights > 0) {
      const perNight = parseFloat(formData.price_per_night) || 0;
      const extra = parseFloat(formData.extra_services_amount) || 0;
      setFormData(prev => ({
        ...prev,
        total_price: Math.round(perNight * nights + extra).toString(),
      }));
    }
    setPriceSource(null);
  }, [formData.price_per_night, formData.extra_services_amount, formData.check_in, formData.check_out, priceSource]);

  const historyEvents = useMemo((): HistoryEvent[] => {
    if (!booking) return [];
    const events: HistoryEvent[] = [];
    if (booking.created_at) {
      events.push({
        timestamp: booking.created_at,
        action: 'create',
        source: booking.source || null,
      });
    }
    if (
      booking.updated_at &&
      booking.updated_at !== booking.created_at
    ) {
      events.push({
        timestamp: booking.updated_at,
        action: 'update',
        source: booking.source || null,
      });
    }
    bookingLogs.forEach(log => {
      events.push({
        timestamp: log.timestamp,
        action: log.action,
        source: log.source,
        changes: log.changes_json ?? undefined,
      });
    });
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events;
  }, [booking, bookingLogs]);

  if (!booking) return null;

  const calculateNewPrice = async (
    propertyId: string,
    checkIn: string,
    checkOut: string
  ): Promise<number> => {
    const result = await fetchCalculatedPrice(propertyId, checkIn, checkOut);
    return result ?? 0;
  };

  const handlePropertyChange = async (newPropertyId: string) => {
    if (newPropertyId !== originalPropertyId) {
      const newPrice = await calculateNewPrice(newPropertyId, formData.check_in, formData.check_out);
      setCalculatedPrice(newPrice);
      setShowPriceModal(true);
      setFormData(prev => ({ ...prev, property_id: newPropertyId }));
    } else {
      setFormData(prev => ({ ...prev, property_id: newPropertyId }));
    }
  };

  const handleKeepPrice = () => setShowPriceModal(false);

  const handleRecalculatePrice = () => {
    const newProperty = properties.find(p => p.id === formData.property_id);
    const nights = calculateNights(formData.check_in, formData.check_out);
    const extraServices = parseFloat(formData.extra_services_amount) || 0;
    const pricePerNight = nights > 0 ? Math.round(calculatedPrice / nights).toString() : '';
    setFormData(prev => ({
      ...prev,
      total_price: (calculatedPrice + extraServices).toString(),
      price_per_night: pricePerNight,
      currency: newProperty?.currency || prev.currency,
    }));
    setShowPriceModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const dateError = validateDateRange(formData.check_in, formData.check_out);
      if (dateError) {
        setError(t(`errors.${dateError}`));
        return;
      }
      await onUpdate(booking.id, {
        property_id: formData.property_id,
        guest_name: formData.guest_name,
        guest_email: formData.guest_email,
        guest_phone: formData.guest_phone,
        notes: formData.notes || null,
        check_in: formData.check_in,
        check_out: formData.check_out,
        check_in_time: formData.check_in_time || '14:00',
        check_out_time: formData.check_out_time || '12:00',
        total_price: Math.round(parseFloat(formData.total_price) || 0),
        currency: formData.currency,
        status: formData.status,
        guests_count: parseInt(formData.guests_count, 10) || 1,
        extra_services_amount: parseInt(formData.extra_services_amount, 10) || 0,
      } as Partial<Booking>);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    setLoading(true);
    try {
      await onDelete(booking.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const propertyName =
    properties.find(p => p.id === booking.property_id)?.name || t('common.unknown');

  return (
    <>
      <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
        <DialogContent
          className="max-w-lg w-[calc(100%-2rem)] max-h-[90vh] flex flex-col p-0 overflow-hidden"
          onPointerDownOutside={e => e.preventDefault()}
        >
          <DialogHeader className="p-6 pb-4 border-b border-border">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col space-y-2 text-left min-w-0">
                <DialogTitle>{t('modals.editReservation')}</DialogTitle>
                <DialogDescription>{propertyName}</DialogDescription>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
                <X className="h-4 w-4" />
                <span className="sr-only">{t('common.close', { defaultValue: 'Закрыть' })}</span>
              </Button>
            </div>
          </DialogHeader>

          {showDeleteConfirm ? (
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">{t('modals.confirmDelete')}</p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={loading}>
                  {t('common.cancel')}
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                  {loading ? t('modals.deleting') : t('common.delete')}
                </Button>
              </div>
            </div>
          ) : (
            <Tabs defaultValue="main" className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <TabsList className="mx-6 mt-2 w-auto shrink-0">
                <TabsTrigger value="main">{t('bookings.basicTab', { defaultValue: 'Основное' })}</TabsTrigger>
                <TabsTrigger value="history">{t('history.tab', { defaultValue: 'История' })}</TabsTrigger>
              </TabsList>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                <TabsContent value="main" className="mt-0 p-6 pt-4">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {error}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>{t('modals.property')}</Label>
                      <Select
                        value={formData.property_id}
                        onValueChange={handlePropertyChange}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('modals.selectProperty', { defaultValue: 'Выберите объект' })} />
                        </SelectTrigger>
                        <SelectContent>
                          {properties.map(property => (
                            <SelectItem key={property.id} value={property.id}>
                              {property.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('modals.guestName')}</Label>
                        <Input
                          value={formData.guest_name}
                          onChange={e => setFormData(prev => ({ ...prev, guest_name: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('modals.guestsCount')}</Label>
                        <Input
                          type="number"
                          min={1}
                          value={formData.guests_count}
                          onChange={e => setFormData(prev => ({ ...prev, guests_count: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>{t('modals.guestEmail')}</Label>
                      <Input
                        type="email"
                        value={formData.guest_email}
                        onChange={e => setFormData(prev => ({ ...prev, guest_email: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('modals.guestPhone')}</Label>
                      <Input
                        type="tel"
                        value={formData.guest_phone}
                        onChange={e => setFormData(prev => ({ ...prev, guest_phone: e.target.value }))}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('modals.checkIn')}</Label>
                        <div className="flex gap-2">
                          <Input
                            type="date"
                            value={formData.check_in}
                            onChange={e => { setFormData(prev => ({ ...prev, check_in: e.target.value })); setPriceSource('perNight'); }}
                            required
                            className="flex-1"
                          />
                          <Input
                            type="time"
                            value={formData.check_in_time}
                            onChange={e => setFormData(prev => ({ ...prev, check_in_time: e.target.value }))}
                            className="w-24"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('modals.checkOut')}</Label>
                        <div className="flex gap-2">
                          <Input
                            type="date"
                            value={formData.check_out}
                            onChange={e => { setFormData(prev => ({ ...prev, check_out: e.target.value })); setPriceSource('perNight'); }}
                            required
                            className="flex-1"
                          />
                          <Input
                            type="time"
                            value={formData.check_out_time}
                            onChange={e => setFormData(prev => ({ ...prev, check_out_time: e.target.value }))}
                            className="w-24"
                          />
                        </div>
                      </div>
                    </div>

                    {formData.check_in && formData.check_out && (
                      <div className="text-sm text-muted-foreground">
                        {t('bookings.nights')}: {calculateNights(formData.check_in, formData.check_out)}{' '}
                        {t('common.nights', { defaultValue: 'ночей' })}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('modals.pricePerNight', { defaultValue: 'Цена за ночь' })}</Label>
                        <Input
                          type="number"
                          step="1"
                          value={formData.price_per_night}
                          onChange={e => { setFormData(prev => ({ ...prev, price_per_night: e.target.value })); setPriceSource('perNight'); }}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('modals.totalPrice')}</Label>
                        <Input
                          type="number"
                          step="1"
                          value={formData.total_price}
                          onChange={e => { setFormData(prev => ({ ...prev, total_price: e.target.value })); setPriceSource('total'); }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>{t('modals.extraServices', { defaultValue: 'Доп. услуги' })}</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={formData.extra_services_amount}
                        onChange={e => {
                          const val = e.target.value;
                          setFormData(prev => {
                            const next = { ...prev, extra_services_amount: val };
                            const nights = calculateNights(prev.check_in, prev.check_out);
                            if (nights > 0 && prev.price_per_night) {
                              const base = parseFloat(prev.price_per_night) * nights;
                              next.total_price = Math.round(base + (parseFloat(val) || 0)).toString();
                            }
                            return next;
                          });
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('modals.currency')}</Label>
                        <Select
                          value={formData.currency}
                          onValueChange={v => setFormData(prev => ({ ...prev, currency: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="RUB">RUB</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('modals.status')}</Label>
                        <Select
                          value={formData.status}
                          onValueChange={v => setFormData(prev => ({ ...prev, status: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inquiry">{t('bookings.inquiry', { defaultValue: 'Запрос' })}</SelectItem>
                            <SelectItem value="pending">{t('bookings.pending')}</SelectItem>
                            <SelectItem value="confirmed">{t('bookings.confirmed')}</SelectItem>
                            <SelectItem value="checked_in">{t('bookings.checked_in', { defaultValue: 'Заселён' })}</SelectItem>
                            <SelectItem value="checked_out">{t('bookings.checked_out', { defaultValue: 'Выселен' })}</SelectItem>
                            <SelectItem value="no_show">{t('bookings.no_show', { defaultValue: 'Неявка' })}</SelectItem>
                            <SelectItem value="cancelled">{t('bookings.cancelled')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>{t('modals.notes', { defaultValue: 'Заметки' })}</Label>
                      <Textarea
                        value={formData.notes}
                        onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder={t('modals.notesPlaceholder', { defaultValue: 'Дополнительно...' })}
                        className="min-h-[100px]"
                      />
                    </div>

                    <div className="flex gap-3 justify-between pt-4 border-t border-border">
                      <Button
                        type="button"
                        variant="destructive"
                        className="opacity-80"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={loading}
                      >
                        {t('common.delete')}
                      </Button>
                      <div className="flex gap-3">
                        {onDuplicate && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => { onClose(); onDuplicate(booking); }}
                            disabled={loading}
                            title={t('bookings.duplicate', { defaultValue: 'Создать похожую бронь' })}
                          >
                            {t('bookings.duplicate', { defaultValue: 'Копировать' })}
                          </Button>
                        )}
                        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                          {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={loading}>
                          {loading ? t('common.loading') : t('common.save')}
                        </Button>
                      </div>
                    </div>
                  </form>
                </TabsContent>
                <TabsContent value="history" className="mt-0 p-6 pt-4">
                  <h3 className="text-sm font-medium mb-4">{t('history.title', { defaultValue: 'История изменений' })}</h3>
                  {loadingLogs ? (
                    <p className="text-sm text-muted-foreground">{t('common.loading', { defaultValue: 'Загрузка...' })}</p>
                  ) : historyEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('history.noHistory', { defaultValue: 'История изменений отсутствует' })}</p>
                  ) : (
                    <ul className="space-y-0 border-l-2 border-border pl-4">
                      {historyEvents.map((event, idx) => {
                        const isCreate = event.action === 'create' || event.action === 'created';
                        const isDelete = event.action === 'delete' || event.action === 'deleted';
                        const changesText =
                          event.changes && Object.keys(event.changes).length > 0
                            ? Object.entries(event.changes)
                                .map(([field, change]) => {
                                  const label = FIELD_LABELS[field] || field;
                                  const oldVal = change && change.old !== undefined ? String(change.old) : '—';
                                  const newVal = change && change.new !== undefined ? String(change.new) : '—';
                                  return `${label}: ${oldVal} → ${newVal}`;
                                })
                                .join('; ')
                            : null;
                        return (
                          <li key={`${event.timestamp}-${idx}`} className="relative pb-6 last:pb-0">
                            <span
                              className={cn(
                                'absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background',
                                isCreate && 'bg-green-500',
                                isDelete && 'bg-destructive',
                                !isCreate && !isDelete && 'bg-primary'
                              )}
                            />
                            <div className="text-sm">
                              <p className="font-medium">
                                {ACTION_LABELS[event.action] || event.action}
                              </p>
                              {event.source && (
                                <p className="text-muted-foreground mt-0.5">
                                  {t('history.source', { defaultValue: 'Источник' })}: {SOURCE_LABELS[event.source] || event.source}
                                </p>
                              )}
                              {changesText && (
                                <p className="text-muted-foreground mt-0.5">{changesText}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {format(new Date(event.timestamp), 'dd.MM.yyyy HH:mm', { locale: ru })}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <PriceRecalculationModal
        isOpen={showPriceModal}
        onClose={() => setShowPriceModal(false)}
        onKeepPrice={handleKeepPrice}
        onRecalculate={handleRecalculatePrice}
        booking={booking}
        oldProperty={properties.find(p => p.id === originalPropertyId) ?? null}
        newProperty={properties.find(p => p.id === formData.property_id) ?? null}
        calculatedPrice={calculatedPrice}
      />
    </>
  );
}
