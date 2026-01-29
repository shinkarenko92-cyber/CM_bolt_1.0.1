import { useState, useEffect, useRef, useMemo } from 'react';
import { Settings, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { differenceInDays, parseISO } from 'date-fns';
import { Property, supabase, Guest } from '../lib/supabase';
import { ChangeConditionsModal } from './ChangeConditionsModal';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
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
  guests?: Guest[];
}

export function AddReservationModal({
  isOpen,
  onClose,
  properties,
  onAdd,
  selectedProperties = [],
  prefilledDates = null,
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
  const isUpdatingFromPricePerNight = useRef(false);
  const isUpdatingFromTotalPrice = useRef(false);
  const isUpdatingFromConditions = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        property_id: selectedProperties[0] || '',
        guest_name: '',
        guest_email: '',
        guest_phone: '',
        check_in: '',
        check_out: '',
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
        }));
      }
    }
  }, [formData.property_id, isOpen, properties, formData.price_per_night]);

  useEffect(() => {
    if (prefilledDates) {
      setFormData(prev => ({
        ...prev,
        property_id: prefilledDates.propertyId,
        check_in: prefilledDates.checkIn,
        check_out: prefilledDates.checkOut,
      }));
      calculatePrice(prefilledDates.propertyId, prefilledDates.checkIn, prefilledDates.checkOut);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when prefilledDates change; calculatePrice identity intentionally omitted
  }, [prefilledDates]);

  useEffect(() => {
    if (formData.property_id && formData.check_in && formData.check_out) {
      calculatePrice(formData.property_id, formData.check_in, formData.check_out);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when property/dates change
  }, [formData.property_id, formData.check_in, formData.check_out]);

  useEffect(() => {
    if (
      formData.property_id &&
      formData.check_in &&
      formData.check_out &&
      !calculatingPrice
    ) {
      isUpdatingFromConditions.current = true;
      getCurrentConditions(formData.property_id, formData.check_in, formData.check_out)
        .then(conditions => {
          setCurrentDailyPrice(conditions.dailyPrice);
          setCurrentMinStay(conditions.minStay);
          const nights = calculateNights(formData.check_in, formData.check_out);
          if (nights > 0) {
            const pricePerNight = Math.round(conditions.dailyPrice);
            const extraServices = parseFloat(formData.extra_services_amount) || 0;
            setFormData(prev => ({
              ...prev,
              price_per_night: pricePerNight.toString(),
              total_price: Math.round(pricePerNight * nights + extraServices).toString(),
            }));
          }
          isUpdatingFromConditions.current = false;
        })
        .catch(err => {
          console.error(err);
          const property = properties.find(p => p.id === formData.property_id);
          if (property) {
            setCurrentDailyPrice(property.base_price || 0);
            setCurrentMinStay(property.minimum_booking_days || 1);
            const nights = calculateNights(formData.check_in, formData.check_out);
            if (nights > 0) {
              const pricePerNight = Math.round(property.base_price || 0);
              const extraServices = parseFloat(formData.extra_services_amount) || 0;
              setFormData(prev => ({
                ...prev,
                price_per_night: pricePerNight.toString(),
                total_price: Math.round(pricePerNight * nights + extraServices).toString(),
              }));
            }
          }
          isUpdatingFromConditions.current = false;
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when property/dates change; getCurrentConditions, properties, etc. intentionally omitted to avoid extra runs
  }, [formData.property_id, formData.check_in, formData.check_out]);

  useEffect(() => {
    if (
      !calculatingPrice &&
      !isUpdatingFromTotalPrice.current &&
      formData.price_per_night &&
      formData.check_in &&
      formData.check_out
    ) {
      const nights = calculateNights(formData.check_in, formData.check_out);
      if (nights > 0) {
        const pricePerNight = parseFloat(formData.price_per_night) || 0;
        const extraServices = parseFloat(formData.extra_services_amount) || 0;
        const newTotal = Math.round(pricePerNight * nights + extraServices);
        const current = parseFloat(formData.total_price) || 0;
        if (Math.abs(newTotal - current) > 0.01) {
          isUpdatingFromPricePerNight.current = true;
          setFormData(prev => ({ ...prev, total_price: newTotal.toString() }));
          setTimeout(() => {
            isUpdatingFromPricePerNight.current = false;
          }, 0);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync total from price_per_night; omit formData.total_price to avoid loop
  }, [
    formData.price_per_night,
    formData.check_in,
    formData.check_out,
    formData.extra_services_amount,
    calculatingPrice,
  ]);

  useEffect(() => {
    if (
      !calculatingPrice &&
      !isUpdatingFromConditions.current &&
      !isUpdatingFromPricePerNight.current &&
      formData.total_price &&
      formData.check_in &&
      formData.check_out
    ) {
      const nights = calculateNights(formData.check_in, formData.check_out);
      if (nights > 0) {
        const totalPrice = parseFloat(formData.total_price) || 0;
        const extraServices = parseFloat(formData.extra_services_amount) || 0;
        const newDaily = Math.round((totalPrice - extraServices) / nights);
        const current = Math.round(parseFloat(formData.price_per_night) || 0);
        if (newDaily !== current) {
          isUpdatingFromTotalPrice.current = true;
          setFormData(prev => ({ ...prev, price_per_night: newDaily.toString() }));
          setTimeout(() => {
            isUpdatingFromTotalPrice.current = false;
          }, 0);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync price_per_night from total; omit formData.price_per_night to avoid loop
  }, [
    formData.total_price,
    formData.extra_services_amount,
    formData.check_in,
    formData.check_out,
    calculatingPrice,
  ]);

  const calculateNights = (checkIn: string, checkOut: string): number => {
    if (!checkIn || !checkOut) return 0;
    const start = parseISO(checkIn);
    const end = parseISO(checkOut);
    if (end <= start) return 0;
    return differenceInDays(end, start);
  };

  const getCurrentConditions = async (
    propertyId: string,
    checkIn: string,
    checkOut: string
  ): Promise<{ dailyPrice: number; minStay: number }> => {
    const property = properties.find(p => p.id === propertyId);
    if (!property)
      return { dailyPrice: 0, minStay: 1 };
    try {
      const start = new Date(checkIn);
      const end = new Date(checkOut);
      const dates: string[] = [];
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }
      if (dates.length === 0)
        return {
          dailyPrice: property.base_price || 0,
          minStay: property.minimum_booking_days || 1,
        };
      const { data: rates, error: ratesError } = await supabase
        .from('property_rates')
        .select('*')
        .eq('property_id', propertyId);
      if (ratesError) throw ratesError;
      let totalPrice = 0;
      let maxMinStay = property.minimum_booking_days || 1;
      const filteredRates = rates?.filter(r => dates.includes(r.date)) || [];
      for (const date of dates) {
        const rate = filteredRates.find(r => r.date === date);
        if (rate) {
          totalPrice += Number(rate.daily_price) || 0;
          maxMinStay = Math.max(maxMinStay, rate.min_stay || 1);
        } else {
          totalPrice += property.base_price || 0;
        }
      }
      const averageDailyPrice =
        dates.length > 0 ? totalPrice / dates.length : property.base_price || 0;
      return { dailyPrice: averageDailyPrice, minStay: maxMinStay };
    } catch (err) {
      console.error(err);
      return {
        dailyPrice: property.base_price || 0,
        minStay: property.minimum_booking_days || 1,
      };
    }
  };

  const calculatePrice = async (
    propertyId: string,
    checkIn: string,
    checkOut: string
  ) => {
    if (!propertyId || !checkIn || !checkOut) return;
    const checkOutDate = new Date(checkOut);
    const checkInDate = new Date(checkIn);
    if (checkOutDate <= checkInDate) return;
    setCalculatingPrice(true);
    isUpdatingFromConditions.current = true;
    try {
      const { data, error } = await supabase.rpc('calculate_booking_price', {
        p_property_id: propertyId,
        p_check_in: checkIn,
        p_check_out: checkOut,
      });
      if (error) throw error;
      if (data !== null) {
        const property = properties.find(p => p.id === propertyId);
        const nights = calculateNights(checkIn, checkOut);
        const extraServices = parseFloat(formData.extra_services_amount) || 0;
        const totalPrice = data + extraServices;
        const pricePerNight = nights > 0 ? data / nights : 0;
        setFormData(prev => ({
          ...prev,
          total_price: Math.round(totalPrice).toString(),
          price_per_night: Math.round(pricePerNight).toString(),
          currency: property?.currency || 'RUB',
        }));
      }
      const conditions = await getCurrentConditions(propertyId, checkIn, checkOut);
      setCurrentDailyPrice(conditions.dailyPrice);
      setCurrentMinStay(conditions.minStay);
    } catch (err) {
      console.error(err);
    } finally {
      setCalculatingPrice(false);
      isUpdatingFromConditions.current = false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorType(null);
    setLoading(true);
    try {
      if (
        !formData.property_id ||
        !formData.guest_name.trim() ||
        !formData.check_in ||
        !formData.check_out
      ) {
        setError(t('errors.fillAllFields'));
        setErrorType('fillAllFields');
        return;
      }
      const checkInDate = parseISO(formData.check_in);
      const checkOutDate = parseISO(formData.check_out);
      if (checkOutDate <= checkInDate) {
        setError(t('errors.checkOutBeforeCheckIn'));
        setErrorType('checkOutBeforeCheckIn');
        return;
      }
      await onAdd({
        property_id: formData.property_id,
        guest_name: formData.guest_name,
        guest_email: formData.guest_email || `guest-${Date.now()}@roomi.local`,
        guest_phone: formData.guest_phone || '',
        check_in: formData.check_in,
        check_out: formData.check_out,
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
      <Sheet open={isOpen} onOpenChange={open => !open && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg flex flex-col p-0"
          onPointerDownOutside={e => e.preventDefault()}
        >
          <SheetHeader className="p-6 pb-4 border-b border-border">
            <SheetDescription className="sr-only">{t('modals.addReservation')}</SheetDescription>
            <div className="flex items-center justify-between gap-2">
              <SheetTitle>{t('modals.addReservation')}</SheetTitle>
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
                  if (
                    formData.property_id &&
                    formData.check_in &&
                    formData.check_out
                  ) {
                    const conditions = await getCurrentConditions(
                      formData.property_id,
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
            </div>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            {error && (
              <div className="mx-6 mt-2 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Tabs defaultValue="main" className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-6 mt-2 w-auto">
                <TabsTrigger value="main">Основное</TabsTrigger>
                <TabsTrigger value="extra">Дополнительно</TabsTrigger>
                <TabsTrigger value="payments">Платежи</TabsTrigger>
              </TabsList>
              <ScrollArea className="flex-1 px-6">
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
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
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
                          invalidRequired && !formData.check_in && 'border-destructive ring-2 ring-destructive/50'
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('modals.checkOut')} *</Label>
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
                          invalidRequired && !formData.check_out && 'border-destructive ring-2 ring-destructive/50'
                        )}
                      />
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
                        onChange={e => setFormData(prev => ({ ...prev, total_price: e.target.value }))}
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
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            price_per_night: String(Math.round(parseFloat(e.target.value) || 0)),
                          }))
                        }
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
                          <SelectItem value="confirmed">{t('bookings.confirmed')}</SelectItem>
                          <SelectItem value="pending">{t('bookings.pending')}</SelectItem>
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
              </ScrollArea>
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
        </SheetContent>
      </Sheet>

      {showConditionsModal &&
        formData.property_id &&
        formData.check_in &&
        formData.check_out && (() => {
          const checkOutDate = new Date(formData.check_out);
          checkOutDate.setDate(checkOutDate.getDate() - 1);
          const endDateForConditions = checkOutDate.toISOString().split('T')[0];
          return (
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
              endDate={endDateForConditions}
              currentPrice={currentDailyPrice}
              currentMinStay={currentMinStay}
              currency={formData.currency}
              properties={properties}
            />
          );
        })()}
    </>
  );
}
