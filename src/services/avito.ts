/**
 * Avito OAuth and API service
 * Handles OAuth flow, progress saving, and Edge Function calls
 */

import { supabase } from '@/lib/supabase';
import type {
  AvitoTokenResponse,
  AvitoAccount,
  ConnectionProgress,
  AvitoOAuthError,
  AvitoOAuthSuccess,
} from '@/types/avito';

const PROGRESS_TTL = 3600000; // 1 hour in milliseconds

// Тип для ошибки с деталями от Avito API
interface ErrorWithDetails extends Error {
  details?: {
    error?: string;
    error_description?: string;
    details?: string;
  } | null;
  originalError?: unknown;
}

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

  // Используем фиксированный redirect_uri для консистентности
  // Должен совпадать с настройками в Avito: https://app.roomi.pro/auth/avito-callback
  const redirectUri = import.meta.env.VITE_AVITO_REDIRECT_URI || 'https://app.roomi.pro/auth/avito-callback';
  
  // Спецификация Avito: https://avito.ru/oauth
  return `https://avito.ru/oauth?client_id=${clientId}&response_type=code&scope=user:read,short_term_rent:read,short_term_rent:write&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

/**
 * Generate OAuth URL to extend scope for Messenger (adds messenger:read, messenger:write).
 * Uses VITE_AVITO_MESSENGER_CLIENT_ID if set (отдельное приложение Avito для мессенджера), иначе VITE_AVITO_CLIENT_ID.
 * Должен совпадать с AVITO_MESSENGER_CLIENT_ID на бэкенде при обмене code на token.
 * integrationId can be null — тогда callback выберет первую интеграцию пользователя (fallback).
 */
export async function generateMessengerOAuthUrl(
  integrationId: string | null | undefined,
  currentScope?: string | null
): Promise<string> {
  const clientId =
    import.meta.env.VITE_AVITO_MESSENGER_CLIENT_ID || import.meta.env.VITE_AVITO_CLIENT_ID;

  if (!clientId) {
    throw new Error('VITE_AVITO_CLIENT_ID or VITE_AVITO_MESSENGER_CLIENT_ID must be set in .env');
  }

  const finalIntegrationId = integrationId ?? null;
  // Всегда запрашиваем полный набор scope для messenger (по спецификации Avito)
  const baseScopes = ['user:read', 'short_term_rent:read', 'short_term_rent:write'];
  const messengerScopes = ['messenger:read', 'messenger:write'];
  const existingScopes = currentScope ? currentScope.split(/\s+/).filter(Boolean) : [];
  const allScopes = [...new Set([...baseScopes, ...messengerScopes, ...existingScopes])];
  const scopeString = allScopes.join(' ');

  const stateObj = {
    type: 'messenger_auth',
    integration_id: finalIntegrationId,
    ts: Date.now(),
    nonce: crypto.randomUUID().slice(0, 16),
  };
  const state = btoa(JSON.stringify(stateObj));

  const redirectUri = import.meta.env.VITE_AVITO_REDIRECT_URI || 'https://app.roomi.pro/auth/avito-callback';

  // Спецификация Avito: https://avito.ru/oauth
  return `https://avito.ru/oauth?client_id=${clientId}&response_type=code&scope=${encodeURIComponent(scopeString)}&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
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
  clearOAuthError();
  clearOAuthSuccess();
}

/**
 * Get OAuth error from localStorage (set by callback handler)
 * Does NOT remove from localStorage - call clearOAuthError() after handling
 */
export function getOAuthError(): AvitoOAuthError | null {
  const saved = localStorage.getItem('avito_oauth_error');
  if (!saved) return null;
  
  try {
    const error: AvitoOAuthError = JSON.parse(saved);
    // НЕ удаляем здесь - удалим после обработки
    return error;
  } catch {
    localStorage.removeItem('avito_oauth_error');
    return null;
  }
}

/**
 * Get OAuth success (code + state) from localStorage (set by callback handler)
 * Does NOT remove from localStorage - call clearOAuthSuccess() after handling
 */
