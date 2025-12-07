import { avitoApi, isAvitoConfigured, initializeAvito } from './avitoApi';
import { supabase, Booking, Property } from '../lib/supabase';

export type SyncResult = {
  platform: string;
  success: boolean;
  message: string;
  syncedItems?: number;
};

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
 * Sync property rates to Avito
 */
async function syncRatesToAvito(
  avitoUserId: string,
  propertyId: string,
  avitoItemId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  // Get property rates from database
  const { data: rates } = await supabase
    .from('property_rates')
    .select('*')
    .eq('property_id', propertyId)
    .gte('date', startDate)
    .lte('date', endDate);
  
  if (!rates || rates.length === 0) return;
  
  // Update Avito calendar with prices
  for (const rate of rates) {
    await avitoApi.updatePrices(
      avitoUserId,
      avitoItemId,
      rate.date,
      rate.date,
      rate.daily_price,
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
