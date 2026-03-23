import { isAvitoConfigured } from '@/services/avitoApi';
import { supabase, PropertyIntegration } from '@/lib/supabase';
import type { AvitoErrorInfo } from '@/services/avitoErrors';

const devLog = (...args: unknown[]) => { if (import.meta.env.DEV) console.log(...args); };
const devWarn = (...args: unknown[]) => { if (import.meta.env.DEV) console.warn(...args); };

const ITEM_NOT_FOUND_MSG = 'Проверь ID объявления — это длинный номер из URL Avito (10-12 цифр)';

/**
 * Returns true if the error indicates the Avito listing was not found (404).
 * Checks statusCode first (structured), falls back to message string as last resort.
 */
function isItemNotFoundError(statusCode?: number, message?: string): boolean {
  if (statusCode === 404) return true;
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes('объявление не найдено') || m.includes('не найдено') || m.includes('404');
}

export type SyncResult = {
  platform: string;
  success: boolean;
  message: string;
  syncedItems?: number;
};

/**
 * Calculate price with markup for aggregator
 * Supports both old format (markup_type/markup_value) and new Avito format (avito_markup)
 */
export function calculatePriceWithMarkup(
  basePrice: number,
  integration: PropertyIntegration | null
): number {
  if (!integration) {
    return basePrice;
  }

  // Use Avito-specific markup if available
  if (integration.platform === 'avito' && integration.avito_markup) {
    return Math.round(basePrice * (1 + integration.avito_markup / 100));
  }

  // Fallback to old format
  if (integration.markup_value === 0) {
    return basePrice;
  }

  if (integration.markup_type === 'percent') {
    return Math.round(basePrice + (basePrice * integration.markup_value / 100));
  } else {
    return Math.round(basePrice + integration.markup_value);
  }
}

/**
 * Get integration settings for a property and platform from database
 */
export async function getPropertyIntegration(
  propertyId: string,
  platform: string
): Promise<PropertyIntegration | null> {
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('property_id', propertyId)
    .eq('platform', platform)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as PropertyIntegration;
}

/**
 * Custom error class for Avito sync errors with multiple errors
 */
export class AvitoSyncError extends Error {
  errors: AvitoErrorInfo[];

  constructor(message: string, errors: AvitoErrorInfo[] = []) {
    super(message);
    this.name = 'AvitoSyncError';
    this.errors = errors;
  }
}

/**
 * Sync Avito integration for a specific property
 * Prepares data and calls Edge Function for actual sync
 * Throws AvitoSyncError if there are errors from Avito API
 * 
 * @param propertyId - Property ID to sync
 * @param excludeBookingId - Optional booking ID to exclude from sync (for manual booking deletion)
 */