export function getOAuthSuccess(): AvitoOAuthSuccess | null {
  const saved = localStorage.getItem('avito_oauth_success');
  if (!saved) return null;
  
  try {
    const success: AvitoOAuthSuccess = JSON.parse(saved);
    // НЕ удаляем здесь - удалим после обработки
    return success;
  } catch {
    localStorage.removeItem('avito_oauth_success');
    return null;
  }
}

/**
 * Clear OAuth error from localStorage (call after handling)
 */
export function clearOAuthError(): void {
  localStorage.removeItem('avito_oauth_error');
}

/**
 * Clear OAuth success from localStorage (call after handling)
 */
export function clearOAuthSuccess(): void {
  localStorage.removeItem('avito_oauth_success');
}

/**
 * Exchange OAuth code for access token via Edge Function
 * Client Secret is handled server-side in Edge Function
 * @param code - OAuth authorization code
 * @param redirectUri - Redirect URI that was used in OAuth request (must match exactly)
 */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<AvitoTokenResponse> {
  const { data, error } = await supabase.functions.invoke('avito_sync', {
    body: {
      action: 'exchange-code',
      code,
      redirect_uri: redirectUri, // Передаём redirect_uri из фронтенда
    },
  });

  if (error) {
    console.error('exchangeCodeForToken: Edge Function error', {
      error,
      message: error.message,
      context: error.context,
      status: error.status,
      data: error.data
    });

    // Извлекаем детали ошибки из error.data
    let errorMessage = error.message || 'Failed to exchange code for token';
    let errorDetails: { error?: string; error_description?: string; details?: string } | null = null;

    // Проверяем error.data для получения деталей от Avito API
    if (error.data) {
      try {
        // error.data может быть строкой или объектом
        if (typeof error.data === 'string') {
          errorDetails = JSON.parse(error.data);
        } else if (typeof error.data === 'object') {
          errorDetails = error.data;
        }

        // Если есть детали от Avito API, используем их
        if (errorDetails) {
          if (errorDetails.error) {
            errorMessage = `Avito API error: ${errorDetails.error}`;
            if (errorDetails.error_description) {
              errorMessage += ` - ${errorDetails.error_description}`;
            }
          } else if (errorDetails.details) {
            errorMessage = `${errorMessage}: ${errorDetails.details}`;
          }
        }
      } catch (parseError) {
        if (import.meta.env.DEV) console.warn('exchangeCodeForToken: Failed to parse error.data', parseError);
        // Если не удалось распарсить, используем исходное сообщение
      }
    }
    
    if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('DEPLOYMENT_NOT_FOUND')) {
      throw new Error('Edge Function avito_sync не развернута. Пожалуйста, разверните функцию в Supabase Dashboard.');
    }

    // Сохраняем детали ошибки для специальной обработки invalid_grant
    const errorWithDetails: ErrorWithDetails = new Error(errorMessage);
    errorWithDetails.details = errorDetails;
    errorWithDetails.originalError = error;
    throw errorWithDetails;
  }

  return data as AvitoTokenResponse;
}

/**
 * Get user accounts from Avito API via Edge Function
 */
