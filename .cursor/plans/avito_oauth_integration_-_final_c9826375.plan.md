---
name: Avito OAuth Integration - Final
overview: "Production-ready Avito OAuth integration: app-wide Client ID/Secret in Supabase Secrets, 3-step modal (no Client ID input), Vault encryption, 10-sec polling via Edge Function, Ant Design UI, full error handling."
todos:
  - id: remove-global-avito
    content: Remove Avito section from SettingsView
    status: completed
  - id: create-avito-service
    content: Create avito.ts service with OAuth URL generation, progress saving, Edge Function calls
    status: completed
  - id: install-antd
    content: "Install Ant Design v5: npm install antd"
    status: completed
  - id: create-connect-modal
    content: Create AvitoConnectModal with 3-step stepper (OAuth, Account+ItemID, Markup), Ant Design UI, error handling, progress resume
    status: completed
  - id: update-property-modal
    content: Add Avito badges, last sync time, edit markup button, disconnect button with confirmation
    status: completed
  - id: add-callback-route
    content: Add /auth/avito-callback handler in App.tsx with error/state parsing to localStorage
    status: completed
  - id: create-edge-sync
    content: Create avito-sync Edge Function with exchange-code, get-accounts, validate-item, sync actions
    status: completed
  - id: create-edge-poller
    content: Create avito-poller Edge Function for 10-second cron job processing sync queue
    status: completed
  - id: update-sync-service
    content: Add syncAvitoIntegration and handleIncomingAvitoBookings functions
    status: completed
  - id: add-realtime
    content: Add Supabase subscription for new Avito bookings with toast and optional sound
    status: completed
  - id: add-types
    content: Create TypeScript types for Avito API responses
    status: completed
  - id: setup-secrets
    content: "Configure Supabase Secrets: AVITO_CLIENT_ID and AVITO_CLIENT_SECRET"
    status: pending
  - id: setup-cron
    content: Set up Supabase cron for avito-poller (every 10 seconds)
    status: pending
---

# Avito OAuth Integration - Production Ready

## Critical Requirements (MUST IMPLEMENT)

1. **Client ID/Secret**: App-wide in Supabase Secrets (`AVITO_CLIENT_ID`, `AVITO_CLIENT_SECRET`)

   - Frontend uses `VITE_AVITO_CLIENT_ID` (public) only for OAuth URL generation
   - NEVER ask user for credentials

2. **No Step 0**: Modal starts directly with "Connect Avito" button → OAuth redirect

3. **One Property = One Avito Account + One Item ID**

   - `UNIQUE(property_id, avito_item_id)` in integrations
   - `UNIQUE(avito_account_id, avito_item_id)` in avito_items

4. **Tokens**: Encrypted via Supabase Vault (`vault.decrypted_secret`)

5. **No Refresh Token**: Avito doesn't provide it. Show "Reconnect" button when token expires

6. **Polling**: 10-second intervals via Edge Function `avito-poller` (cron)

7. **Disconnect**: Set `is_active = false`, remove from sync queue (soft delete)

8. **Progress**: Save in localStorage with 1-hour TTL, resume on reopen

9. **OAuth Errors**: Show via `Modal.error` with retry button

10. **After Connect**: Initial sync + add to queue + toast success

11. **PropertyModal UI**: Badges, last sync time, edit markup, disconnect

12. **Realtime**: Toast + optional sound for new Avito bookings

13. **UI Library**: Ant Design v5 only (Steps, Modal, Form, Spin, message, InputNumber)

14. **409 Error**: Offer to choose different Item ID

## 1. Database Schema (ALREADY DONE - User confirmed)

SQL migration already applied with:

- Vault extension
- `is_active` flag
- Unique constraints
- RLS policies

## 2. Remove Avito from Global Settings

**File**: [src/components/SettingsView.tsx](src/components/SettingsView.tsx)

**Changes:**

- Remove entire "Avito Integration" section (lines ~327-418)
- Keep: Language selector, Export reports, other non-Avito settings

## 3. Avito Service

**File**: `src/services/avito.ts` (new)

```typescript
// OAuth URL generation (uses VITE_AVITO_CLIENT_ID from env)
export function generateOAuthUrl(propertyId: string): string {
  const clientId = import.meta.env.VITE_AVITO_CLIENT_ID;
  const state = btoa(JSON.stringify({
    property_id: propertyId,
    timestamp: Date.now(),
    random: Math.random().toString(36)
  }));
  
  return `https://www.avito.ru/oauth?client_id=${clientId}&response_type=code&scope=user:read,short_term_rent:read,short_term_rent:write&state=${state}`;
}

