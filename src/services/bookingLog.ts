// Helper functions for booking audit logging

import { supabase } from '../lib/supabase';

export interface BookingChanges {
  [field: string]: {
    old?: unknown;
    new?: unknown;
  };
}

/**
 * Log a booking change to the audit log
 * @param bookingId - ID of the booking
 * @param propertyId - ID of the property
 * @param action - Action type: 'created', 'updated', 'deleted', 'status_changed', etc.
 * @param changes - Object with field changes (optional)
 * @param source - Source of the change: 'manual', 'avito', 'cian', etc.
 */
export async function logBookingChange(
  bookingId: string,
  propertyId: string,
  action: string,
  changes?: BookingChanges,
  source: string = 'manual'
): Promise<void> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('Cannot log booking change: user not authenticated');
      return;
    }

    // Call Edge Function to log the change
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn('Cannot log booking change: no session');
      return;
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-booking-change`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        booking_id: bookingId,
        property_id: propertyId,
        action,
        changes: changes || null,
        source,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to log booking change:', error);
      // Don't throw - logging failures shouldn't break the main flow
    }
  } catch (error) {
    console.error('Error logging booking change:', error);
    // Don't throw - logging failures shouldn't break the main flow
  }
}

/**
 * Compare two booking objects and return changes
 */
export function getBookingChanges(oldBooking: Partial<Record<string, unknown>>, newBooking: Partial<Record<string, unknown>>): BookingChanges {
  const changes: BookingChanges = {};
  const fieldsToTrack = [
    'guest_name',
    'guest_email',
    'guest_phone',
    'check_in',
    'check_out',
    'guests_count',
    'total_price',
    'currency',
    'status',
    'notes',
    'extra_services_amount',
    'property_id',
  ];

  for (const field of fieldsToTrack) {
    const oldValue = oldBooking[field];
    const newValue = newBooking[field];
    
    if (oldValue !== newValue) {
      changes[field] = {
        old: oldValue,
        new: newValue,
      };
    }
  }

  return changes;
}