export async function getUserAccounts(accessToken: string): Promise<AvitoAccount[]> {
  // Валидация токена
  if (!accessToken || accessToken.trim() === '') {
    console.error('getUserAccounts called with empty or invalid accessToken');
    throw new Error('Access token is required');
  }
  
  if (import.meta.env.DEV) console.log('Calling getUserAccounts with token length:', accessToken.length);

  const { data, error } = await supabase.functions.invoke('avito_sync', {
    body: {
      action: 'get-accounts',
      access_token: accessToken,
    },
  });

  if (import.meta.env.DEV) console.log('getUserAccounts: Edge Function response', {
    hasData: !!data,
    hasError: !!error,
    dataType: data ? typeof data : 'null',
    dataIsArray: Array.isArray(data),
    dataLength: Array.isArray(data) ? data.length : 'not array',
    errorMessage: error?.message,
    errorStatus: error?.status,
    errorData: error?.data
  });

  if (error) {
    console.error('getUserAccounts: Edge Function error', {
      error,
      message: error.message,
      context: error.context,
      status: error.status,
      data: error.data
    });

    const errorMessage = error.message || 'Failed to get user accounts';
    
    if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('DEPLOYMENT_NOT_FOUND')) {
      throw new Error('Edge Function avito_sync не развернута. Пожалуйста, разверните функцию в Supabase Dashboard.');
    }

    // Если есть детали ошибки в data, добавляем их к сообщению
    let detailedMessage = errorMessage;
    if (error.data) {
      try {
        const errorData = typeof error.data === 'string' ? JSON.parse(error.data) : error.data;
        if (errorData.error || errorData.message) {
          detailedMessage = `${errorMessage}: ${errorData.error || errorData.message}`;
        }
      } catch {
        // Если не удалось распарсить, используем исходное сообщение
      }
    }
    
    throw new Error(detailedMessage);
  }

  // Проверяем, что data существует и является массивом
  if (!data) {
    if (import.meta.env.DEV) console.warn('getUserAccounts: No data returned from Edge Function, returning empty array', {
      error: error?.message,
      errorData: error?.data
    });
    return [];
  }

  if (!Array.isArray(data)) {
    console.error('getUserAccounts: Data is not an array', { 
      data,
      dataType: typeof data,
      dataKeys: typeof data === 'object' ? Object.keys(data) : 'not object'
    });
    throw new Error('Invalid response format from Edge Function: expected array, got ' + typeof data);
  }

  if (import.meta.env.DEV) console.log('getUserAccounts: Successfully received accounts', {
    count: data.length,
    accounts: data.map(acc => ({
      id: acc.id,
      name: acc.name,
      is_primary: acc.is_primary
    }))
  });

  return data as AvitoAccount[];
}

/**
 * Validate Item ID availability
 * Returns {available: true} if OK, {available: false, error: string} if conflict
 */
export async function validateItemId(
  itemId: string,
  integrationId: string,
  propertyId?: string
): Promise<{ available: boolean; error?: string }> {
  if (import.meta.env.DEV) console.log('validateItemId: Validating item', {
    itemId,
    integrationId,
    propertyId,
  });

  const { data, error } = await supabase.functions.invoke('avito_sync', {
    body: {
      action: 'validate-item',
      integration_id: integrationId,
      item_id: itemId,
      property_id: propertyId, // Передаем property_id для проверки переподключения
    },
  });

  if (import.meta.env.DEV) console.log('validateItemId: Edge Function response', {
    hasData: !!data,
    hasError: !!error,
    data,
    errorMessage: error?.message,
    errorStatus: error?.status,
  });

  // Если есть data и там есть error, значит Edge Function вернул ошибку в формате { available: false, error: "..." }
  if (data && typeof data === 'object' && 'available' in data && !data.available) {
    return {
      available: false,
      error: (data as { error?: string }).error || 'Ошибка при проверке ID',
    };
  }

  // Если есть data и available === true, значит все ок
  if (data && typeof data === 'object' && 'available' in data && data.available) {
    return { available: true };
  }

  // Если есть error от Supabase
  if (error) {
    const errorMessage = error.message || 'Ошибка при проверке ID';
    
    // Проверяем ошибку 404 (Edge Function не развернута)
    if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('DEPLOYMENT_NOT_FOUND')) {
      return {
        available: false,
        error: 'Edge Function avito_sync не развернута. Пожалуйста, разверните функцию в Supabase Dashboard.',
      };
    }
    
    // Handle 409 conflict
    if (error.status === 409 || errorMessage.includes('409')) {
      return {
        available: false,
        error: 'Этот ID уже используется в другой интеграции. Выберите другой.',
      };
    }
    
    return {
      available: false,
      error: errorMessage,
    };
  }

  return { available: true };
}

/**
 * Perform initial sync after connection
 */
export async function performInitialSync(integrationId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('avito_sync', {
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

