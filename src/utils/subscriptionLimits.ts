import type { Profile } from '../lib/supabase';

/**
 * Лимиты по тарифам — единый источник правды.
 * Использовать через getPropertyLimit(profile) / getBookingLimit(profile).
 * Проверки: при добавлении объекта — Dashboard; при создании брони — опционально по getBookingLimit.
 */

/** Максимальное число объектов недвижимости по тарифу */
export const PROPERTY_LIMITS: Record<string, number> = {
  free: 1,
  basic: 1,
  trial: 3,
  start: 3,
  starter: 3,
  pro: 8,
  business: 15,
  premium: 15,
  enterprise: 999,
};

/**
 * Лимит бронирований в месяц по тарифу (-1 = без лимита).
 * При необходимости проверять перед созданием брони: счёт за текущий месяц vs getBookingLimit(profile).
 */
export const BOOKING_LIMITS_PER_MONTH: Record<string, number> = {
  free: 5,
  basic: 5,
  trial: 20,
  start: 30,
  starter: 30,
  pro: 100,
  business: 300,
  premium: 300,
  enterprise: -1,
};

/**
 * Возвращает лимит объектов для профиля.
 * Триал с истёкшим сроком считается как free (1 объект).
 */
export function getPropertyLimit(profile: Profile | null): number {
  if (!profile) return PROPERTY_LIMITS.free;
  const tier = profile.subscription_tier ?? 'free';
  const isTrialExpired =
    tier === 'trial' &&
    profile.subscription_expires_at &&
    new Date(profile.subscription_expires_at) < new Date();
  if (isTrialExpired) return PROPERTY_LIMITS.free;
  return PROPERTY_LIMITS[tier] ?? PROPERTY_LIMITS.free;
}

/** Истёк ли триал (tier === 'trial' и subscription_expires_at в прошлом) */
export function isTrialExpired(profile: Profile | null): boolean {
  if (!profile || profile.subscription_tier !== 'trial') return false;
  if (!profile.subscription_expires_at) return false;
  return new Date(profile.subscription_expires_at) < new Date();
}

/**
 * Лимит бронирований в месяц для профиля. -1 = без лимита.
 * Использовать: сравнить с количеством броней за текущий месяц по объектам пользователя.
 */
export function getBookingLimit(profile: Profile | null): number {
  if (!profile) return BOOKING_LIMITS_PER_MONTH.free;
  const tier = profile.subscription_tier ?? 'free';
  const isTrialExpired =
    tier === 'trial' &&
    profile.subscription_expires_at &&
    new Date(profile.subscription_expires_at) < new Date();
  if (isTrialExpired) return BOOKING_LIMITS_PER_MONTH.free;
  return BOOKING_LIMITS_PER_MONTH[tier] ?? BOOKING_LIMITS_PER_MONTH.free;
}
