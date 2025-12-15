import { avitoApi, isAvitoConfigured, initializeAvito } from './avitoApi';
import { supabase, Booking, Property, PropertyIntegration } from '../lib/supabase';
import type { AvitoErrorInfo } from './avitoErrors';

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
): Promise<void> {
  // Get integration from database
  const integration = await getPropertyIntegration(propertyId, 'avito');
  
  if (!integration || !integration.is_active) {
    // Don't throw error - just skip sync if integration is not found or inactive
    // This can happen during race conditions or when integration is being set up
    console.log('syncAvitoIntegration: Skipping sync - integration not found or inactive', {
      propertyId,
      hasIntegration: !!integration,
      isActive: integration?.is_active,
    });
    return;
  }

  // Note: Token expiration check is now handled in Edge Function with automatic refresh
  // We no longer check token expiration on the client side to allow Edge Function to handle it
  console.log('syncAvitoIntegration: Skipping client-side token check, Edge Function will handle it', {
    propertyId,
    integrationId: integration.id,
    hasTokenExpiresAt: !!integration.token_expires_at,
    excludeBookingId,
  });

  // Call Edge Function for sync (it will fetch property and bookings internally)
  console.log('syncAvitoIntegration: Calling Edge Function', {
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

  console.log('syncAvitoIntegration: Edge Function response received', {
    hasData: !!data,
    hasError: !!syncError,
    dataType: data ? typeof data : 'null',
    errorMessage: syncError?.message,
    dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
    data: data, // Полный ответ для диагностики
  });

  if (syncError) {
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
      throw new AvitoSyncError('Avito synchronization completed with errors', errors);
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
    
    throw new Error(errorMessage || 'Sync failed');
  }

  // Check response data for errors
  if (data && typeof data === 'object') {
    const responseData = data as Record<string, unknown>;
    
    // Check if there are errors in the response
    if (responseData.errors && Array.isArray(responseData.errors) && responseData.errors.length > 0) {
      const errors = responseData.errors as AvitoErrorInfo[];
      
      // Check for 404 errors - will show toast in Dashboard component
      // Toast is handled in Dashboard.tsx where syncAvitoIntegration is called
      
      throw new AvitoSyncError('Avito synchronization completed with errors', errors);
    }

    // Check if success is false
    if (responseData.success === false) {
      const errors = (responseData.errors as AvitoErrorInfo[]) || [];
      throw new AvitoSyncError(
        (responseData.message as string) || 'Avito synchronization failed',
        errors
      );
    }
  }

  console.log('syncAvitoIntegration: Avito sync completed successfully', { 
    integration_id: integration.id,
    property_id: integration.property_id,
    success: data && typeof data === 'object' ? (data as Record<string, unknown>).success : undefined,
    synced: data && typeof data === 'object' ? (data as Record<string, unknown>).synced : undefined,
    hasErrors: data && typeof data === 'object' && 'errors' in data ? Array.isArray((data as Record<string, unknown>).errors) && ((data as Record<string, unknown>).errors as unknown[]).length > 0 : false,
  });
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
 * Sync all bookings to Avito calendar
 */
async function syncBookingsToAvito(
  avitoUserId: string,
  propertyAvitoMappings: Map<string, string>, // propertyId -> avitoItemId
  bookings: Booking[]
): Promise<SyncResult> {
  let syncedCount = 0;
  
  try {
    for (const booking of bookings) {
      const avitoItemId = propertyAvitoMappings.get(booking.property_id);
      if (!avitoItemId) continue;
      
      if (booking.status === 'confirmed' || booking.status === 'pending') {
        await avitoApi.syncBookingToAvito(
          avitoUserId,
          avitoItemId,
          booking.check_in,
          booking.check_out
        );
        syncedCount++;
      }
    }
    
    return {
      platform: 'Avito',
      success: true,
      message: `Synced ${syncedCount} bookings`,
      syncedItems: syncedCount,
    };
  } catch (error) {
    console.error('Avito sync error:', error);
    return {
      platform: 'Avito',
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sync property rates to Avito with markup applied
 */
export async function syncRatesToAvito(
  avitoUserId: string,
  propertyId: string,
  avitoItemId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  // Get integration settings for markup
  const integration = await getPropertyIntegration(propertyId, 'avito');
  
  // Get property rates from database
  const { data: rates } = await supabase
    .from('property_rates')
    .select('*')
    .eq('property_id', propertyId)
    .gte('date', startDate)
    .lte('date', endDate);
  
  if (!rates || rates.length === 0) return;
  
  // Update Avito calendar with prices (with markup applied)
  for (const rate of rates) {
    const priceWithMarkup = calculatePriceWithMarkup(rate.daily_price, integration);
    
    await avitoApi.updatePrices(
      avitoUserId,
      avitoItemId,
      rate.date,
      rate.date,
      priceWithMarkup,
      rate.min_stay
    );
  }
}

/**
 * Main sync function that coordinates all platform syncs
 */
export async function syncWithExternalAPIs(
  userId?: string,
  properties?: Property[],
  bookings?: Booking[]
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  
  console.log('🔄 Starting API sync...');
  
  // Avito Sync
  if (isAvitoConfigured()) {
    console.log('📡 Connecting to Avito...');
    const initialized = await initializeAvito();
    
    if (initialized && userId && properties && bookings) {
      // For now, we'll need to store property-to-Avito mappings somewhere
      // This would typically be in the database
      const avitoUserId = localStorage.getItem('avito_user_id') || '';
      
      if (avitoUserId) {
        // Create mapping from localStorage (in production, this would be in DB)
        const mappings = new Map<string, string>();
        properties.forEach(prop => {
          const avitoItemId = localStorage.getItem(`avito_item_${prop.id}`);
          if (avitoItemId) {
            mappings.set(prop.id, avitoItemId);
          }
        });
        
        if (mappings.size > 0) {
          const avitoResult = await syncBookingsToAvito(avitoUserId, mappings, bookings);
          results.push(avitoResult);
          console.log(`✅ Avito: ${avitoResult.message}`);
        } else {
          results.push({
            platform: 'Avito',
            success: true,
            message: 'No property mappings configured',
          });
        }
      }
    } else if (!initialized) {
      results.push({
        platform: 'Avito',
        success: false,
        message: 'Authentication failed',
      });
    }
  } else {
    results.push({
      platform: 'Avito',
      success: true,
      message: 'Not configured',
    });
  }
  
  // Airbnb Sync (placeholder - requires their API partnership)
  results.push({
    platform: 'Airbnb',
    success: true,
    message: 'Integration coming soon',
  });
  console.log('⏳ Airbnb: Integration coming soon');
  
  // CIAN Sync (placeholder)
  results.push({
    platform: 'CIAN',
    success: true,
    message: 'Integration coming soon',
  });
  console.log('⏳ CIAN: Integration coming soon');
  
  // Booking.com Sync (placeholder - requires their API partnership)
  results.push({
    platform: 'Booking.com',
    success: true,
    message: 'Integration coming soon',
  });
  console.log('⏳ Booking.com: Integration coming soon');
  
  console.log('🎉 Sync completed');
  
  return results;
}

/**
 * Sync a single booking to all configured platforms
 */
export async function syncSingleBooking(booking: Booking): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  
  // Avito
  if (isAvitoConfigured()) {
    const avitoUserId = localStorage.getItem('avito_user_id');
    const avitoItemId = localStorage.getItem(`avito_item_${booking.property_id}`);
    
    if (avitoUserId && avitoItemId) {
      try {
        await avitoApi.syncBookingToAvito(
          avitoUserId,
          avitoItemId,
          booking.check_in,
          booking.check_out
        );
        results.push({
          platform: 'Avito',
          success: true,
          message: 'Booking synced',
        });
      } catch (error) {
        results.push({
          platform: 'Avito',
          success: false,
          message: error instanceof Error ? error.message : 'Sync failed',
        });
      }
    }
  }
  
  return results;
}

/**
 * Remove a booking from all configured platforms
 */
export async function removeSyncedBooking(
  booking: Booking,
  defaultPrice?: number
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  
  // Avito
  if (isAvitoConfigured()) {
    const avitoUserId = localStorage.getItem('avito_user_id');
    const avitoItemId = localStorage.getItem(`avito_item_${booking.property_id}`);
    
    if (avitoUserId && avitoItemId) {
      try {
        await avitoApi.removeBookingFromAvito(
          avitoUserId,
          avitoItemId,
          booking.check_in,
          booking.check_out,
          defaultPrice
        );
        results.push({
          platform: 'Avito',
          success: true,
          message: 'Booking removed',
        });
      } catch (error) {
        results.push({
          platform: 'Avito',
          success: false,
          message: error instanceof Error ? error.message : 'Remove failed',
        });
      }
    }
  }
  
  return results;
}