export async function syncAvitoIntegration(
  propertyId: string,
  excludeBookingId?: string
): Promise<{ 
  success: boolean; 
  errors?: AvitoErrorInfo[]; 
  message?: string; 
  pushSuccess?: boolean;
  pricesSuccess?: boolean;
  intervalsFailed?: boolean;
  skipUserError?: boolean;
  warnings?: AvitoErrorInfo[];
  warningMessage?: string;
}> {
  // Get integration from database
  const integration = await getPropertyIntegration(propertyId, 'avito');
  
  if (!integration || !integration.is_active) {
    // Don't throw error - just skip sync if integration is not found or inactive
    // This can happen during race conditions or when integration is being set up
    devLog('syncAvitoIntegration: Skipping sync - integration not found or inactive', {
      propertyId,
      hasIntegration: !!integration,
      isActive: integration?.is_active,
    });
    return { success: false, skipUserError: true, message: 'Интеграция не найдена или неактивна' };
  }

  // GUARD: Check if item_id is set and valid
  if (!integration.avito_item_id) {
    devWarn('syncAvitoIntegration: Missing item_id', {
        propertyId,
        avito_item_id: integration.avito_item_id,
      });
      return { success: false, skipUserError: true, message: 'Введи ID объявления на Avito (10-11 цифр)' };
    }

  const itemIdStr = String(integration.avito_item_id).trim();
  if (!itemIdStr || itemIdStr.length < 10 || itemIdStr.length > 11 || !/^\d+$/.test(itemIdStr)) {
    devWarn('syncAvitoIntegration: Invalid item_id format', {
      propertyId,
      avito_item_id: integration.avito_item_id,
      itemIdLength: itemIdStr.length,
    });
    return { success: false, skipUserError: true, message: 'Введи ID объявления на Avito (10-11 цифр)' };
  }

  // Note: Token expiration check is now handled in Edge Function with automatic refresh
  // We no longer check token expiration on the client side to allow Edge Function to handle it
  devLog('syncAvitoIntegration: Skipping client-side token check, Edge Function will handle it', {
    propertyId,
    integrationId: integration.id,
    hasTokenExpiresAt: !!integration.token_expires_at,
    excludeBookingId,
  });

  // Call Edge Function for sync (it will fetch property and bookings internally)
  devLog('syncAvitoIntegration: Calling Edge Function', {
    integration_id: integration.id,
    property_id: integration.property_id,
    avito_item_id: integration.avito_item_id,
    exclude_booking_id: excludeBookingId,
  });

  const { data, error: syncError } = await supabase.functions.invoke('avito_sync', {
    body: {
      action: 'sync',
      integration_id: integration.id,
      exclude_booking_id: excludeBookingId, // Exclude deleted booking from sync
    },
  });

  devLog('syncAvitoIntegration: Edge Function response received', {
    hasData: !!data,
    hasError: !!syncError,
    dataType: data ? typeof data : 'null',
    errorMessage: syncError?.message,
    dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
    data: data, // Полный ответ для диагностики
  });

  // Handle Supabase function invocation error
  if (syncError) {
    if (isItemNotFoundError(undefined, syncError.message)) {
      return {
        success: false,
        message: ITEM_NOT_FOUND_MSG,
        errors: [{ operation: 'sync', statusCode: 404, message: ITEM_NOT_FOUND_MSG }],
      };
    }
    console.error('syncAvitoIntegration: Edge Function invocation error', {
      error: syncError,
      message: syncError?.message,
    });
    
    // Try to parse errors from response
    let errors: AvitoErrorInfo[] = [];
    try {
      if (syncError.context && typeof syncError.context === 'object') {
        const context = syncError.context as Record<string, unknown>;
        if (context.data && typeof context.data === 'object') {
          const responseData = context.data as Record<string, unknown>;
          if (responseData.errors && Array.isArray(responseData.errors)) {
            errors = responseData.errors as AvitoErrorInfo[];
          }
        }
      }
    } catch {
      // Ignore parsing errors
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }
    
    // Improved error message handling
    let errorMessage: string;
    if (typeof syncError === 'string') {
      errorMessage = syncError;
    } else if (syncError && typeof syncError === 'object' && 'message' in syncError) {
      errorMessage = (syncError as { message?: string }).message || JSON.stringify(syncError);
    } else {
      errorMessage = syncError instanceof Error ? syncError.message : JSON.stringify(syncError);
    }
    
    return { success: false, message: errorMessage || 'Sync failed' };
  }

  // Check response data
  if (data && typeof data === 'object') {
    const responseData = data as Record<string, unknown>;
    const warnings = (responseData.warnings as AvitoErrorInfo[] | undefined);
    const warningMessage = responseData.warningMessage as string | undefined;
    
    // PRIORITY: Check pushSuccess - if push operations (prices/intervals) succeeded, return success
    if ('pushSuccess' in responseData && responseData.pushSuccess === true) {
      devLog('syncAvitoIntegration: Push operations succeeded (prices/intervals)', { 
        integration_id: integration.id,
        property_id: integration.property_id,
        pushSuccess: responseData.pushSuccess,
        hasError: responseData.hasError,
      });
      return { success: true, pushSuccess: true, warnings, warningMessage };
    }

    // Check if prices succeeded but intervals failed (404 - activation required)
    if ('pricesPushSuccess' in responseData && responseData.pricesPushSuccess === true) {
      const intervalsFailed = responseData.intervalsPushSuccess === false;
      const errors = responseData.errors as AvitoErrorInfo[] | undefined;
      const has404Error = Array.isArray(errors) && errors.some((e: AvitoErrorInfo) => 
        e.operation === 'bookings_update' && e.statusCode === 404
      );
      
      if (intervalsFailed || has404Error) {
        devLog('syncAvitoIntegration: Prices succeeded but intervals failed (404)', {
          integration_id: integration.id,
          property_id: integration.property_id,
          pricesPushSuccess: responseData.pricesPushSuccess,
          intervalsPushSuccess: responseData.intervalsPushSuccess,
        });
        return { 
          success: true, 
          pushSuccess: false,
          pricesSuccess: true,
          intervalsFailed: true,
          warnings,
          warningMessage,
        };
      }
    }

    // PRIORITY: Check hasError first - this is the definitive success indicator
    // If hasError === false, treat as success regardless of success/errorsCount fields
    if ('hasError' in responseData && responseData.hasError === false) {
      devLog('syncAvitoIntegration: Sync completed successfully (hasError: false)', { 
        integration_id: integration.id,
        property_id: integration.property_id,
        hasData: responseData.hasData,
        hasError: responseData.hasError,
        errorsCount: responseData.errorsCount,
      });
      return { success: true, warnings, warningMessage };
    }

    // If hasError === true, it's a real error
    if ('hasError' in responseData && responseData.hasError === true) {
      const errors = (responseData.errors as AvitoErrorInfo[]) || [];
      const responseErrorMessage = responseData.errorMessage as string || '';

      if (
        isItemNotFoundError(undefined, responseErrorMessage) ||
        errors.some(e => isItemNotFoundError(e.statusCode, e.message))
      ) {
        return {
          success: false,
          message: ITEM_NOT_FOUND_MSG,
          errors: errors.length > 0 ? errors : [{ operation: 'sync', statusCode: 404, message: ITEM_NOT_FOUND_MSG }],
        };
      }
      const message = (responseData.error as string) || (responseData.message as string) || 'Avito synchronization failed';
      console.error('syncAvitoIntegration: Sync failed (hasError: true)', {
        message,
        errorsCount: errors.length,
        errors: errors.map(e => ({ operation: e.operation, statusCode: e.statusCode, message: e.message })),
      });
      return { success: false, errors, message };
    }

    // Fallback: Check if success is explicitly false (for backward compatibility)
    if (responseData.success === false) {
      const errors = (responseData.errors as AvitoErrorInfo[]) || [];
      const message = (responseData.error as string) || (responseData.message as string) || 'Avito synchronization failed';
      devWarn('syncAvitoIntegration: Sync returned success: false', {
        message,
        errorsCount: errors.length,
      });
      return { success: false, errors, message };
    }

    // Check if there are errors but success is not false (partial success/warnings)
    // Only treat as error if hasError is explicitly true
    if (responseData.errors && Array.isArray(responseData.errors) && responseData.errors.length > 0) {
      const errors = responseData.errors as AvitoErrorInfo[];
      // If hasError is not explicitly true, these are warnings, not errors
      const isRealError = 'hasError' in responseData && responseData.hasError === true;
      
      if (isRealError) {
        devWarn('syncAvitoIntegration: Sync completed with errors', {
          errorsCount: errors.length,
          success: responseData.success,
        });
        return { success: false, errors };
      } else {
        // These are warnings, sync was successful
        devLog('syncAvitoIntegration: Sync completed with warnings (but hasError: false)', {
          errorsCount: errors.length,
          success: responseData.success,
        });
        return { success: true, errors, warnings, warningMessage };
      }
    }

    // Success case
    devLog('syncAvitoIntegration: Avito sync completed successfully', { 
      integration_id: integration.id,
      property_id: integration.property_id,
      success: responseData.success,
      synced: responseData.synced,
      hasErrors: false,
    });
    
    return { success: true, warnings, warningMessage };
  }

  // If no data, treat as success (Edge Function might return empty response)
  devLog('syncAvitoIntegration: Edge Function returned no data, treating as success', {
    integration_id: integration.id,
  });
  
  return { success: true };
}

