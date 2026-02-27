/**
 * TypeScript types for Avito API responses
 * Based on Avito API documentation: https://developers.avito.ru/api-catalog/str/documentation
 */

export interface AvitoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string | null;
  account_id?: string | null; // User ID from GET /core/v1/user (obtained during token exchange)
  // Note: Avito may provide refresh_token in some cases
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
    userId?: string; // Avito user_id (account number) - short number like 4720770
    itemId?: string;
    markup?: number;
    accessToken?: string;
    refreshToken?: string;
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

/** Ответ запроса GET /web/1/oauth/info (через Edge Function get-oauth-info) */
export interface AvitoOAuthInfoResult {
  skipped?: boolean;
  reason?: string;
  warning?: string;
  status?: number;
  data?: unknown;
}

