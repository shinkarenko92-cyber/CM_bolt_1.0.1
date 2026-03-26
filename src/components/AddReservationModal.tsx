import { useState, useEffect, useMemo } from 'react';
import { Settings, AlertCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Property, Guest } from '@/lib/supabase';
import {
  calculateNights,
  validateDateRange,
  getPropertyConditions,
  fetchCalculatedPrice,
} from '@/utils/bookingUtils';
import { ChangeConditionsModal } from '@/components/ChangeConditionsModal';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface AddReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  properties: Property[];
  onAdd: (reservation: {
    property_id: string;
    guest_name: string;
    guest_email: string;
    guest_phone: string;
    check_in: string;
    check_out: string;
    check_in_time?: string | null;
    check_out_time?: string | null;
    total_price: number;
    currency: string;
    status: string;
    source: string;
    guests_count: number;
    notes?: string | null;
    extra_services_amount?: number;
    guest_id?: string | null;
    deposit_amount?: number | null;
    deposit_received?: boolean | null;
    deposit_returned?: boolean | null;
  }) => Promise<void>;
  selectedProperties?: string[];
  prefilledDates?: { propertyId: string; checkIn: string; checkOut: string } | null;
  prefilledBooking?: import('@/lib/supabase').Booking | null;
  guests?: Guest[];
}

