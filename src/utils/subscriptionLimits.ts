import type { Profile } from '@/lib/supabase';

/**
 * Лимиты по тарифам — единый источник правды.
 * Demo: 7 дней при первой регистрации, все функции, без ограничений.
 * Start: 1–3 квартиры, Pro: 4–8, Business: 8–15, Enterprise: 15+.
 */

/** Максимальное число объектов недвижимости по тарифу */
export const PROPERTY_LIMITS: Record<string, number> = {
  free: 1,
  basic: 1,
  demo: 999,
  trial: 999, // legacy, обрабатывается как demo
  start: 3,
  starter: 3,
  pro: 8,
  business: 15,
  premium: 15,
  enterprise: 999,
};

/**
 * Лимит бронирований в месяц по тарифу (-1 = без лимита).
 * Сейчас лимитов по бронированиям нет — у всех -1.
 */
export const BOOKING_LIMITS_PER_MONTH: Record<string, number> = {
  free: -1,
  basic: -1,
  demo: -1,
  trial: -1,
  start: -1,
  starter: -1,
  pro: -1,
  business: -1,
  premium: -1,
  enterprise: -1,
};

/** Цены по тарифам (для отображения в профиле), ₽/мес */
export const TIER_PRICE_RUB: Record<string, number | null> = {
  free: 0,
  basic: 0,
  demo: null,
  trial: null,
  start: 2990,
  starter: 2990,
  pro: 4990,
  business: 9990,
  premium: 9990,
  enterprise: null, // по запросу
};

/** Описание диапазона объектов по тарифу (для UI) */
export const TIER_OBJECT_RANGE: Record<string, string> = {
  free: '1 объект',
  basic: '1 объект',
  demo: 'Все функции без ограничений',
  trial: 'Все функции без ограничений',
  start: '1–3 квартиры',
  starter: '1–3 квартиры',
  pro: '4–8 квартир',
  business: '8–15 квартир',
  enterprise: '15+ объектов',
};

function isDemoOrTrialExpired(profile: Profile | null): boolean {
  if (!profile) return false;
  const tier = profile.subscription_tier ?? 'free';
  if (tier !== 'demo' && tier !== 'trial') return false;
  if (!profile.subscription_expires_at) return false;
  return new Date(profile.subscription_expires_at) < new Date();
}

/**
 * Возвращает лимит объектов для профиля.
 * Демо/триал с истёкшим сроком считаются как free (1 объект).
 */
export function getPropertyLimit(profile: Profile | null): number {
  if (!profile) return PROPERTY_LIMITS.free;
  const tier = profile.subscription_tier ?? 'free';
  if (isDemoOrTrialExpired(profile)) return PROPERTY_LIMITS.free;
  return PROPERTY_LIMITS[tier] ?? PROPERTY_LIMITS.free;
}

/** Истёк ли демо (tier === 'demo' или 'trial' и subscription_expires_at в прошлом) */
export function isDemoExpired(profile: Profile | null): boolean {
  return isDemoOrTrialExpired(profile);
}

/** @deprecated Используй isDemoExpired. Оставлено для совместимости. */
export function isTrialExpired(profile: Profile | null): boolean {
  return isDemoOrTrialExpired(profile);
}

/**
 * Лимит бронирований в месяц для профиля. -1 = без лимита.
 */
export function getBookingLimit(profile: Profile | null): number {
  if (!profile) return BOOKING_LIMITS_PER_MONTH.free;
  const tier = profile.subscription_tier ?? 'free';
  if (isDemoOrTrialExpired(profile)) return BOOKING_LIMITS_PER_MONTH.free;
  return BOOKING_LIMITS_PER_MONTH[tier] ?? BOOKING_LIMITS_PER_MONTH.free;
}