// Progress management (1-hour TTL)
export function saveConnectionProgress(propertyId: string, step: number, data: any): void {
  localStorage.setItem(`avito_connect_${propertyId}`, JSON.stringify({
    step,
    data,
    timestamp: Date.now()
  }));
}

export function loadConnectionProgress(propertyId: string): ConnectionProgress | null {
  const saved = localStorage.getItem(`avito_connect_${propertyId}`);
  if (!saved) return null;
  
  const progress = JSON.parse(saved);
  const age = Date.now() - progress.timestamp;
  if (age > 3600000) { // 1 hour
    localStorage.removeItem(`avito_connect_${propertyId}`);
    return null;
  }
  return progress;
}

// Edge Function calls (Client Secret handled server-side)
export async function exchangeCodeForToken(code: string): Promise<AvitoTokenResponse> {
  const { data, error } = await supabase.functions.invoke('avito-sync', {
    body: { action: 'exchange-code', code }
  });
  if (error) throw error;
  return data;
}

export async function validateItemId(accountId: string, itemId: string, token: string): Promise<{available: boolean, error?: string}> {
  const { data, error } = await supabase.functions.invoke('avito-sync', {
    body: { action: 'validate-item', account_id: accountId, item_id: itemId, access_token: token }
  });
  
  if (error?.status === 409) {
    return { available: false, error: 'Этот ID уже используется в другой интеграции. Выберите другой.' };
  }
  return { available: !error, error: error?.message };
}
```

## 4. Avito Connect Modal (Ant Design v5)

**File**: `src/components/AvitoConnectModal.tsx` (new)

**Stepper (3 steps, NO Step 0):**

1. **Step 1**: OAuth redirect

   - Button "Подключить Avito" → `window.location.href = generateOAuthUrl(propertyId)`
   - Show spinner: "Ждём, пока вы подтвердите доступ в Avito… Это займёт 10 секунд"
   - Check localStorage for OAuth callback result

2. **Step 2**: Account selection + Item ID

   - Fetch accounts via Edge Function
   - If only one account → auto-select
   - Input Item ID with validation
   - Handle 409 error → show Modal.error, offer to try different ID

3. **Step 3**: Markup configuration

   - InputNumber (default 15%, min 0, max 100)
   - Submit → Save integration → Initial sync → Add to queue → Toast

**Features:**

- Resume on reopen: `Modal.confirm("Продолжить подключение Avito?")`
- OAuth errors: `Modal.error({ title: 'Ошибка авторизации', content: error_description })`
- All UI: Ant Design (Steps, Modal, Form, Spin, InputNumber, message)

## 5. Update PropertyModal

**File**: [src/components/PropertyModal.tsx](src/components/PropertyModal.tsx)

**In "API интеграции" section:**

```tsx
// If connected and active
<Badge status="success" text="Avito: синхронизировано" />
<span className="text-xs text-slate-400">
  Последняя синхронизация: {formatDate(integration.last_sync_at)}
</span>
<Button onClick={handleEditMarkup}>Редактировать наценку</Button>
<Button danger onClick={handleDisconnect}>Отключить</Button>

// If disconnected or token expired
<Badge status="default" text="Avito: отключено" />
<Button onClick={handleReconnect}>Подключить заново</Button>
```

**Disconnect handler:**

```tsx
Modal.confirm({
  title: 'Отключить Avito?',
  content: 'Синхронизация будет остановлена. Вы можете подключить заново позже.',
  onOk: async () => {
    await supabase.from('integrations')
      .update({ is_active: false })
      .eq('id', integration.id);
    await supabase.from('avito_sync_queue')
      .delete()
      .eq('integration_id', integration.id);
    message.success('Avito отключён');
  }
});
```

## 6. OAuth Callback Handler

**File**: [src/App.tsx](src/components/App.tsx)

```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;
  
  if (path === '/auth/avito-callback') {
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    const code = params.get('code');
    const state = params.get('state');
    
    if (error) {
      // Store error for modal to display
      localStorage.setItem('avito_oauth_error', JSON.stringify({
        error,
        error_description: errorDescription || 'Неизвестная ошибка'
      }));
    } else if (code && state) {
      // Store success for modal to process
      localStorage.setItem('avito_oauth_success', JSON.stringify({ code, state }));
    }
    
    // Clean URL and redirect
    window.history.replaceState({}, '', '/');
  }
}, []);
```

## 7. Edge Function: avito-sync

**File**: `supabase/functions/avito-sync/index.ts` (new)

**Actions:**

- `exchange-code`: Exchange OAuth code for token (uses `AVITO_CLIENT_SECRET` from Secrets)
- `get-accounts`: Get user accounts list
- `validate-item`: Check item ID availability (handle 409)
- `sync`: Bidirectional sync (pull bookings, push prices/availability)
- `initial-sync`: First sync after connection

**Key points:**

- Read `AVITO_CLIENT_SECRET` from `Deno.env.get('AVITO_CLIENT_SECRET')`
- Use Vault encryption for tokens: `vault.encrypt(token)` before insert
- No refresh token handling (Avito doesn't provide it)

## 8. Edge Function: avito-poller (Cron)

**File**: `supabase/functions/avito-poller/index.ts` (new)

**Cron schedule**: Every 10 seconds (via Supabase cron)

**Logic:**

```typescript
// Query sync queue
const { data: queueItems } = await supabase
  .from('avito_sync_queue')
  .select('*, integrations(*)')
  .eq('status', 'pending')
  .lte('next_sync_at', new Date().toISOString())
  .limit(10); // Process 10 at a time

