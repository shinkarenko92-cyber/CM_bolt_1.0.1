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

export type Profile = {
  id: string;
  full_name: string | null;
  business_name: string | null;
  telegram_id: string | null;
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

export type AdminAction = {
  id: string;
  admin_id: string;
  action_type: string;
  target_user_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type PropertyRate = {
  id: string;
  property_id: string;
  date: string;
  daily_price: number;
  min_stay: number;
  currency: string;
  created_at: string;
  updated_at: string;
};
