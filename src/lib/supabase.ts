import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type PropertyGroup = {
  id: string;
  name: string;
  user_id: string;
  color?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

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
  deleted_at: string | null;
  group_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Booking = {
  id: string;
  property_id: string;
  source: string;
  external_id: string | null;
  avito_booking_id?: string | null; // Unique identifier from Avito API
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

export type PropertyIntegration = {
  id: string;
  property_id: string;
  platform: string;
  external_id: string;
  markup_type: 'percent' | 'fixed';
  markup_value: number;
  is_enabled: boolean;
  last_sync_at: string | null;
  // Avito-specific fields
  avito_account_id?: string | null; // Account/user ID for API calls to /accounts/{account_id}/items/{item_id}/bookings
  avito_item_id?: string | null; // Item ID as TEXT - use this for API calls to /items/{item_id} (primary field)
  avito_item_id_text?: string | null; // Item ID as TEXT (legacy, kept for backward compatibility)
  avito_markup?: number | null;
  access_token_encrypted?: string | null;
  refresh_token_encrypted?: string | null;
  token_expires_at?: string | null;
  sync_interval_seconds?: number | null;
  is_active?: boolean | null;
};

// All supported aggregator platforms
export const AGGREGATOR_PLATFORMS = {
  // Main platforms (shown first)
  main: [
    { id: 'avito', name: 'Avito', hasApi: true },
    { id: 'booking', name: 'Booking.com', hasApi: false },
    { id: 'airbnb', name: 'Airbnb', hasApi: false },
    { id: 'cian', name: 'ЦИАН', hasApi: false },
  ],
  // Other platforms
  others: [
    { id: '101hotels', name: '101hotels.com', hasApi: false },
    { id: '1001kvartira', name: '1001kvartira.ru', hasApi: false },
    { id: 'apartsharing', name: 'Apart sharing', hasApi: false },
    { id: 'bronevik', name: 'Bronevik.com', hasApi: false },
    { id: 'cbooking', name: 'Cbooking', hasApi: false },
    { id: 'domclick', name: 'Домклик', hasApi: false },
    { id: 'edemvgosti', name: 'Edem-v-gosti.ru', hasApi: false },
    { id: 'expedia', name: 'Expedia.com', hasApi: false },
    { id: 'forento', name: 'Forento.ru/vkrim.info', hasApi: false },
    { id: 'gdekv', name: 'Гдеквартира', hasApi: false },
    { id: 'hotelbook', name: 'Hotelbook', hasApi: false },
    { id: 'kufar', name: 'Kufar.by', hasApi: false },
    { id: 'kvartirka', name: 'Kvartirka.com', hasApi: false },
    { id: 'mirtur', name: 'Миртурбаз', hasApi: false },
    { id: 'nochleg24', name: 'Nochleg24.com', hasApi: false },
    { id: 'onetwotrip', name: 'Onetwotrip.com', hasApi: false },
    { id: 'ostrovok', name: 'Ostrovok.ru', hasApi: false },
    { id: 'otello', name: 'Отелло', hasApi: false },
    { id: 'privettur', name: 'Приветтур', hasApi: false },
    { id: 'qqrenta', name: 'Qqrenta', hasApi: false },
    { id: 'roomook', name: 'Roomook', hasApi: false },
    { id: 'sutochno', name: 'Sutochno.ru', hasApi: false },
    { id: 'tripvenue', name: 'Трипвеню', hasApi: false },
    { id: 'tutu', name: 'Tutu', hasApi: false },
    { id: 'tvil', name: 'Tvil.ru', hasApi: false },
    { id: 'vezde', name: 'Везде как дома', hasApi: false },
    { id: 'yandex', name: 'Яндекс путешествия', hasApi: false },
    { id: 'zabroniryi', name: 'Zabroniryi.ru', hasApi: false },
    { id: 'zhilibyli', name: 'Жилибыли', hasApi: false },
    { id: 'icalendar', name: 'iCalendar', hasApi: true },
  ],
} as const;
