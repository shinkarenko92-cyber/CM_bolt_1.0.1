import { useState, useEffect, useRef } from 'react';
import { X, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { differenceInDays, parseISO } from 'date-fns';
import { InputNumber } from 'antd';
import { Property, supabase } from '../lib/supabase';
import { ChangeConditionsModal } from './ChangeConditionsModal';

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
  }) => Promise<void>;
  selectedProperties?: string[];
  prefilledDates?: { propertyId: string; checkIn: string; checkOut: string } | null;
}

export function AddReservationModal({
  isOpen,
  onClose,
  properties,
  onAdd,
  selectedProperties = [],
  prefilledDates = null,
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
    source: 'manual',
    guests_count: '1',
    notes: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [showConditionsModal, setShowConditionsModal] = useState(false);
  const [currentDailyPrice, setCurrentDailyPrice] = useState<number>(0);
  const [currentMinStay, setCurrentMinStay] = useState<number>(1);
  // Refs для отслеживания источника изменений (предотвращение циклов)
  const isUpdatingFromPricePerNight = useRef(false);
  const isUpdatingFromTotalPrice = useRef(false);
  const isUpdatingFromExtraServices = useRef(false);
  const isUpdatingFromConditions = useRef(false);

  // Сброс формы при закрытии модального окна
  useEffect(() => {
    if (!isOpen) {
      // Сбрасываем форму при закрытии, чтобы значения не переносились на следующее открытие
      setFormData({
        property_id: selectedProperties[0] || '',
        guest_name: '',
        guest_email: '',
        guest_phone: '',
        check_in: '',
        check_out: '',
        price_per_night: '',
        total_price: '',
        extra_services_amount: '0', // Важно: сбрасываем на '0'
        currency: 'RUB',
        status: 'confirmed',
        source: 'manual',
        guests_count: '1',
        notes: '',
      });
      setError(null);
      setCalculatingPrice(false);
    }
  }, [isOpen, selectedProperties]);

  // Load property price when property_id changes
  useEffect(() => {
    if (formData.property_id && isOpen) {
      const property = properties.find(p => p.id === formData.property_id);
      if (property && !formData.price_per_night) {
        // Set default price from property if not already set
        setFormData(prev => ({
          ...prev,
          price_per_night: property.base_price?.toString() || '',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledDates]);

  useEffect(() => {
    if (formData.property_id && formData.check_in && formData.check_out) {
      calculatePrice(formData.property_id, formData.check_in, formData.check_out);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.property_id, formData.check_in, formData.check_out]);

  // Обновляем текущие условия при изменении дат или property (БЕЗ extra_services_amount!)
  // Этот useEffect только загружает базовую цену за ночь и пересчитывает total_price с учетом текущих доп. услуг
  useEffect(() => {
    if (formData.property_id && formData.check_in && formData.check_out && !calculatingPrice) {
      isUpdatingFromConditions.current = true;
      getCurrentConditions(formData.property_id, formData.check_in, formData.check_out)
        .then((conditions) => {
          setCurrentDailyPrice(conditions.dailyPrice);
          setCurrentMinStay(conditions.minStay);
          
          const nights = calculateNights(formData.check_in, formData.check_out);
          if (nights > 0) {
            const pricePerNight = Math.round(conditions.dailyPrice);
            const extraServices = parseFloat(formData.extra_services_amount) || 0;
            const newTotalPrice = Math.round(pricePerNight * nights + extraServices);
            
            setFormData(prev => ({
              ...prev,
              price_per_night: pricePerNight.toString(),
              total_price: newTotalPrice.toString(),
            }));
          }
          isUpdatingFromConditions.current = false;
        })
        .catch((error) => {
          console.error('Error loading property rates:', error);
          const property = properties.find(p => p.id === formData.property_id);
          if (property) {
            setCurrentDailyPrice(property.base_price || 0);
            setCurrentMinStay(property.minimum_booking_days || 1);
            
            const nights = calculateNights(formData.check_in, formData.check_out);
            if (nights > 0) {
              const pricePerNight = Math.round(property.base_price || 0);
              const extraServices = parseFloat(formData.extra_services_amount) || 0;
              const newTotalPrice = Math.round(pricePerNight * nights + extraServices);
              
              setFormData(prev => ({
                ...prev,
                price_per_night: pricePerNight.toString(),
                total_price: newTotalPrice.toString(),
              }));
            }
          }
          isUpdatingFromConditions.current = false;
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.property_id, formData.check_in, formData.check_out]);

  // Пересчет total_price при изменении price_per_night (от условий или вручную)
  // ИЛИ пересчет price_per_night при изменении extra_services_amount (если total_price не меняется)
  // НЕ срабатывает если изменение идет от ручного изменения total_price
  useEffect(() => {
    // Если изменение price_per_night (от условий или вручную) → пересчитываем total_price
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
        const newTotalPrice = Math.round(pricePerNight * nights + extraServices);
        
        const currentTotal = parseFloat(formData.total_price) || 0;
        if (Math.abs(newTotalPrice - currentTotal) > 0.01) {
          isUpdatingFromPricePerNight.current = true;
          setFormData(prev => ({
            ...prev,
            total_price: newTotalPrice.toString(),
          }));
          setTimeout(() => {
            isUpdatingFromPricePerNight.current = false;
          }, 0);
        }
      }
    }
    // Если изменение extra_services_amount и total_price НЕ меняется → пересчитываем price_per_night
    else if (
      !calculatingPrice && 
      !isUpdatingFromConditions.current && 
      !isUpdatingFromTotalPrice.current &&
      !isUpdatingFromPricePerNight.current &&
      formData.total_price && 
      formData.check_in && 
      formData.check_out
    ) {
      const nights = calculateNights(formData.check_in, formData.check_out);
      if (nights > 0) {
        const totalPrice = parseFloat(formData.total_price) || 0;
        const extraServices = parseFloat(formData.extra_services_amount) || 0;
        const newDailyPrice = Math.round((totalPrice - extraServices) / nights);
        
        const currentPricePerNight = parseFloat(formData.price_per_night) || 0;
        if (Math.abs(newDailyPrice - currentPricePerNight) > 0.01) {
          isUpdatingFromExtraServices.current = true;
          setFormData(prev => ({
            ...prev,
            price_per_night: newDailyPrice.toString(),
          }));
          setTimeout(() => {
            isUpdatingFromExtraServices.current = false;
          }, 0);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.price_per_night, formData.extra_services_amount, formData.check_in, formData.check_out, calculatingPrice]);

  // Пересчет price_per_night при изменении total_price (если меняем total вручную)
  // Срабатывает ТОЛЬКО когда пользователь вручную меняет total_price
  // НЕ срабатывает при программном обновлении через другие useEffect
  // Формула: price_per_night = (total_price - extra_services_amount) / nights (округление до целых)
  useEffect(() => {
    if (
      !calculatingPrice && 
      !isUpdatingFromConditions.current && 
      !isUpdatingFromPricePerNight.current && 
      !isUpdatingFromExtraServices.current &&
      formData.total_price && 
      formData.check_in && 
      formData.check_out
    ) {
      const nights = calculateNights(formData.check_in, formData.check_out);
      if (nights > 0) {
        const totalPrice = parseFloat(formData.total_price) || 0;
        const extraServices = parseFloat(formData.extra_services_amount) || 0;
        // Округляем до целых чисел (без копеек)
        const newDailyPrice = Math.round((totalPrice - extraServices) / nights);
        
        // Проверяем, действительно ли нужно обновлять
        const currentPricePerNight = parseFloat(formData.price_per_night) || 0;
        if (Math.abs(newDailyPrice - currentPricePerNight) > 0.01) {
          isUpdatingFromTotalPrice.current = true;
        setFormData(prev => ({
          ...prev,
          price_per_night: newDailyPrice.toString(),
        }));
          setTimeout(() => {
            isUpdatingFromTotalPrice.current = false;
          }, 0);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.total_price, formData.extra_services_amount, formData.check_in, formData.check_out, calculatingPrice]);

  const getCurrentConditions = async (propertyId: string, checkIn: string, checkOut: string) => {
    if (!propertyId || !checkIn || !checkOut) {
      return { dailyPrice: 0, minStay: 1 };
    }

    const property = properties.find(p => p.id === propertyId);
    if (!property) {
      return { dailyPrice: 0, minStay: 1 };
    }

    try {
      // Получаем property_rates для выбранных дат
      const start = new Date(checkIn);
      const end = new Date(checkOut);
      const dates: string[] = [];
      
      // Генерируем массив дат (check-out обычно не включается, но для условий берем все даты периода)
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }

      if (dates.length === 0) {
        return {
          dailyPrice: property.base_price || 0,
          minStay: property.minimum_booking_days || 1,
        };
      }

      // Получаем property_rates для выбранных дат
      // Используем подход с получением всех rates для property и фильтрацией на клиенте
      // Это более надежно, чем .in() при большом количестве дат
      const { data: rates, error: ratesError } = await supabase
        .from('property_rates')
        .select('*')
        .eq('property_id', propertyId);

      if (ratesError) {
        console.error('Error loading property rates:', ratesError);
        // В случае ошибки возвращаем базовые значения
        return {
          dailyPrice: property.base_price || 0,
          minStay: property.minimum_booking_days || 1,
        };
      }

      // Вычисляем среднюю цену за ночь и максимальный минимальный срок
      let totalPrice = 0;
      let maxMinStay = property.minimum_booking_days || 1;

      // Фильтруем rates только для нужных дат
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

      const averageDailyPrice = dates.length > 0 ? totalPrice / dates.length : property.base_price || 0;

      return {
        dailyPrice: averageDailyPrice,
        minStay: maxMinStay,
      };
    } catch (err) {
      console.error('Error getting current conditions:', err);
      return {
        dailyPrice: property.base_price || 0,
        minStay: property.minimum_booking_days || 1,
      };
    }
  };

  // Вычисление количества ночей (check_out exclusive)
  const calculateNights = (checkIn: string, checkOut: string): number => {
    if (!checkIn || !checkOut) return 0;
    const checkInDate = parseISO(checkIn);
    const checkOutDate = parseISO(checkOut);
    if (checkOutDate <= checkInDate) return 0;
    return differenceInDays(checkOutDate, checkInDate);
  };

  const calculatePrice = async (propertyId: string, checkIn: string, checkOut: string) => {
    if (!propertyId || !checkIn || !checkOut) return;

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

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
        // Используем текущее значение extra_services_amount из formData
        const extraServices = parseFloat(formData.extra_services_amount) || 0;
        const basePrice = data; // цена без доп услуг
        const totalPrice = basePrice + extraServices; // общая цена с доп услугами
        const pricePerNight = nights > 0 ? basePrice / nights : 0;
        
        setFormData(prev => ({
          ...prev,
          total_price: Math.round(totalPrice).toString(),
          price_per_night: Math.round(pricePerNight).toString(),
          currency: property?.currency || 'RUB',
        }));
      }

      // Обновляем текущие условия при пересчете цены
      const conditions = await getCurrentConditions(propertyId, checkIn, checkOut);
      setCurrentDailyPrice(conditions.dailyPrice);
      setCurrentMinStay(conditions.minStay);
    } catch (err) {
      console.error('Error calculating price:', err);
    } finally {
      setCalculatingPrice(false);
      isUpdatingFromConditions.current = false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!formData.property_id || !formData.guest_name || !formData.check_in || !formData.check_out) {
        setError(t('errors.fillAllFields'));
        return;
      }

      const checkInDate = parseISO(formData.check_in);
      const checkOutDate = parseISO(formData.check_out);

      if (checkOutDate <= checkInDate) {
        setError(t('errors.checkOutBeforeCheckIn'));
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
        guests_count: parseInt(formData.guests_count) || 1,
        notes: formData.notes || null,
        extra_services_amount: parseInt(formData.extra_services_amount) || 0,
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
        source: 'manual',
        guests_count: '1',
        notes: '',
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

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
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-white">{t('modals.addReservation')}</h2>
            <button
              type="button"
              onClick={async () => {
                if (formData.property_id && formData.check_in && formData.check_out) {
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
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!formData.property_id || !formData.check_in || !formData.check_out || calculatingPrice}
            >
              <Settings className="w-4 h-4" />
              {t('modals.changeConditions')}
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-200 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {t('modals.property')} *
              </label>
              <select
                value={formData.property_id}
                onChange={(e) =>
                  setFormData({ ...formData, property_id: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                required
              >
                <option value="">{t('modals.selectProperty', { defaultValue: 'Выберите объект' })}</option>
                {properties.map((prop) => (
                  <option key={prop.id} value={prop.id}>
                    {prop.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {t('modals.guestName')} *
              </label>
              <input
                type="text"
                value={formData.guest_name}
                onChange={(e) =>
                  setFormData({ ...formData, guest_name: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                placeholder={t('modals.guestNamePlaceholder', { defaultValue: 'Иван Иванов' })}
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
                placeholder={t('modals.guestEmailPlaceholder', { defaultValue: 'guest@example.com' })}
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
                placeholder={t('modals.guestPhonePlaceholder', { defaultValue: '+7 (999) 123-45-67' })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {t('modals.checkIn')} *
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
                {t('modals.checkOut')} *
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

            {/* 1. Общая цена (редактируемая) */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {t('modals.totalPrice')} ({formData.currency})
                {calculatingPrice && (
                  <span className="text-slate-400 text-xs ml-2">
                    {t('modals.calculating', { defaultValue: '(расчёт...)' })}
                  </span>
                )}
              </label>
              <InputNumber
                value={formData.total_price ? parseFloat(formData.total_price) : undefined}
                onChange={(value) => {
                  if (value !== null && value !== undefined) {
                    setFormData({ ...formData, total_price: value.toString() });
                  }
                }}
                min={0}
                step={1}
                precision={0}
                className="w-full"
                style={{ width: '100%' }}
                controls={true}
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                parser={(value) => Number(value!.replace(/\s?/g, '')) || 0}
                placeholder={t('modals.totalPricePlaceholder', { defaultValue: '0' })}
                disabled={calculatingPrice}
              />
            </div>

            {/* 2. Цена за ночь (редактируемая, округляется до целых) */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {t('modals.pricePerNight')}
                {formData.check_in && formData.check_out && (
                  <span className="text-slate-400 text-xs ml-2">
                    ({calculateNights(formData.check_in, formData.check_out)} {t('common.nights')})
                  </span>
                )}
              </label>
              <InputNumber
                value={formData.price_per_night ? parseFloat(formData.price_per_night) : undefined}
                onChange={(value) => {
                  if (value !== null && value !== undefined) {
                    setFormData({ ...formData, price_per_night: Math.round(value).toString() });
                  }
                }}
                min={0}
                step={1}
                precision={0}
                className="w-full"
                style={{ width: '100%' }}
                controls={true}
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                parser={(value) => Number(value!.replace(/\s?/g, '')) || 0}
                placeholder="0"
                disabled={calculatingPrice}
              />
            </div>

            {/* 3. Дополнительные услуги */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {t('modals.additionalServices')} ({formData.currency})
              </label>
              <InputNumber
                value={formData.extra_services_amount ? parseFloat(formData.extra_services_amount) : 0}
                onChange={(value) => {
                  if (value !== null && value !== undefined) {
                    setFormData({ ...formData, extra_services_amount: value.toString() });
                  }
                }}
                min={0}
                step={1}
                precision={0}
                className="w-full"
                style={{ width: '100%' }}
                controls={true}
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                parser={(value) => Number(value!.replace(/\s?/g, '')) || 0}
                placeholder="0"
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

            <div>
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
                placeholder={t('modals.guestsCountPlaceholder', { defaultValue: '1' })}
              />
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

          <div className="flex gap-3 justify-end pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-white transition"
              disabled={loading}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50"
              disabled={loading}
            >
              {loading ? t('modals.saving', { defaultValue: 'Saving...' }) : t('modals.saveBooking', { defaultValue: 'Save booking' })}
            </button>
          </div>
        </form>
      </div>

      {showConditionsModal && formData.property_id && formData.check_in && formData.check_out && (() => {
        // check_out - это дата выезда, которая не включается в бронирование
        // Для условий нужно передать последний день включительно (check_out - 1 день)
        const checkOutDate = new Date(formData.check_out);
        checkOutDate.setDate(checkOutDate.getDate() - 1);
        const endDateForConditions = checkOutDate.toISOString().split('T')[0];
        
        return (
          <ChangeConditionsModal
            isOpen={showConditionsModal}
            onClose={() => setShowConditionsModal(false)}
            onSuccess={async () => {
              // Пересчитываем цену после изменения условий
              await calculatePrice(formData.property_id, formData.check_in, formData.check_out);
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
    </div>
  );
}
