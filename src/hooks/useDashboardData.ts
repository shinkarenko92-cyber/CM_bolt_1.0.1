/**
 * Extracts data-loading concerns from Dashboard.tsx.
 *
 * Handles: properties, bookings, guests, user profile — all with retry logic.
 * Returns stable setters so Dashboard can mutate the arrays (add / update / delete)
 * without re-triggering fetches.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase, Property, Booking, Profile, Guest } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { message: string; details?: string; hint?: string; code?: string } | null;
};

async function retryQuery<T>(
  queryFn: () => Promise<SupabaseQueryResult<T>>,
  retries = 3,
  delay = 1000
): Promise<SupabaseQueryResult<T>> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await queryFn();
      if (!result.error || !result.error.message.includes('Failed to fetch')) {
        return result;
      }
      if (attempt === retries) {
        console.error(`Query failed after ${retries} attempts:`, result.error);
        return result;
      }
      await new Promise(r => setTimeout(r, delay * attempt));
    } catch (error: unknown) {
      if (attempt === retries) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Query failed after ${retries} attempts:`, msg);
        return {
          data: null,
          error: { message: msg, details: error instanceof Error ? error.stack : undefined },
        };
      }
      await new Promise(r => setTimeout(r, delay * attempt));
    }
  }
  return { data: null, error: { message: 'Max retries exceeded' } };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseDashboardDataReturn {
  properties: Property[];
  bookings: Booking[];
  filteredBookings: Booking[];
  guests: Guest[];
  userProfile: Profile | null;
  loading: boolean;
  loadError: string | null;
  setProperties: React.Dispatch<React.SetStateAction<Property[]>>;
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  setFilteredBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  setGuests: React.Dispatch<React.SetStateAction<Guest[]>>;
  setUserProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  reload: () => void;
}

export function useDashboardData(): UseDashboardDataReturn {
  const { t } = useTranslation();
  const { user, refreshProfile } = useAuth();

  const [properties, setProperties] = useState<Property[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoadError(null);

    try {
      await supabase.auth.getSession();

      // Properties
      const { data: propertiesData, error: propsError } = await retryQuery<Property[]>(
        async () => {
          const r = await supabase
            .from('properties')
            .select('*')
            .eq('owner_id', user.id)
            .is('deleted_at', null);
          return {
            data: r.data,
            error: r.error
              ? { message: r.error.message, details: r.error.details, hint: r.error.hint, code: r.error.code }
              : null,
          };
        }
      );

      if (propsError) {
        toast.error(`${t('errors.failedToLoadProperties')}: ${propsError.message}`);
      }

      if (propertiesData) {
        setProperties(propertiesData);

        const propertyIds = propertiesData.map((p: Property) => p.id);

        if (propertyIds.length > 0) {
          // Bookings (confirmed + paid only)
          const { data: bookingsData, error: bookingsError } = await retryQuery<Booking[]>(
            async () => {
              const r = await supabase
                .from('bookings')
                .select('*')
                .in('property_id', propertyIds)
                .in('status', ['confirmed', 'paid'])
                .order('check_in');
              return {
                data: r.data,
                error: r.error
                  ? { message: r.error.message, details: r.error.details, hint: r.error.hint, code: r.error.code }
                  : null,
              };
            }
          );

          if (bookingsError) {
            toast.error(`${t('errors.failedToLoadBookings')}: ${bookingsError.message}`);
          }

          if (bookingsData) {
            setBookings(bookingsData);
            setFilteredBookings(bookingsData);
          }
        }
      }

      // Profile
      const { data: profileData } = await retryQuery<Profile>(
        async () => {
          const r = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
          return {
            data: r.data,
            error: r.error
              ? { message: r.error.message, details: r.error.details, hint: r.error.hint, code: r.error.code }
              : null,
          };
        }
      );

      if (profileData) {
        setUserProfile(profileData);
        await refreshProfile();
      }

      // Guests
      const { data: guestsData } = await retryQuery<Guest[]>(
        async () => {
          const r = await supabase
            .from('guests')
            .select('*')
            .eq('owner_id', user.id)
            .order('name');
          return {
            data: r.data,
            error: r.error
              ? { message: r.error.message, details: r.error.details, hint: r.error.hint, code: r.error.code }
              : null,
          };
        }
      );

      if (guestsData) setGuests(guestsData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      const msg = error instanceof Error ? error.message : t('errors.somethingWentWrong');
      setLoadError(msg);
      toast.error(`${t('errors.failedToLoadData')}: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [user, t, refreshProfile]);

  // Stable ref so we can call loadData without stale closure issues
  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    if (!user?.id) return;
    loadDataRef.current();
  }, [user?.id]);

  return {
    properties,
    bookings,
    filteredBookings,
    guests,
    userProfile,
    loading,
    loadError,
    setProperties,
    setBookings,
    setFilteredBookings,
    setGuests,
    setUserProfile,
    reload: () => loadDataRef.current(),
  };
}
