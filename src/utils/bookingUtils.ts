/**
 * Shared booking utility functions.
 * Centralises logic that was previously duplicated across
 * AddReservationModal, EditReservationModal, BookingsView, etc.
 */

import { differenceInDays, parseISO } from 'date-fns';
import { supabase, Property } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Returns the number of nights between two ISO-date strings.
 * Returns 0 if either value is empty or checkout ≤ checkin.
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const start = parseISO(checkIn);
  const end = parseISO(checkOut);
  if (end <= start) return 0;
  return differenceInDays(end, start);
}

/**
 * Validates that checkOut is strictly after checkIn.
 * Returns null when valid, or an error key when invalid.
 */
export type DateValidationError = 'fillAllFields' | 'checkOutBeforeCheckIn';

export function validateDateRange(
  checkIn: string,
  checkOut: string
): DateValidationError | null {
  if (!checkIn || !checkOut) return 'fillAllFields';
  if (parseISO(checkOut) <= parseISO(checkIn)) return 'checkOutBeforeCheckIn';
  return null;
}

// ---------------------------------------------------------------------------
// Pricing helpers
// ---------------------------------------------------------------------------

export interface PropertyConditions {
  dailyPrice: number;
  minStay: number;
}

/**
 * Loads date-specific rates from `property_rates` and returns the
 * average daily price and maximum minimum-stay for the given period.
 *
 * Falls back to property.base_price / property.minimum_booking_days
 * when no rate rows exist or a DB error occurs.
 */
export async function getPropertyConditions(
  property: Property,
  checkIn: string,
  checkOut: string
): Promise<PropertyConditions> {
  const fallback: PropertyConditions = {
    dailyPrice: property.base_price || 0,
    minStay: property.minimum_booking_days || 1,
  };

  try {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const dates: string[] = [];
    for (const d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }
    if (dates.length === 0) return fallback;

    const { data: rates, error } = await supabase
      .from('property_rates')
      .select('*')
      .eq('property_id', property.id);

    if (error) throw error;

    const filteredRates = (rates ?? []).filter((r) => dates.includes(r.date));
    let totalPrice = 0;
    let maxMinStay = property.minimum_booking_days || 1;

    for (const date of dates) {
      const rate = filteredRates.find((r) => r.date === date);
      if (rate) {
        totalPrice += Number(rate.daily_price) || 0;
        maxMinStay = Math.max(maxMinStay, rate.min_stay || 1);
      } else {
        totalPrice += property.base_price || 0;
      }
    }

    return {
      dailyPrice: dates.length > 0 ? totalPrice / dates.length : fallback.dailyPrice,
      minStay: maxMinStay,
    };
  } catch {
    return fallback;
  }
}

/**
 * Calls the `calculate_booking_price` RPC and returns the base price
 * (without extra services).  Returns null on error.
 */
export async function fetchCalculatedPrice(
  propertyId: string,
  checkIn: string,
  checkOut: string
): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc('calculate_booking_price', {
      p_property_id: propertyId,
      p_check_in: checkIn,
      p_check_out: checkOut,
    });
    if (error) throw error;
    return data as number;
  } catch {
    return null;
  }
}
