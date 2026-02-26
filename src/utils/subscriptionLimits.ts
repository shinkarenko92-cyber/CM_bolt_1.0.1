import type { Profile } from '../lib/supabase';

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
