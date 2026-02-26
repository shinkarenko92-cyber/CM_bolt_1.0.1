/**
 * Avito Error Parsing and Display Utilities
 * Handles parsing errors from Avito API and Edge Function responses
 */

import { useState, useEffect } from 'react';
import type { TFunction } from 'i18next';

/**
 * Information about an Avito API error
 */
export interface AvitoErrorInfo {
  operation: string; // e.g., 'price_update', 'calendar_update', 'base_params_update', 'bookings_update'
  statusCode?: number;
  errorCode?: string;
  message: string;
  details?: unknown;
  recommendations?: string[];
}

/**
 * Error response from Edge Function
 */
export interface AvitoSyncErrorResponse {
  success: boolean;
  errors?: AvitoErrorInfo[];
  message?: string;
}

/**
 * Parse error from various sources (Edge Function, Avito API, network)
 */
export function parseAvitoError(error: unknown, operation?: string): AvitoErrorInfo {
  const defaultOperation = operation || 'unknown_operation';
  
  // If it's already an AvitoErrorInfo, return it
  if (error && typeof error === 'object' && 'operation' in error && 'message' in error) {
    return error as AvitoErrorInfo;
  }

  // If it's an Error object
  if (error instanceof Error) {
    // Try to parse error message for structured data
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.errors && Array.isArray(parsed.errors)) {
        // This is a sync error response
        return {
          operation: defaultOperation,
          message: parsed.message || error.message,
          details: parsed,
        };
      }
    } catch {
      // Not JSON, continue with normal error parsing
    }

    return {
      operation: defaultOperation,
      message: error.message,
      details: error.stack,
    };
  }

  // If it's a response from Edge Function
  if (error && typeof error === 'object' && 'data' in error) {
    const errorData = (error as { data?: unknown }).data;
    
    if (errorData && typeof errorData === 'object') {
      const data = errorData as Record<string, unknown>;
      
      // Check if it's a sync error response
      if ('errors' in data && Array.isArray(data.errors)) {
        // This is a structured error response with multiple errors
        // Return the first error or a summary
        const errors = data.errors as AvitoErrorInfo[];
        if (errors.length > 0) {
          return errors[0];
        }
      }

      // Try to extract error information
      const message = 
        (data.message as string) ||
        (data.error as string) ||
        (data.error_description as string) ||
        'Unknown error';

      return {
        operation: defaultOperation,
        statusCode: data.status as number,
        errorCode: data.error as string,
        message: typeof message === 'string' ? message : 'Unknown error',
        details: data,
      };
    }
  }

  // If it's a string
  if (typeof error === 'string') {
    try {
      const parsed = JSON.parse(error);
      if (parsed.errors && Array.isArray(parsed.errors)) {
        const errors = parsed.errors as AvitoErrorInfo[];
        if (errors.length > 0) {
          return errors[0];
        }
      }
      return {
        operation: defaultOperation,
        message: parsed.message || error,
        details: parsed,
      };
    } catch {
      return {
        operation: defaultOperation,
        message: error,
      };
    }
  }

  // Default fallback
  return {
    operation: defaultOperation,
    message: 'Unknown error occurred',
    details: error,
  };
}

/**
 * Format error message for display
 */
export function formatAvitoError(errorInfo: AvitoErrorInfo, t: TFunction): string {
  const { operation, message, statusCode, errorCode } = errorInfo;

  // Get operation name translation
  const operationKey = `avito.errors.${operation}`;
  const operationName = t(operationKey, { defaultValue: operation });

  let formatted = `${operationName}: ${message}`;

  if (statusCode) {
    formatted += ` (${t('avito.errors.statusCode')}: ${statusCode})`;
  }

  if (errorCode) {
    formatted += ` [${errorCode}]`;
  }

  return formatted;
}

/**
 * User-visible message for 422 price validation (Avito: night_price must be greater than 0)
 */
export function getDisplayMessage(error: AvitoErrorInfo, t: TFunction): string {
  if (error.statusCode !== 422) return error.message;
  const details = error.details as Record<string, unknown> | undefined;
  const fields = details?.fields as Record<string, string> | undefined;
  const nightPriceRule = fields?.night_price;
  const msg = (error.message || '').toLowerCase();
  if (nightPriceRule || msg.includes('night_price') || msg.includes('greater than 0')) {
    const out = t('avito.errors.priceMinValidation', {
      defaultValue: 'Цена за ночь не должна быть меньше минимальной. Укажите цену больше 0 (минимум 1 ₽).',
    });
    return typeof out === 'string' ? out : 'Цена за ночь не должна быть меньше минимальной. Укажите цену больше 0 (минимум 1 ₽).';
  }
  return error.message;
}

// Queue for showing Avito errors via AvitoErrorModal (replaces antd Modal)
export type AvitoErrorState = { error: AvitoErrorInfo; t: TFunction; onClose: () => void } | null;

let avitoErrorState: AvitoErrorState = null;
const avitoErrorListeners = new Set<() => void>();

export function getAvitoErrorState(): AvitoErrorState {
  return avitoErrorState;
}

function setAvitoErrorState(state: AvitoErrorState): void {
  avitoErrorState = state;
  avitoErrorListeners.forEach((fn) => fn());
}

export function useAvitoErrorState(): AvitoErrorState {
  const [state, setState] = useState<AvitoErrorState>(() => getAvitoErrorState());
  useEffect(() => {
    const fn = () => setState(getAvitoErrorState());
    avitoErrorListeners.add(fn);
    return () => {
      avitoErrorListeners.delete(fn);
    };
  }, []);
  return state;
}

/**
 * Show Avito errors sequentially (via AvitoErrorQueue component mounted in the app)
 */
export async function showAvitoErrors(
  errors: AvitoErrorInfo[],
  t: TFunction
): Promise<void> {
  if (!errors || errors.length === 0) return;

  return new Promise<void>((resolve) => {
    let index = 0;
    function showNext() {
      if (index >= errors.length) {
        resolve();
        return;
      }
      const error = errors[index++];
      setAvitoErrorState({
        error,
        t,
        onClose: () => {
          setAvitoErrorState(null);
          showNext();
        },
      });
    }
    showNext();
  });
}

/**
 * Parse errors from Edge Function response
 */
export function parseSyncErrorResponse(response: unknown): AvitoErrorInfo[] {
  if (!response || typeof response !== 'object') {
    return [];
  }

  const data = response as Record<string, unknown>;

  // Check if it's a sync error response
  if ('errors' in data && Array.isArray(data.errors)) {
    return data.errors as AvitoErrorInfo[];
  }

  // If there's a single error message, convert it to error info
  if ('message' in data && typeof data.message === 'string') {
    return [
      {
        operation: 'sync',
        message: data.message,
        statusCode: data.status as number,
        details: data,
      },
    ];
  }

  return [];
}

