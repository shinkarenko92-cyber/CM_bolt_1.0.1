/**
 * Supabase client для Roomi Pro Mobile.
 * Сессия хранится в LargeSecureStore (MMKV + шифрование).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { secureStorage } from './secureStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
    : null;

export type Property = {
  id: string;
  owner_id: string;
  name: string;
  type: string;
  address: string | null;
  description: string | null;
  max_guests: number;
  bedrooms: number;
  base_price: number;
  currency: string;
  status: string;
  minimum_booking_days: number;
  image_url?: string | null;
  deleted_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Booking = {
  id: string;
  property_id: string;
  source: string;
  external_id: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  guests_count: number;
  total_price: number;
  currency: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingWithProperty = Booking & {
  properties?: { name: string } | null;
};

export type Profile = {
  id: string;
  full_name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  subscription_tier: string;
  subscription_expires_at: string | null;
  role: 'user' | 'admin';
  is_active: boolean;
  theme?: 'light' | 'dark';
  created_at: string;
  updated_at: string;
};
