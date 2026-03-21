/**
 * Shared hook that encapsulates the price-sync logic used in both
 * AddReservationModal and EditReservationModal.
 *
 * Replaces the fragile useRef-flag pattern with a single `priceSource`
 * state that tracks which field was edited last, so we know which direction
 * to sync without risk of infinite loops or race conditions.
 */

import { useState, useEffect, useCallback } from 'react';
import { Property } from '@/lib/supabase';
import {
  calculateNights,
  getPropertyConditions,
  fetchCalculatedPrice,
  PropertyConditions,
} from '@/utils/bookingUtils';

export interface ReservationFormPriceState {
  property_id: string;
  check_in: string;
  check_out: string;
  price_per_night: string;
  total_price: string;
  extra_services_amount: string;
}

type PriceSource = 'conditions' | 'perNight' | 'total' | null;

export interface UseReservationFormPriceReturn {
  priceState: ReservationFormPriceState;
  setPriceField: (field: keyof ReservationFormPriceState, value: string) => void;
  calculatingPrice: boolean;
  currentDailyPrice: number;
  currentMinStay: number;
}

/**
 * Manages bidirectional price-per-night ↔ total-price synchronisation.
 *
 * Rules:
 * - When property/dates change → fetch from DB (source = 'conditions')
 * - When user edits price_per_night → recalculate total (source = 'perNight')
 * - When user edits total_price → recalculate per-night (source = 'total')
 * - extra_services_amount always participates in total calculation
 */
export function useReservationFormPrice(
  properties: Property[],
  initial: ReservationFormPriceState
): UseReservationFormPriceReturn {
  const [priceState, setPriceState] = useState<ReservationFormPriceState>(initial);
  const [priceSource, setPriceSource] = useState<PriceSource>(null);
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [conditions, setConditions] = useState<PropertyConditions>({ dailyPrice: 0, minStay: 1 });

  // Update a single price-related field and record who changed it
  const setPriceField = useCallback(
    (field: keyof ReservationFormPriceState, value: string) => {
      setPriceState(prev => ({ ...prev, [field]: value }));
      if (field === 'price_per_night') setPriceSource('perNight');
      if (field === 'total_price') setPriceSource('total');
      if (field === 'extra_services_amount') {
        // Recalculate total from per-night when extra services change
        setPriceSource('perNight');
      }
      if (['property_id', 'check_in', 'check_out'].includes(field)) {
        setPriceSource('conditions');
      }
    },
    []
  );

  // Fetch from DB when property/dates change
  useEffect(() => {
    const { property_id, check_in, check_out } = priceState;
    if (!property_id || !check_in || !check_out) return;
    const property = properties.find(p => p.id === property_id);
    if (!property) return;

    let cancelled = false;
    setCalculatingPrice(true);

    (async () => {
      try {
        const [basePrice, cond] = await Promise.all([
          fetchCalculatedPrice(property_id, check_in, check_out),
          getPropertyConditions(property, check_in, check_out),
        ]);
        if (cancelled) return;

        setConditions(cond);

        if (basePrice !== null) {
          const nights = calculateNights(check_in, check_out);
          const extra = parseFloat(priceState.extra_services_amount) || 0;
          const perNight = nights > 0 ? Math.round(basePrice / nights) : 0;
          setPriceState(prev => ({
            ...prev,
            price_per_night: perNight.toString(),
            total_price: Math.round(basePrice + extra).toString(),
          }));
          setPriceSource(null);
        }
      } catch {
        // fallback — keep existing values
      } finally {
        if (!cancelled) setCalculatingPrice(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceState.property_id, priceState.check_in, priceState.check_out, properties]);

  // price_per_night → total_price
  useEffect(() => {
    if (priceSource !== 'perNight' || calculatingPrice) return;
    const nights = calculateNights(priceState.check_in, priceState.check_out);
    if (nights <= 0) return;
    const perNight = parseFloat(priceState.price_per_night) || 0;
    const extra = parseFloat(priceState.extra_services_amount) || 0;
    const newTotal = Math.round(perNight * nights + extra);
    const current = parseFloat(priceState.total_price) || 0;
    if (Math.abs(newTotal - current) > 0.01) {
      setPriceState(prev => ({ ...prev, total_price: newTotal.toString() }));
    }
    setPriceSource(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceState.price_per_night, priceState.extra_services_amount, priceSource]);

  // total_price → price_per_night
  useEffect(() => {
    if (priceSource !== 'total' || calculatingPrice) return;
    const nights = calculateNights(priceState.check_in, priceState.check_out);
    if (nights <= 0) return;
    const total = parseFloat(priceState.total_price) || 0;
    const extra = parseFloat(priceState.extra_services_amount) || 0;
    const newPerNight = Math.round((total - extra) / nights);
    const current = Math.round(parseFloat(priceState.price_per_night) || 0);
    if (newPerNight !== current) {
      setPriceState(prev => ({ ...prev, price_per_night: newPerNight.toString() }));
    }
    setPriceSource(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceState.total_price, priceSource]);

  return {
    priceState,
    setPriceField,
    calculatingPrice,
    currentDailyPrice: conditions.dailyPrice,
    currentMinStay: conditions.minStay,
  };
}
