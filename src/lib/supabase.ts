import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