for (const item of queueItems) {
  try {
    // Call avito-sync function
    await syncIntegration(item.integration_id);
    
    // Update queue
    await supabase.from('avito_sync_queue')
      .update({ 
        status: 'success',
        next_sync_at: new Date(Date.now() + 10000).toISOString() // +10 sec
      })
      .eq('id', item.id);
  } catch (error) {
    // Mark as failed, retry later
    await supabase.from('avito_sync_queue')
      .update({ status: 'failed' })
      .eq('id', item.id);
  }
}
```

## 9. Sync Service Updates

**File**: [src/services/apiSync.ts](src/services/apiSync.ts)

```typescript
export async function syncAvitoIntegration(propertyId: string): Promise<void> {
  // Get integration
  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('property_id', propertyId)
    .eq('platform', 'avito')
    .eq('is_active', true)
    .single();
    
  if (!integration) return;
  
  // Get property data
  const { data: property } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .single();
    
  // Get bookings (for blocked dates)
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*')
    .eq('property_id', propertyId)
    .eq('status', 'confirmed');
    
  // Prepare sync data
  const prices = calculatePricesWithMarkup(property, integration);
  const blockedDates = extractBlockedDates(bookings);
  
  // Call Edge Function
  await supabase.functions.invoke('avito-sync', {
    body: {
      action: 'sync',
      integration_id: integration.id,
      prices,
      blocked_dates: blockedDates,
      min_stay: property.minimum_booking_days
    }
  });
}

export async function handleIncomingAvitoBookings(bookings: AvitoBooking[]): Promise<void> {
  for (const booking of bookings) {
    // Check if exists
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('source', 'avito')
      .eq('external_id', booking.id)
      .single();
      
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
        external_id: booking.id
      });
    }
  }
}
```

## 10. Realtime Notifications

**File**: [src/components/Dashboard.tsx](src/components/Dashboard.tsx)

```typescript
useEffect(() => {
  const channel = supabase.channel('avito_bookings')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'bookings',
      filter: 'source=eq.avito'
    }, (payload) => {
      // Toast notification
      message.success('Лид с Avito!');
      
      // Optional: Play sound
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {}); // Ignore errors
      
      // Refresh bookings
      loadData();
    })
    .subscribe();
    
  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

## 11. Type Definitions

**File**: `src/types/avito.ts` (new)

```typescript
export interface AvitoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  // NO refresh_token (Avito doesn't provide it)
}

export interface AvitoAccount {
  id: string;
  name: string;
  is_primary: boolean;
}

export interface ConnectionProgress {
  step: number;
  data: {
    accountId?: string;
    itemId?: string;
    markup?: number;
  };
  timestamp: number;
}
```

## Implementation Checklist

- [ ] Remove Avito from SettingsView
- [ ] Create `src/services/avito.ts` with OAuth functions
- [ ] Create `src/components/AvitoConnectModal.tsx` (Ant Design, 3 steps)
- [ ] Update PropertyModal with badges and buttons
- [ ] Add callback handler in App.tsx
- [ ] Create Edge Function `avito-sync`
- [ ] Create Edge Function `avito-poller` (cron)
- [ ] Update `apiSync.ts` with sync logic
- [ ] Add realtime subscription in Dashboard
- [ ] Create `src/types/avito.ts`
- [ ] Install Ant Design v5: `npm install antd`
- [ ] Configure Supabase Secrets: `AVITO_CLIENT_ID`, `AVITO_CLIENT_SECRET`
- [ ] Set up cron for `avito-poller` (every 10 seconds)