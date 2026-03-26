import type { Booking, Guest } from '@/lib/supabase';

/** Digits only, Russian 7/8 prefix normalized to 10 local digits when possible */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    return digits.slice(1);
  }
  if (digits.length === 10) return digits;
  return digits;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  return email.trim().toLowerCase();
}

/** Resolve guest row: guest_id first, then phone, then email */
export function resolveGuestFromBooking(booking: Booking, guests: Guest[]): Guest | null {
  if (booking.guest_id) {
    const byId = guests.find((g) => g.id === booking.guest_id);
    if (byId) return byId;
  }
  const phoneNorm = normalizePhone(booking.guest_phone);
  if (phoneNorm) {
    const byPhone = guests.find((g) => normalizePhone(g.phone) === phoneNorm);
    if (byPhone) return byPhone;
  }
  const emailNorm = normalizeEmail(booking.guest_email);
  if (emailNorm) {
    const byEmail = guests.find((g) => normalizeEmail(g.email) === emailNorm);
    if (byEmail) return byEmail;
  }
  return null;
}

/**
 * All bookings for this client: by guest_id, plus legacy rows without guest_id but same phone/email.
 */
export function getBookingsForGuestDisplay(
  booking: Booking,
  resolvedGuest: Guest | null,
  allBookings: Booking[]
): Booking[] {
  if (!resolvedGuest) return [];

  const phoneNorm = normalizePhone(booking.guest_phone);
  const emailNorm = normalizeEmail(booking.guest_email);

  const filtered = allBookings.filter((b) => {
    if (b.guest_id === resolvedGuest.id) return true;
    if (b.guest_id) return false;
    if (phoneNorm && normalizePhone(b.guest_phone) === phoneNorm) return true;
    if (emailNorm && normalizeEmail(b.guest_email) === emailNorm) return true;
    return false;
  });

  filtered.sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime());
  return filtered;
}

export function getGuestBookingsSorted(guestId: string, allBookings: Booking[]): Booking[] {
  return allBookings
    .filter((b) => b.guest_id === guestId)
    .sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime());
}
