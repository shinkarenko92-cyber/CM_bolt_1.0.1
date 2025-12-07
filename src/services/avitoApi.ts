/**
 * Avito API Service
 * Documentation: https://developers.avito.ru/
 * 
 * For real estate short-term rental integration
 */

const AVITO_API_BASE = 'https://api.avito.ru';

export interface AvitoCredentials {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
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

export interface AvitoCalendarDate {
  date: string; // YYYY-MM-DD
  status: 'available' | 'booked' | 'blocked';
  price?: number;
  minStay?: number;
}

export interface AvitoBooking {
  id: string;
  itemId: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestPhone?: string;
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
}

class AvitoApiService {
  private credentials: AvitoCredentials | null = null;

  /**
   * Initialize with credentials from storage or settings
   */
  setCredentials(credentials: AvitoCredentials) {
    this.credentials = credentials;
  }

  /**
   * Get OAuth2 access token
   */
  async authenticate(clientId: string, clientSecret: string): Promise<AvitoCredentials> {
    const response = await fetch(`${AVITO_API_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Avito auth failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    this.credentials = {
      clientId,
      clientSecret,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: Date.now() + (data.expires_in * 1000),
    };

    return this.credentials;
  }

  /**
   * Refresh access token if expired
   */
  private async ensureValidToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('Avito credentials not set. Call setCredentials() first.');
    }

    if (this.credentials.tokenExpiresAt && Date.now() >= this.credentials.tokenExpiresAt - 60000) {
      // Token expired or expiring soon, refresh it
      await this.authenticate(this.credentials.clientId, this.credentials.clientSecret);
    }

    if (!this.credentials.accessToken) {
      throw new Error('No valid access token');
    }

    return this.credentials.accessToken;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await this.ensureValidToken();
    
    const response = await fetch(`${AVITO_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Avito API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get user's items (property listings)
   */
  async getItems(userId: string): Promise<AvitoItem[]> {
    const data = await this.request<{ resources: AvitoItem[] }>(
      `/core/v1/accounts/${userId}/items`
    );
    return data.resources || [];
  }

  /**
   * Get item details
   */
  async getItem(userId: string, itemId: string): Promise<AvitoItem> {
    return this.request<AvitoItem>(
      `/core/v1/accounts/${userId}/items/${itemId}`
    );
  }

  /**
   * Get calendar availability for an item
   * Used for short-term rental properties
   */
  async getCalendar(userId: string, itemId: string, dateFrom: string, dateTo: string): Promise<AvitoCalendarDate[]> {
    const data = await this.request<{ dates: AvitoCalendarDate[] }>(
      `/realty/v1/accounts/${userId}/items/${itemId}/calendar?date_from=${dateFrom}&date_to=${dateTo}`
    );
    return data.dates || [];
  }

  /**
   * Update calendar availability
   * Mark dates as booked or available
   */
  async updateCalendar(
    userId: string, 
    itemId: string, 
    dates: AvitoCalendarDate[]
  ): Promise<void> {
    await this.request(
      `/realty/v1/accounts/${userId}/items/${itemId}/calendar`,
      {
        method: 'POST',
        body: JSON.stringify({ dates }),
      }
    );
  }

  /**
   * Block dates (mark as unavailable)
   */
  async blockDates(userId: string, itemId: string, dateFrom: string, dateTo: string): Promise<void> {
    const dates: AvitoCalendarDate[] = [];
    const current = new Date(dateFrom);
    const end = new Date(dateTo);
    
    while (current <= end) {
      dates.push({
        date: current.toISOString().split('T')[0],
        status: 'blocked',
      });
      current.setDate(current.getDate() + 1);
    }
    
    await this.updateCalendar(userId, itemId, dates);
  }

  /**
   * Unblock dates (mark as available)
   */
  async unblockDates(userId: string, itemId: string, dateFrom: string, dateTo: string, price?: number): Promise<void> {
    const dates: AvitoCalendarDate[] = [];
    const current = new Date(dateFrom);
    const end = new Date(dateTo);
    
    while (current <= end) {
      dates.push({
        date: current.toISOString().split('T')[0],
        status: 'available',
        price,
      });
      current.setDate(current.getDate() + 1);
    }
    
    await this.updateCalendar(userId, itemId, dates);
  }

  /**
   * Update prices for date range
   */
  async updatePrices(
    userId: string, 
    itemId: string, 
    dateFrom: string, 
    dateTo: string, 
    price: number,
    minStay?: number
  ): Promise<void> {
    const dates: AvitoCalendarDate[] = [];
    const current = new Date(dateFrom);
    const end = new Date(dateTo);
    
    while (current <= end) {
      dates.push({
        date: current.toISOString().split('T')[0],
        status: 'available',
        price,
        minStay,
      });
      current.setDate(current.getDate() + 1);
    }
    
    await this.updateCalendar(userId, itemId, dates);
  }

  /**
   * Get bookings/messages related to an item
   * Note: Avito doesn't have a direct bookings API, 
   * bookings come through messages/chat
   */
  async getMessages(userId: string, itemId?: string): Promise<unknown[]> {
    let endpoint = `/messenger/v2/accounts/${userId}/chats`;
    if (itemId) {
      endpoint += `?item_id=${itemId}`;
    }
    
    const data = await this.request<{ chats: unknown[] }>(endpoint);
    return data.chats || [];
  }

  /**
   * Sync local booking to Avito calendar
   * Marks dates as booked on Avito
   */
  async syncBookingToAvito(
    userId: string,
    itemId: string,
    checkIn: string,
    checkOut: string
  ): Promise<void> {
    const dates: AvitoCalendarDate[] = [];
    const current = new Date(checkIn);
    const end = new Date(checkOut);
    
    // Mark all dates except checkout as booked
    while (current < end) {
      dates.push({
        date: current.toISOString().split('T')[0],
        status: 'booked',
      });
      current.setDate(current.getDate() + 1);
    }
    
    await this.updateCalendar(userId, itemId, dates);
  }

  /**
   * Remove booking from Avito calendar
   * Marks dates as available again
   */
  async removeBookingFromAvito(
    userId: string,
    itemId: string,
    checkIn: string,
    checkOut: string,
    defaultPrice?: number
  ): Promise<void> {
    await this.unblockDates(userId, itemId, checkIn, checkOut, defaultPrice);
  }
}

// Singleton instance
export const avitoApi = new AvitoApiService();

// Helper function to check if Avito is configured
export function isAvitoConfigured(): boolean {
  const clientId = localStorage.getItem('avito_client_id');
  const clientSecret = localStorage.getItem('avito_client_secret');
  return !!(clientId && clientSecret);
}

// Helper function to initialize Avito from stored credentials
export async function initializeAvito(): Promise<boolean> {
  const clientId = localStorage.getItem('avito_client_id');
  const clientSecret = localStorage.getItem('avito_client_secret');
  
  if (!clientId || !clientSecret) {
    return false;
  }
  
  try {
    await avitoApi.authenticate(clientId, clientSecret);
    return true;
  } catch (error) {
    console.error('Failed to initialize Avito:', error);
    return false;
  }
}

// Helper function to save Avito credentials
export function saveAvitoCredentials(clientId: string, clientSecret: string): void {
  localStorage.setItem('avito_client_id', clientId);
  localStorage.setItem('avito_client_secret', clientSecret);
}

// Helper function to clear Avito credentials
export function clearAvitoCredentials(): void {
  localStorage.removeItem('avito_client_id');
  localStorage.removeItem('avito_client_secret');
}