export function AddReservationModal({
  isOpen,
  onClose,
  properties,
  onAdd,
  selectedProperties = [],
  prefilledDates = null,
  prefilledBooking = null,
  guests = [],
}: AddReservationModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    property_id: selectedProperties[0] || '',
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    check_in: '',
    check_out: '',
    check_in_time: '14:00',
    check_out_time: '12:00',
    price_per_night: '',
    total_price: '',
    extra_services_amount: '0',
    currency: 'RUB',
    status: 'confirmed',
    source: 'our_guests',
    guests_count: '1',
    notes: '',
    guest_id: '',
    deposit_amount: '0',
    deposit_received: false,
    deposit_returned: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'fillAllFields' | 'checkOutBeforeCheckIn' | null>(null);
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [showConditionsModal, setShowConditionsModal] = useState(false);
  const [currentDailyPrice, setCurrentDailyPrice] = useState<number>(0);
  const [currentMinStay, setCurrentMinStay] = useState<number>(1);
  const [guestPopoverOpen, setGuestPopoverOpen] = useState(false);
  // 'perNight' | 'total' | null — tracks who last edited a price field to avoid sync loops
  const [priceSource, setPriceSource] = useState<'perNight' | 'total' | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        property_id: selectedProperties[0] || '',
        guest_name: '',
        guest_email: '',
        guest_phone: '',
        check_in: '',
        check_out: '',
        check_in_time: '14:00',
        check_out_time: '12:00',
        price_per_night: '',
        total_price: '',
        extra_services_amount: '0',
        currency: 'RUB',
        status: 'confirmed',
        source: 'our_guests',
        guests_count: '1',
        notes: '',
        guest_id: '',
        deposit_amount: '0',
        deposit_received: false,
        deposit_returned: false,
      });
      setError(null);
      setErrorType(null);
      setCalculatingPrice(false);
    }
  }, [isOpen, selectedProperties]);

  useEffect(() => {
    if (formData.property_id && isOpen) {
      const property = properties.find(p => p.id === formData.property_id);
      if (property && !formData.price_per_night) {
        setFormData(prev => ({
          ...prev,
          price_per_night: Math.round(property.base_price || 0).toString(),
          currency: property.currency || 'RUB',
          check_in_time: property.default_check_in_time || '14:00',
          check_out_time: property.default_check_out_time || '12:00',
        }));
      }
    }
  }, [formData.property_id, isOpen, properties, formData.price_per_night]);

  // Apply prefilled dates once and trigger price fetch
  useEffect(() => {
    if (prefilledDates) {
      setFormData(prev => ({
        ...prev,
        property_id: prefilledDates.propertyId,
        check_in: prefilledDates.checkIn,
        check_out: prefilledDates.checkOut,
      }));
    }
  }, [prefilledDates]);

  // Apply duplicate booking prefill (all fields)
  useEffect(() => {
    if (!prefilledBooking) return;
    const nights = calculateNights(prefilledBooking.check_in, prefilledBooking.check_out);
    const extra = prefilledBooking.extra_services_amount ?? 0;
    const base = (prefilledBooking.total_price ?? 0) - extra;
    const pricePerNight = nights > 0 && base > 0 ? Math.round(base / nights).toString() : '';
    setFormData(prev => ({
      ...prev,
      property_id: prefilledBooking.property_id,
      guest_name: prefilledBooking.guest_name,
      guest_email: prefilledBooking.guest_email || '',
      guest_phone: prefilledBooking.guest_phone || '',
      check_in: prefilledBooking.check_in,
      check_out: prefilledBooking.check_out,
      price_per_night: pricePerNight,
      total_price: prefilledBooking.total_price?.toString() ?? '',
      currency: prefilledBooking.currency,
      status: prefilledBooking.status,
      guests_count: prefilledBooking.guests_count?.toString() ?? '1',
      notes: prefilledBooking.notes || '',
      extra_services_amount: extra.toString(),
    }));
  }, [prefilledBooking]);

  // Fetch price from DB when property or dates change
  useEffect(() => {
    if (formData.property_id && formData.check_in && formData.check_out) {
      calculatePrice(formData.property_id, formData.check_in, formData.check_out);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.property_id, formData.check_in, formData.check_out]);

  // price_per_night → total_price (user edited per-night rate)
  useEffect(() => {
    if (priceSource !== 'perNight' || calculatingPrice) return;
    const nights = calculateNights(formData.check_in, formData.check_out);
    if (nights <= 0) return;
    const perNight = parseFloat(formData.price_per_night) || 0;
    const extra = parseFloat(formData.extra_services_amount) || 0;
    const newTotal = Math.round(perNight * nights + extra);
    const current = parseFloat(formData.total_price) || 0;
    if (Math.abs(newTotal - current) > 0.01) {
      setFormData(prev => ({ ...prev, total_price: newTotal.toString() }));
    }
    setPriceSource(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.price_per_night, formData.extra_services_amount, priceSource, calculatingPrice]);

  // total_price → price_per_night (user edited total)
  useEffect(() => {
    if (priceSource !== 'total' || calculatingPrice) return;
    const nights = calculateNights(formData.check_in, formData.check_out);
    if (nights <= 0) return;
    const total = parseFloat(formData.total_price) || 0;
    const extra = parseFloat(formData.extra_services_amount) || 0;
    const newPerNight = Math.round((total - extra) / nights);
    const current = Math.round(parseFloat(formData.price_per_night) || 0);
    if (newPerNight !== current) {
      setFormData(prev => ({ ...prev, price_per_night: newPerNight.toString() }));
    }
    setPriceSource(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.total_price, priceSource, calculatingPrice]);

  const calculatePrice = async (
    propertyId: string,
    checkIn: string,
    checkOut: string
  ) => {
    if (!propertyId || !checkIn || !checkOut) return;
    if (validateDateRange(checkIn, checkOut) !== null) return;
    setCalculatingPrice(true);
    try {
      const basePrice = await fetchCalculatedPrice(propertyId, checkIn, checkOut);
      if (basePrice !== null) {
        const property = properties.find(p => p.id === propertyId);
        const nights = calculateNights(checkIn, checkOut);
        const extraServices = parseFloat(formData.extra_services_amount) || 0;
        const pricePerNight = nights > 0 ? basePrice / nights : 0;
        setFormData(prev => ({
          ...prev,
          total_price: Math.round(basePrice + extraServices).toString(),
          price_per_night: Math.round(pricePerNight).toString(),
          currency: property?.currency || 'RUB',
        }));
      }
      const property = properties.find(p => p.id === propertyId);
      if (property) {
        const conditions = await getPropertyConditions(property, checkIn, checkOut);
        setCurrentDailyPrice(conditions.dailyPrice);
        setCurrentMinStay(conditions.minStay);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCalculatingPrice(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorType(null);
    setLoading(true);
    try {
      if (!formData.property_id || !formData.guest_name.trim()) {
        setError(t('errors.fillAllFields'));
        setErrorType('fillAllFields');
        return;
      }
      const dateError = validateDateRange(formData.check_in, formData.check_out);
      if (dateError) {
        setError(t(`errors.${dateError}`));
        setErrorType(dateError);
        return;
      }
      await onAdd({
        property_id: formData.property_id,
        guest_name: formData.guest_name,
        guest_email: formData.guest_email || `guest-${Date.now()}@roomi.local`,
        guest_phone: formData.guest_phone || '',
        check_in: formData.check_in,
        check_out: formData.check_out,
        check_in_time: formData.check_in_time || '14:00',
        check_out_time: formData.check_out_time || '12:00',
        total_price: Math.round(parseFloat(formData.total_price) || 0),
        currency: formData.currency,
        status: formData.status,
        source: formData.source,
        guests_count: parseInt(formData.guests_count, 10) || 1,
        notes: formData.notes || null,
        extra_services_amount: parseInt(formData.extra_services_amount, 10) || 0,
        guest_id: formData.guest_id || null,
        deposit_amount:
          parseInt(formData.deposit_amount, 10) > 0 ? parseInt(formData.deposit_amount, 10) : null,
        deposit_received:
          parseInt(formData.deposit_amount, 10) > 0 ? formData.deposit_received : false,
        deposit_returned:
          parseInt(formData.deposit_amount, 10) > 0 ? formData.deposit_returned : false,
      });
      setFormData({
        property_id: selectedProperties[0] || '',
        guest_name: '',
        guest_email: '',
        guest_phone: '',
        check_in: '',
        check_out: '',
        check_in_time: '14:00',
        check_out_time: '12:00',
        price_per_night: '',
        total_price: '',
        extra_services_amount: '0',
        currency: 'RUB',
        status: 'confirmed',
        source: 'our_guests',
        guests_count: '1',
        notes: '',
        guest_id: '',
        deposit_amount: '0',
        deposit_received: false,
        deposit_returned: false,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setErrorType(null);
    } finally {
      setLoading(false);
    }
  };

  const filteredGuests = useMemo(() => {
    const q = formData.guest_name.trim().toLowerCase();
    if (!q) return guests.slice(0, 10);
    return guests
      .filter(g => g.name?.toLowerCase().includes(q))
      .slice(0, 10);
  }, [guests, formData.guest_name]);

  const invalidRequired =
    errorType === 'fillAllFields' &&
    (!formData.property_id ||
      !formData.guest_name.trim() ||
      !formData.check_in ||
      !formData.check_out);

  if (!isOpen) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
        <DialogContent
          className="max-w-lg w-[calc(100%-2rem)] max-h-[90vh] flex flex-col p-0 overflow-hidden"
          onPointerDownOutside={e => e.preventDefault()}
        >
          <DialogHeader className="p-6 pb-4 border-b border-border">
            <DialogDescription className="sr-only">{t('modals.addReservation')}</DialogDescription>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>{t('modals.addReservation')}</DialogTitle>
              <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  !formData.property_id ||
                  !formData.check_in ||
                  !formData.check_out ||
                  calculatingPrice
                }
                onClick={async () => {
                  const property = properties.find(p => p.id === formData.property_id);
                  if (property && formData.check_in && formData.check_out) {
                    const conditions = await getPropertyConditions(
                      property,
                      formData.check_in,
                      formData.check_out
                    );
                    setCurrentDailyPrice(conditions.dailyPrice);
                    setCurrentMinStay(conditions.minStay);
                    setShowConditionsModal(true);
                  }
                }}
              >
                <Settings className="h-4 w-4 mr-2" />
                {t('modals.changeConditions')}
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
                <X className="h-4 w-4" />
                <span className="sr-only">Закрыть</span>
              </Button>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            {error && (
              <div className="mx-6 mt-2 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Tabs defaultValue="main" className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <TabsList className="mx-6 mt-2 w-auto shrink-0">
                <TabsTrigger value="main">Основное</TabsTrigger>
                <TabsTrigger value="extra">Дополнительно</TabsTrigger>
                <TabsTrigger value="payments">Платежи</TabsTrigger>
              </TabsList>
              <div
                className="flex-1 min-h-0 max-h-[min(60vh,500px)] overflow-y-auto overflow-x-hidden px-6 overscroll-contain"
                onWheel={(e) => {
                  e.stopPropagation();
                }}
              >
                <TabsContent value="main" className="mt-4 space-y-4 pb-6">
                  <div className="space-y-2">
                    <Label>
                      {t('modals.property')} *
                    </Label>
                    <Select
                      value={formData.property_id ?? ''}
                      onValueChange={v => {
                        setFormData(prev => ({ ...prev, property_id: v }));
                        setError(null);
                        setErrorType(null);
                      }}
                      required
                    >
                      <SelectTrigger
                        className={cn(
                          invalidRequired && !formData.property_id && 'border-destructive ring-2 ring-destructive/50'
                        )}
                      >
                        <SelectValue placeholder={t('modals.selectProperty', { defaultValue: 'Выберите объект' })} />
                      </SelectTrigger>
                      <SelectContent>
                        {properties.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('modals.guestName')} *</Label>
                    <Popover open={guestPopoverOpen} onOpenChange={setGuestPopoverOpen}>
                      <PopoverTrigger asChild>
                        <div>
                          <Input
                            value={formData.guest_name}
                            onChange={e => {
                              setFormData(prev => ({
                                ...prev,
                                guest_name: e.target.value,
                                guest_id: '',
                              }));
                              setError(null);
                              setErrorType(null);
                            }}
                            onFocus={() => setGuestPopoverOpen(true)}
                            placeholder={t('modals.guestNamePlaceholder', { defaultValue: 'Иван Иванов' })}
                            className={cn(
                              invalidRequired && !formData.guest_name.trim() && 'border-destructive ring-2 ring-destructive/50'
                            )}
                          />
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                        <ScrollArea className="max-h-48">
                          {filteredGuests.length === 0 ? (
                            <p className="p-3 text-sm text-muted-foreground">Нет гостей</p>
                          ) : (
                            <ul>
                              {filteredGuests.map(g => (
                                <li key={g.id}>
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                                    onClick={() => {
                                      setFormData(prev => ({
                                        ...prev,
                                        guest_name: g.name || '',
                                        guest_phone: g.phone || prev.guest_phone,
                                        guest_email: g.email || prev.guest_email,
                                        guest_id: g.id,
                                      }));
                                      setGuestPopoverOpen(false);
                                    }}
                                  >
                                    {g.name}
                                    {(g.phone || g.email) && (
                                      <span className="block text-xs text-muted-foreground truncate">
                                        {[g.phone, g.email].filter(Boolean).join(' · ')}
                                      </span>
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('modals.guestEmail')}</Label>
                      <Input
                        type="email"
                        value={formData.guest_email}
                        onChange={e => setFormData(prev => ({ ...prev, guest_email: e.target.value }))}
                        placeholder={t('modals.guestEmailPlaceholder', { defaultValue: 'guest@example.com' })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('modals.guestPhone')}</Label>
                      <Input
                        type="tel"
                        value={formData.guest_phone}
                        onChange={e => setFormData(prev => ({ ...prev, guest_phone: e.target.value }))}
                        placeholder={t('modals.guestPhonePlaceholder', { defaultValue: '+7 (999) 123-45-67' })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('modals.checkIn')} *</Label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={formData.check_in}
                          onChange={e => {
                            setFormData(prev => ({ ...prev, check_in: e.target.value }));
                            setError(null);
                            setErrorType(null);
                          }}
                          required
                          className={cn(
                            'flex-1',
                            invalidRequired && !formData.check_in && 'border-destructive ring-2 ring-destructive/50'
                          )}
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
                      <Label>{t('modals.checkOut')} *</Label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={formData.check_out}
                          onChange={e => {
                            setFormData(prev => ({ ...prev, check_out: e.target.value }));
                            setError(null);
                            setErrorType(null);
                          }}
                          required
                          className={cn(
                            'flex-1',
                            invalidRequired && !formData.check_out && 'border-destructive ring-2 ring-destructive/50'
                          )}
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>
                        {t('modals.totalPrice')} ({formData.currency})
                        {calculatingPrice && (
                          <span className="text-muted-foreground text-xs ml-2">
                            {t('modals.calculating', { defaultValue: '(расчёт...)' })}
                          </span>
                        )}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={formData.total_price}
                        onChange={e => { setFormData(prev => ({ ...prev, total_price: e.target.value })); setPriceSource('total'); }}
                        placeholder={t('modals.totalPricePlaceholder', { defaultValue: '0' })}
                        disabled={calculatingPrice}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>
                        {t('modals.pricePerNight')}
                        {formData.check_in && formData.check_out && (
                          <span className="text-muted-foreground text-xs ml-2">
                            ({calculateNights(formData.check_in, formData.check_out)} {t('common.nights')})
                          </span>
                        )}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={formData.price_per_night}
                        onChange={e => {
                          setFormData(prev => ({
                            ...prev,
                            price_per_night: String(Math.round(parseFloat(e.target.value) || 0)),
                          }));
                          setPriceSource('perNight');
                        }}
                        placeholder="0"
                        disabled={calculatingPrice}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('modals.additionalServices')} ({formData.currency})</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={formData.extra_services_amount}
                      onChange={e =>
                        setFormData(prev => ({ ...prev, extra_services_amount: e.target.value }))
                      }
                      placeholder="0"
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('modals.bookingSource', { defaultValue: 'Источник' })}</Label>
                      <Select
                        value={formData.source}
                        onValueChange={v => setFormData(prev => ({ ...prev, source: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="our_guests">{t('sources.ourGuests', { defaultValue: 'Наши гости' })}</SelectItem>
                          <SelectItem value="avito">{t('sources.avito', { defaultValue: 'Avito' })}</SelectItem>
                          <SelectItem value="cian">{t('sources.cian', { defaultValue: 'ЦИАН' })}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('modals.guestsCount')}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={formData.guests_count}
                        onChange={e => setFormData(prev => ({ ...prev, guests_count: e.target.value }))}
                        placeholder="1"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="extra" className="mt-4 space-y-4 pb-6">
                  <div className="space-y-2">
                    <Label>{t('modals.notes', { defaultValue: 'Заметки' })}</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder={t('modals.notesPlaceholder', { defaultValue: 'Дополнительно...' })}
                      className="min-h-[120px]"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="payments" className="mt-4 space-y-4 pb-6">
                  <div className="space-y-2">
                    <Label>{t('modals.depositAmount', { defaultValue: 'Сумма залога' })} ({formData.currency})</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={formData.deposit_amount}
                      onChange={e => setFormData(prev => ({ ...prev, deposit_amount: e.target.value }))}
                      placeholder={t('modals.depositAmountPlaceholder', { defaultValue: '0' })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('modals.depositStatus', { defaultValue: 'Статус залога' })}</Label>
                    <Select
                      value={
                        formData.deposit_returned
                          ? 'returned'
                          : formData.deposit_received
                            ? 'received'
                            : 'not_received'
                      }
                      onValueChange={v => {
                        setFormData(prev => ({
                          ...prev,
                          deposit_received: v === 'received' || v === 'returned',
                          deposit_returned: v === 'returned',
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_received">
                          {t('modals.depositNotReceived', { defaultValue: 'Не получен' })}
                        </SelectItem>
                        <SelectItem value="received">
                          {t('modals.depositReceived', { defaultValue: 'Получен' })}
                        </SelectItem>
                        <SelectItem value="returned">
                          {t('modals.depositReturned', { defaultValue: 'Вернули' })}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <div className="flex gap-3 justify-end p-6 border-t border-border">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                {t('common.cancel', { defaultValue: 'Отмена' })}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading
                  ? t('modals.saving', { defaultValue: 'Сохранение...' })
                  : t('modals.saveBooking', { defaultValue: 'Сохранить бронь' })}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {showConditionsModal &&
        formData.property_id &&
        formData.check_in &&
        formData.check_out && (
          <ChangeConditionsModal
            isOpen={showConditionsModal}
            onClose={() => setShowConditionsModal(false)}
            onSuccess={async () => {
              await calculatePrice(
                formData.property_id,
                formData.check_in,
                formData.check_out
              );
              setShowConditionsModal(false);
            }}
            propertyId={formData.property_id}
            startDate={formData.check_in}
            endDate={formData.check_out}
            currentPrice={currentDailyPrice}
            currentMinStay={currentMinStay}
            currency={formData.currency}
            properties={properties}
          />
        )}
    </>
  );
}
