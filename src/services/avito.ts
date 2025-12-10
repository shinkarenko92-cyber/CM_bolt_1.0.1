/**
 * Avito OAuth and API service
 * Handles OAuth flow, progress saving, and Edge Function calls
 */

import { supabase } from '../lib/supabase';
import type {
  AvitoTokenResponse,
  AvitoAccount,
  ConnectionProgress,
  AvitoOAuthError,
  AvitoOAuthSuccess,
} from '../types/avito';

const PROGRESS_TTL = 3600000; // 1 hour in milliseconds

/**
 * Generate OAuth URL for Avito authorization
 * Uses VITE_AVITO_CLIENT_ID from environment (public, safe to expose)
 */
export function generateOAuthUrl(propertyId: string): string {
  const clientId = import.meta.env.VITE_AVITO_CLIENT_ID;
  
  if (!clientId) {
    throw new Error('VITE_AVITO_CLIENT_ID is not configured. Please set it in .env file.');
  }

  const state = btoa(
    JSON.stringify({
      property_id: propertyId,
      timestamp: Date.now(),
      random: Math.random().toString(36),
    })
  );

  const redirectUri = `${window.location.origin}/auth/avito-callback`;
  
  return `https://www.avito.ru/oauth?client_id=${clientId}&response_type=code&scope=user:read,short_term_rent:read,short_term_rent:write&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

/**
 * Parse and validate OAuth state
 */
export function parseOAuthState(state: string): { property_id: string; timestamp: number } | null {
  try {
    const decoded = JSON.parse(atob(state));
    // Validate state is not too old (max 1 hour)
    const age = Date.now() - decoded.timestamp;
    if (age > PROGRESS_TTL) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Save connection progress to localStorage with TTL
 */
export function saveConnectionProgress(
  propertyId: string,
  step: number,
  data: ConnectionProgress['data']
): void {
  const progress: ConnectionProgress = {
    step,
    data,
    timestamp: Date.now(),
  };
  localStorage.setItem(`avito_connect_${propertyId}`, JSON.stringify(progress));
}

/**
 * Load connection progress from localStorage
 * Returns null if expired (>1 hour) or not found
 */
export function loadConnectionProgress(propertyId: string): ConnectionProgress | null {
  const saved = localStorage.getItem(`avito_connect_${propertyId}`);
  if (!saved) return null;

  try {
    const progress: ConnectionProgress = JSON.parse(saved);
    const age = Date.now() - progress.timestamp;
    
    if (age > PROGRESS_TTL) {
      localStorage.removeItem(`avito_connect_${propertyId}`);
      return null;
    }
    
    return progress;
  } catch {
    localStorage.removeItem(`avito_connect_${propertyId}`);
    return null;
  }
}

/**
 * Clear connection progress
 */
export function clearConnectionProgress(propertyId: string): void {
  localStorage.removeItem(`avito_connect_${propertyId}`);
  localStorage.removeItem('avito_oauth_error');
  localStorage.removeItem('avito_oauth_success');
}

/**
 * Get OAuth error from localStorage (set by callback handler)
 */
export function getOAuthError(): AvitoOAuthError | null {
  const saved = localStorage.getItem('avito_oauth_error');
  if (!saved) return null;
  
  try {
    const error: AvitoOAuthError = JSON.parse(saved);
    localStorage.removeItem('avito_oauth_error');
    return error;
  } catch {
    localStorage.removeItem('avito_oauth_error');
    return null;
  }
}

/**
 * Get OAuth success (code + state) from localStorage (set by callback handler)
 */
export function getOAuthSuccess(): AvitoOAuthSuccess | null {
  const saved = localStorage.getItem('avito_oauth_success');
  if (!saved) return null;
  
  try {
    const success: AvitoOAuthSuccess = JSON.parse(saved);
    localStorage.removeItem('avito_oauth_success');
    return success;
  } catch {
    localStorage.removeItem('avito_oauth_success');
    return null;
  }
}

/**
 * Exchange OAuth code for access token via Edge Function
 * Client Secret is handled server-side in Edge Function
 */
export async function exchangeCodeForToken(code: string): Promise<AvitoTokenResponse> {
  const { data, error } = await supabase.functions.invoke('avito-sync', {
    body: {
      action: 'exchange-code',
      code,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to exchange code for token');
  }

  return data as AvitoTokenResponse;
}

/**
 * Get user accounts from Avito API via Edge Function
 */
export async function getUserAccounts(accessToken: string): Promise<AvitoAccount[]> {
  const { data, error } = await supabase.functions.invoke('avito-sync', {
    body: {
      action: 'get-accounts',
      access_token: accessToken,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to get user accounts');
  }

  return data as AvitoAccount[];
}

/**
 * Validate Item ID availability
 * Returns {available: true} if OK, {available: false, error: string} if conflict
 */
export async function validateItemId(
  accountId: string,
  itemId: string,
  accessToken: string
): Promise<{ available: boolean; error?: string }> {
  const { error } = await supabase.functions.invoke('avito-sync', {
    body: {
      action: 'validate-item',
      account_id: accountId,
      item_id: itemId,
      access_token: accessToken,
    },
  });

  if (error) {
    // Handle 409 conflict
    if (error.status === 409 || error.message?.includes('409')) {
      return {
        available: false,
        error: 'Этот ID уже используется в другой интеграции. Выберите другой.',
      };
    }
    return {
      available: false,
      error: error.message || 'Ошибка при проверке ID',
    };
  }

  return { available: true };
}

/**
 * Perform initial sync after connection
 */
export async function performInitialSync(integrationId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('avito-sync', {
    body: {
      action: 'initial-sync',
      integration_id: integrationId,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to perform initial sync');
  }
  
  // Initial sync completed successfully
}

