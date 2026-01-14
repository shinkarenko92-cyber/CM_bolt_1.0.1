import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Booking, Property, supabase, BookingLog } from '../lib/supabase';
import { PriceRecalculationModal } from './PriceRecalculationModal';
import { Timeline } from 'antd';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface EditReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  properties: Property[];
  onUpdate: (id: string, data: Partial<Booking>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function EditReservationModal({
  isOpen,
  onClose,
  booking,
  properties,
  onUpdate,
  onDelete,
}: EditReservationModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    property_id: '',
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    check_in: '',
    check_out: '',
    price_per_night: '',
    total_price: '',
    currency: 'RUB',
    status: 'confirmed',
    guests_count: '1',
    notes: '',
    extra_services_amount: '0',
  });
  const [originalPropertyId, setOriginalPropertyId] = useState('');
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [calculatedPrice, setCalculatedPrice] = useState(0);
  const [bookingLogs, setBookingLogs] = useState<BookingLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Вычисление количества ночей
  const calculateNights = (checkIn: string, checkOut: string): number => {
    if (!checkIn || !checkOut) return 0;
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (checkOutDate <= checkInDate) return 0;
    const diffTime = checkOutDate.getTime() - checkInDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  useEffect(() => {
    if (booking) {
      const nights = calculateNights(booking.check_in || '', booking.check_out || '');
      const pricePerNight = nights > 0 && booking.total_price 
        ? (booking.total_price / nights).toFixed(2) 
        : '';
      
      const extraServices = booking.extra_services_amount || 0;
      const basePrice = (booking.total_price || 0) - extraServices;
      const correctedPricePerNight = nights > 0 && basePrice > 0 
        ? (basePrice / nights).toFixed(2) 
        : pricePerNight;
      
      setFormData({
        property_id: booking.property_id || '',
        guest_name: booking.guest_name || '',
        guest_email: booking.guest_email || '',
        guest_phone: booking.guest_phone || '',
        check_in: booking.check_in || '',
        check_out: booking.check_out || '',
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

      if (error) throw error;
      setBookingLogs(data || []);
    } catch (err) {
      console.error('Error loading booking logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Пересчет total_price при изменении price_per_night или extra_services_amount
  useEffect(() => {
    if (formData.price_per_night && formData.check_in && formData.check_out) {
      const nights = calculateNights(formData.check_in, formData.check_out);
      if (nights > 0) {
        const pricePerNight = parseFloat(formData.price_per_night) || 0;
        const extraServices = parseFloat(formData.extra_services_amount) || 0;
        const basePrice = pricePerNight * nights;
        const newTotalPrice = (basePrice + extraServices).toFixed(2);
        setFormData(prev => ({
          ...prev,
          total_price: newTotalPrice,
        }));
      }
    }
  }, [formData.price_per_night, formData.check_in, formData.check_out, formData.extra_services_amount]);

  if (!booking) return null;

  const calculateNewPrice = async (propertyId: string, checkIn: string, checkOut: string): Promise<number> => {
    const property = properties.find(p => p.id === propertyId);
    if (!property) return 0;

    const { data: rates } = await supabase
      .from('property_rates')
      .select('*')
      .eq('property_id', propertyId);

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    let total = 0;
    const current = new Date(start);

    while (current < end) {
      const dateStr = current.toISOString().split('T')[0];
      const rate = rates?.find(r => r.date === dateStr);
      total += rate?.daily_price || property.base_price;
      current.setDate(current.getDate() + 1);
    }

    return total;
  };

  const handlePropertyChange = async (newPropertyId: string) => {
    if (newPropertyId !== originalPropertyId) {
      const newPrice = await calculateNewPrice(newPropertyId, formData.check_in, formData.check_out);
      setCalculatedPrice(newPrice);
      setShowPriceModal(true);
      setFormData({ ...formData, property_id: newPropertyId });
    } else {
      setFormData({ ...formData, property_id: newPropertyId });
    }
  };

  const handleKeepPrice = () => {
    setShowPriceModal(false);
  };

  const handleRecalculatePrice = () => {
    const newProperty = properties.find(p => p.id === formData.property_id);
    const nights = calculateNights(formData.check_in, formData.check_out);
    const extraServices = parseFloat(formData.extra_services_amount) || 0;
    const basePrice = calculatedPrice;
    const totalPrice = basePrice + extraServices;
    const pricePerNight = nights > 0 ? (basePrice / nights).toFixed(2) : '';
    setFormData({
      ...formData,
      total_price: totalPrice.toString(),
      price_per_night: pricePerNight,
      currency: newProperty?.currency || formData.currency,
    });
    setShowPriceModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const checkInDate = new Date(formData.check_in);
      const checkOutDate = new Date(formData.check_out);

      if (checkOutDate <= checkInDate) {
        setError(t('errors.checkOutBeforeCheckIn'));
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
        total_price: parseFloat(formData.total_price) || 0,
        currency: formData.currency,
        status: formData.status,
        guests_count: parseInt(formData.guests_count) || 1,
        extra_services_amount: parseInt(formData.extra_services_amount) || 0,
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

  if (!isOpen) return null;
  if (!booking) return null;

  const propertyName = properties.find((p) => p.id === booking.property_id)?.name || t('common.unknown');

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onMouseDown={(e) => {
        // Сохраняем, что mousedown произошел на backdrop
        if (e.target === e.currentTarget) {
          (e.currentTarget as HTMLElement).dataset.mouseDown = 'true';
        }
      }}
      onMouseUp={(e) => {
        // Закрываем только если mousedown и mouseup произошли на backdrop
        const backdrop = e.currentTarget as HTMLElement;
        if (e.target === backdrop && backdrop.dataset.mouseDown === 'true') {
          onClose();
        }
        delete backdrop.dataset.mouseDown;
      }}
    >
      <div
        className="bg-slate-800 rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-semibold text-white">{t('modals.editReservation')}</h2>
            <p className="text-sm text-slate-400 mt-1">{propertyName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </div>

        {showDeleteConfirm ? (
          <div className="p-6 border-b border-slate-700">
            <p className="text-white mb-4">{t('modals.confirmDelete')}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-slate-300 hover:text-white transition"
                disabled={loading}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition disabled:opacity-50"
                disabled={loading}
              >
                {loading ? t('modals.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-200 text-sm">
                {error}
              </div>
            )}

            <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.property')}
                </label>
              <select
                value={formData.property_id}
                onChange={(e) => handlePropertyChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                required
              >
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.guestName')}
                </label>
                <input
                  type="text"
                  value={formData.guest_name}
                  onChange={(e) =>
                    setFormData({ ...formData, guest_name: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.guestEmail')}
                </label>
                <input
                  type="email"
                  value={formData.guest_email}
                  onChange={(e) =>
                    setFormData({ ...formData, guest_email: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.guestPhone')}
                </label>
                <input
                  type="tel"
                  value={formData.guest_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, guest_phone: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.guestsCount')}
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.guests_count}
                  onChange={(e) =>
                    setFormData({ ...formData, guests_count: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.checkIn')}
                </label>
                <input
                  type="date"
                  value={formData.check_in}
                  onChange={(e) =>
                    setFormData({ ...formData, check_in: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.checkOut')}
                </label>
                <input
                  type="date"
                  value={formData.check_out}
                  onChange={(e) =>
                    setFormData({ ...formData, check_out: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  required
                />
              </div>

              {formData.check_in && formData.check_out && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    {t('bookings.nights')}
                  </label>
                  <div className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white">
                    {calculateNights(formData.check_in, formData.check_out)} {t('common.nights', { defaultValue: 'nights' })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.pricePerNight', { defaultValue: 'Price per Night' })}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price_per_night}
                  onChange={(e) =>
                    setFormData({ ...formData, price_per_night: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.totalPrice')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.total_price}
                  onChange={(e) =>
                    setFormData({ ...formData, total_price: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.extraServices', { defaultValue: 'Extra Services Amount' })}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.extra_services_amount}
                  onChange={(e) => {
                    const extraServices = parseFloat(e.target.value) || 0;
                    setFormData({ ...formData, extra_services_amount: e.target.value });
                    // Пересчитываем total_price при изменении доп услуг
                    if (formData.price_per_night && formData.check_in && formData.check_out) {
                      const nights = calculateNights(formData.check_in, formData.check_out);
                      if (nights > 0) {
                        const pricePerNight = parseFloat(formData.price_per_night) || 0;
                        const basePrice = pricePerNight * nights;
                        const newTotalPrice = (basePrice + extraServices).toFixed(2);
                        setFormData(prev => ({
                          ...prev,
                          extra_services_amount: e.target.value,
                          total_price: newTotalPrice,
                        }));
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.currency')}
                </label>
                <select
                  value={formData.currency}
                  onChange={(e) =>
                    setFormData({ ...formData, currency: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                >
                  <option value="RUB">RUB</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.status')}
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                >
                  <option value="confirmed">{t('bookings.confirmed')}</option>
                  <option value="pending">{t('bookings.pending')}</option>
                  <option value="cancelled">{t('bookings.cancelled')}</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('modals.notes', { defaultValue: 'Notes' })}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white min-h-[100px] resize-y"
                  placeholder={t('modals.notesPlaceholder', { defaultValue: 'Add any additional notes...' })}
                />
              </div>
            </div>

            {/* История изменений */}
            <div className="col-span-2 border-t border-slate-700 pt-6 mt-6">
              <h3 className="text-lg font-medium text-white mb-4">История изменений</h3>
              {loadingLogs ? (
                <div className="text-slate-400">Загрузка...</div>
              ) : !booking ? (
                <div className="text-slate-400">История изменений отсутствует</div>
              ) : (
                <Timeline
                  items={(() => {
                    // Создаем объединенный массив событий из booking и logs
                    const events: Array<{
                      timestamp: string;
                      action: string;
                      source: string | null;
                      changes?: Record<string, { old?: unknown; new?: unknown }> | null;
                      isFromBooking?: boolean;
                    }> = [];

                    // Добавляем событие создания (если есть created_at)
                    if (booking.created_at) {
                      events.push({
                        timestamp: booking.created_at,
                        action: 'created',
                        source: booking.source || null,
                        isFromBooking: true,
                      });
                    }

                    // Добавляем событие последнего обновления (если updated_at отличается от created_at)
                    if (booking.updated_at && booking.updated_at !== booking.created_at) {
                      events.push({
                        timestamp: booking.updated_at,
                        action: 'updated',
                        source: booking.source || null,
                        isFromBooking: true,
                      });
                    }

                    // Добавляем логи из booking_logs
                    bookingLogs.forEach((log) => {
                      events.push({
                        timestamp: log.timestamp,
                        action: log.action,
                        source: log.source,
                        changes: log.changes_json,
                        isFromBooking: false,
                      });
                    });

                    // Сортируем по дате (новые сверху)
                    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                    return events.map((event) => {
                      const actionLabels: Record<string, string> = {
                        created: 'Бронирование создано',
                        updated: 'Бронирование обновлено',
                        deleted: 'Бронирование удалено',
                        status_changed: 'Изменен статус',
                      };
                      
                      const actionColors: Record<string, string> = {
                        created: 'green',
                        updated: 'blue',
                        deleted: 'red',
                        status_changed: 'orange',
                      };

                      const changesText = event.changes && Object.keys(event.changes).length > 0
                        ? Object.entries(event.changes)
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
                              const oldVal = change.old !== undefined ? String(change.old) : '—';
                              const newVal = change.new !== undefined ? String(change.new) : '—';
                              return `${fieldLabel}: ${oldVal} → ${newVal}`;
                            })
                            .join('; ')
                        : null;

                      const sourceLabels: Record<string, string> = {
                        manual: 'Ручное создание',
                        avito: 'Avito',
                        cian: 'ЦИАН',
                        booking: 'Booking.com',
                        airbnb: 'Airbnb',
                      };

                      return {
                        color: actionColors[event.action] || 'blue',
                        children: (
                          <div className="text-white">
                            <div className="font-medium mb-1">
                              {actionLabels[event.action] || event.action}
                            </div>
                            {event.source && (
                              <div className="text-sm text-slate-300 mb-1">
                                Источник: <span className="font-medium">{sourceLabels[event.source] || event.source}</span>
                              </div>
                            )}
                            {changesText && (
                              <div className="text-sm text-slate-300 mb-1">{changesText}</div>
                            )}
                            <div className="text-xs text-slate-400">
                              {format(new Date(event.timestamp), 'dd.MM.yyyy HH:mm', { locale: ru })}
                            </div>
                          </div>
                        ),
                      };
                    });
                  })()}
                />
              )}
            </div>

            <div className="flex gap-3 justify-between pt-4 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded transition"
                disabled={loading}
              >
                Delete
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-slate-300 hover:text-white transition"
                  disabled={loading}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      <PriceRecalculationModal
        isOpen={showPriceModal}
        onClose={() => setShowPriceModal(false)}
        onKeepPrice={handleKeepPrice}
        onRecalculate={handleRecalculatePrice}
        booking={booking}
        oldProperty={properties.find(p => p.id === originalPropertyId) || null}
        newProperty={properties.find(p => p.id === formData.property_id) || null}
        calculatedPrice={calculatedPrice}
      />
    </div>
  );
}
