/**
 * TypeScript types for Avito API responses
 * Based on Avito API documentation: https://developers.avito.ru/api-catalog/str/documentation
 */

export interface AvitoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  // Note: Avito does NOT provide refresh_token in Authorization Code flow (as of Dec 2025)
}

export interface AvitoAccount {
  id: string;
  name: string;
  is_primary: boolean;
}

export interface AvitoItem {
  id: string;
  title: string;
  price: number;
  address: string;
  status: 'active' | 'blocked' | 'removed' | 'old';
  url: string;
  category: {
    id: number;
    name: string;
  };
}

export interface AvitoBooking {
  id: string;
  item_id: string;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
  guest_name: string;
  guest_phone?: string;
  total_price: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
}

export interface AvitoAvailability {
  date: string; // YYYY-MM-DD
  available: boolean;
  price?: number;
  min_stay?: number;
}

export interface ConnectionProgress {
  step: number;
  data: {
    accountId?: string;
    itemId?: string;
    markup?: number;
    accessToken?: string;
  };
  timestamp: number;
}

export interface AvitoOAuthError {
  error: string;
  error_description?: string;
}

export interface AvitoOAuthSuccess {
  code: string;
  state: string;
}

