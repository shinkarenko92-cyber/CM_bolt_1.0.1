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
   * Get chats list from Avito Messenger API
   * Documentation: https://developers.avito.ru/api-catalog/messenger/documentation
   */
  async getChats(userId: string, itemId?: string, limit?: number, offset?: number): Promise<{
    chats: Array<{
      id: string;
      item_id?: string;
      created: string;
      updated: string;
      unread_count: number;
      last_message?: {
        text: string;
        created: string;
      };
      users: Array<{
        user_id: string;
        name: string;
        avatar?: {
          url: string;
        };
      }>;
    }>;
    pagination?: {
      limit: number;
      offset: number;
      total: number;
    };
  }> {
    let endpoint = `/messenger/v2/accounts/${userId}/chats`;
    const params = new URLSearchParams();
    
    if (itemId) {
      params.append('item_id', itemId);
    }
    if (limit) {
      params.append('limit', limit.toString());
    }
    if (offset) {
      params.append('offset', offset.toString());
    }
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }
    
    return this.request(endpoint);
  }

  /**
   * Get chats list from Avito Messenger API using provided access token
   * This method is used when we have a token from integration (not from local credentials)
   */
  async getChatsWithToken(
    userId: string,
    accessToken: string,
    itemId?: string,
    limit?: number,
    offset?: number
  ): Promise<{
    chats: Array<{
      id: string;
      item_id?: string;
      created: string;
      updated: string;
      unread_count: number;
      last_message?: {
        text: string;
        created: string;
      };
      users: Array<{
        user_id: string;
        name: string;
        avatar?: {
          url: string;
        };
      }>;
    }>;
    pagination?: {
      limit: number;
      offset: number;
      total: number;
    };
  }> {
    let endpoint = `/messenger/v2/accounts/${userId}/chats`;
    const params = new URLSearchParams();
    
    if (itemId) {
      params.append('item_id', itemId);
    }
    if (limit) {
      params.append('limit', limit.toString());
    }
    if (offset) {
      params.append('offset', offset.toString());
    }
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }
    
    const response = await fetch(`${AVITO_API_BASE}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Avito API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get messages in a specific chat
   */
  async getChatMessages(
    userId: string,
    chatId: string,
    limit?: number,
    offset?: number
  ): Promise<{
    messages: Array<{
      id: string;
      chat_id: string;
      created: string;
      content: {
        text?: string;
        attachments?: Array<{
          type: string;
          url: string;
          name?: string;
        }>;
      };
      author: {
        user_id: string;
        name: string;
      };
    }>;
    pagination?: {
      limit: number;
      offset: number;
      total: number;
    };
  }> {
    let endpoint = `/messenger/v2/accounts/${userId}/chats/${chatId}/messages`;
    const params = new URLSearchParams();
    
    if (limit) {
      params.append('limit', limit.toString());
    }
    if (offset) {
      params.append('offset', offset.toString());
    }
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }
    
    return this.request(endpoint);
  }

  /**
   * Get messages in a specific chat using provided access token
   * This method is used when we have a token from integration (not from local credentials)
   */
  async getChatMessagesWithToken(
    userId: string,
    chatId: string,
    accessToken: string,
    limit?: number,
    offset?: number
  ): Promise<{
    messages: Array<{
      id: string;
      chat_id: string;
      created: string;
      content: {
        text?: string;
        attachments?: Array<{
          type: string;
          url: string;
          name?: string;
        }>;
      };
      author: {
        user_id: string;
        name: string;
      };
    }>;
    pagination?: {
      limit: number;
      offset: number;
      total: number;
    };
  }> {
    let endpoint = `/messenger/v2/accounts/${userId}/chats/${chatId}/messages`;
    const params = new URLSearchParams();
    
    if (limit) {
      params.append('limit', limit.toString());
    }
    if (offset) {
      params.append('offset', offset.toString());
    }
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }
    
    const response = await fetch(`${AVITO_API_BASE}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Avito API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Send a message in a chat
   */
  async sendMessage(
    userId: string,
    chatId: string,
    text: string,
    attachments?: Array<{ type: string; url: string; name?: string }>
  ): Promise<{
    id: string;
    chat_id: string;
    created: string;
    content: {
      text?: string;
      attachments?: Array<{
        type: string;
        url: string;
        name?: string;
      }>;
    };
    author: {
      user_id: string;
      name: string;
    };
  }> {
    const body: {
      text?: string;
      attachments?: Array<{ type: string; url: string; name?: string }>;
    } = {};
    
    if (text) {
      body.text = text;
    }
    if (attachments && attachments.length > 0) {
      body.attachments = attachments;
    }
    
    return this.request(`/messenger/v2/accounts/${userId}/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Send a message in a chat using provided access token (integration token)
   */
  async sendMessageWithToken(
    userId: string,
    chatId: string,
    accessToken: string,
    text: string,
    attachments?: Array<{ type: string; url: string; name?: string }>
  ): Promise<{
    id: string;
    chat_id: string;
    created: string;
    content: {
      text?: string;
      attachments?: Array<{
        type: string;
        url: string;
        name?: string;
      }>;
    };
    author: {
      user_id: string;
      name: string;
    };
  }> {
    const body: {
      text?: string;
      attachments?: Array<{ type: string; url: string; name?: string }>;
    } = {};
    if (text) body.text = text;
    if (attachments && attachments.length > 0) body.attachments = attachments;

    const response = await fetch(
      `${AVITO_API_BASE}/messenger/v2/accounts/${userId}/chats/${chatId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Avito API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Upload attachment (photo) for message
   * Note: This typically requires a two-step process:
   * 1. Upload file to get URL
   * 2. Use URL in sendMessage
   */
  async uploadAttachment(
    userId: string,
    file: File | Blob,
    fileName?: string
  ): Promise<{
    url: string;
    type: string;
    name?: string;
  }> {
    // First, get upload URL from Avito
    const uploadUrlResponse = await this.request<{ upload_url: string }>(
      `/messenger/v2/accounts/${userId}/attachments`,
      {
        method: 'POST',
        body: JSON.stringify({
          filename: fileName || 'attachment.jpg',
          content_type: file.type || 'image/jpeg',
        }),
      }
    );

    // Upload file to the provided URL
    const uploadResponse = await fetch(uploadUrlResponse.upload_url, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type || 'image/jpeg',
      },
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload attachment: ${uploadResponse.statusText}`);
    }

    // Return attachment info for use in sendMessage
    return {
      url: uploadUrlResponse.upload_url.split('?')[0], // Remove query params
      type: 'image',
      name: fileName,
    };
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(
    userId: string,
    chatId: string,
    messageIds: string[]
  ): Promise<void> {
    await this.request(`/messenger/v2/accounts/${userId}/chats/${chatId}/read`, {
      method: 'POST',
      body: JSON.stringify({
        message_ids: messageIds,
      }),
    });
  }

  /**
   * Get chat details
   */
  async getChat(userId: string, chatId: string): Promise<{
    id: string;
    item_id?: string;
    created: string;
    updated: string;
    unread_count: number;
    users: Array<{
      user_id: string;
      name: string;
      avatar?: {
        url: string;
      };
    }>;
  }> {
    return this.request(`/messenger/v2/accounts/${userId}/chats/${chatId}`);
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