/**
 * Handle incoming bookings from Avito
 * Creates bookings in our database with source='avito'
 */
export async function handleIncomingAvitoBookings(
  bookings: Array<{
    id: string;
    property_id: string;
    guest_name: string;
    guest_phone?: string;
    check_in: string;
    check_out: string;
    total_price: number;
    currency: string;
  }>
): Promise<void> {
  for (const booking of bookings) {
    // Check if booking already exists
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('source', 'avito')
      .eq('external_id', booking.id)
      .maybeSingle();

    if (!existing) {
      // Create new booking
      await supabase.from('bookings').insert({
        property_id: booking.property_id,
        guest_name: booking.guest_name,
        guest_phone: booking.guest_phone,
        check_in: booking.check_in,
        check_out: booking.check_out,
        total_price: booking.total_price,
        currency: booking.currency,
        status: 'confirmed',
        source: 'avito',
        external_id: booking.id,
      });
    }
  }
}

/**
 * Trigger a manual sync check across all configured platforms.
 * Real per-property sync for Avito happens via syncAvitoIntegration (Edge Function).
 * This function returns status summary for UI feedback.
 */
export async function syncWithExternalAPIs(): Promise<SyncResult[]> {
  devLog('🔄 Starting API sync check...');

  const avitoConfigured = isAvitoConfigured();

  const results: SyncResult[] = [
    {
      platform: 'Avito',
      success: avitoConfigured,
      message: avitoConfigured ? 'Use per-property sync via settings' : 'Not configured',
    },
    { platform: 'Airbnb', success: true, message: 'Интеграция скоро появится' },
    { platform: 'CIAN', success: true, message: 'Интеграция скоро появится' },
    { platform: 'Booking.com', success: true, message: 'Интеграция скоро появится' },
  ];

  devLog('🎉 Sync check completed');
  return results;
}
