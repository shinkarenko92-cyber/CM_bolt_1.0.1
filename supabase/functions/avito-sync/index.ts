/**
 * Avito Sync Edge Function
 * Handles OAuth token exchange, account fetching, item validation, and bidirectional sync
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const AVITO_API_BASE = "https://api.avito.ru";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Types for Avito API responses
interface AvitoAccount {
  id?: string;
  account_id?: string;
  user_id?: string;
  name?: string;
  title?: string;
  username?: string;
  display_name?: string;
  email?: string;
  is_primary?: boolean;
  primary?: boolean;
  [key: string]: unknown; // Allow additional fields
}

interface AvitoUserData {
  id?: string;
  user_id?: string;
  name?: string;
  username?: string;
  display_name?: string;
  email?: string;
  accounts?: AvitoAccount[];
  data?: AvitoAccount[];
  items?: AvitoAccount[];
  [key: string]: unknown; // Allow additional fields
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const avitoClientId = Deno.env.get("AVITO_CLIENT_ID") || "";
    const avitoClientSecret = Deno.env.get("AVITO_CLIENT_SECRET") || "";

    if (!avitoClientId || !avitoClientSecret) {
      throw new Error("AVITO_CLIENT_ID and AVITO_CLIENT_SECRET must be set in Supabase Secrets");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    
    // Parse request body with error handling
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (jsonError) {
      console.error("Failed to parse JSON:", jsonError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, ...params } = requestBody;

    if (!action) {
      console.error("Missing action in request");
      return new Response(
        JSON.stringify({ error: "Missing 'action' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing action: ${action}`);

    switch (action) {
      case "exchange-code": {
        const { code, redirect_uri } = params;
        
        // Валидация параметров
        if (!code) {
          return new Response(
            JSON.stringify({ error: "Missing authorization code" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Используем переданный redirect_uri из фронтенда (должен совпадать с OAuth запросом)
        // Fallback на origin Edge Function только для обратной совместимости
        const redirectUri = redirect_uri || `${new URL(req.url).origin}/auth/avito-callback`;

        // Exchange code for token
        const response = await fetch(`${AVITO_API_BASE}/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: avitoClientId,
            client_secret: avitoClientSecret,
            code,
            redirect_uri: redirectUri, // Используем переданный redirect_uri
          }),
        });

        if (!response.ok) {
          // Пытаемся получить детальную информацию об ошибке от Avito
          let errorMessage = `Token exchange failed (${response.status})`;
          let errorDetails: { error?: string; error_description?: string } | null = null;
          
          try {
            const errorData = await response.json();
            errorDetails = errorData;
            if (errorData.error) {
              errorMessage = `Avito API error: ${errorData.error}`;
              if (errorData.error_description) {
                errorMessage += ` - ${errorData.error_description}`;
              }
            } else {
              errorMessage = JSON.stringify(errorData);
            }
          } catch {
            // Если не JSON, читаем как текст
            try {
              const errorText = await response.text();
              errorMessage = errorText || errorMessage;
            } catch {
              // Игнорируем ошибки чтения
            }
          }
          
          // Логируем для отладки (без секретов)
          console.error("Avito token exchange error:", {
            status: response.status,
            statusText: response.statusText,
            redirect_uri: redirectUri,
            client_id: avitoClientId,
            has_code: !!code,
            error_details: errorDetails,
          });
          
          return new Response(
            JSON.stringify({ 
              error: errorMessage,
              status: response.status,
              details: errorDetails || "Check that redirect_uri matches exactly, client_id/secret are correct, and code is not expired"
            }),
            { 
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            }
          );
        }

        const tokenData = await response.json();

        return new Response(
          JSON.stringify({
            access_token: tokenData.access_token,
            token_type: tokenData.token_type,
            expires_in: tokenData.expires_in,
            // Note: Avito does NOT provide refresh_token
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case "get-accounts": {
        const { access_token } = params;

        // Validate access_token
        if (!access_token) {
          console.error("Missing access_token in get-accounts request");
          return new Response(
            JSON.stringify({ error: "Missing access_token parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Log token info for debugging (without exposing full token)
        console.log("Getting user accounts", {
          token_length: access_token.length,
          token_preview: `${access_token.substring(0, 10)}...${access_token.substring(access_token.length - 5)}`,
        });

        // Try different endpoints - Avito API might use different paths
        const endpoints = [
          `${AVITO_API_BASE}/core/v1/accounts/self`,
          `${AVITO_API_BASE}/v1/user`,
          `${AVITO_API_BASE}/user`,
        ];

        let lastResponse: Response | null = null;
        let lastErrorMessage: string | null = null;

        for (const endpoint of endpoints) {
          try {
            console.log(`Trying endpoint: ${endpoint}`);
            const response = await fetch(endpoint, {
              headers: {
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/json",
              },
            });

            console.log(`Response status: ${response.status} ${response.statusText}`);

            if (response.ok) {
              const userData = await response.json();
              
              // Полное логирование ответа от Avito API для поддержки
              console.log("Full Avito API response body:", JSON.stringify(userData, null, 2));
              
              // Детальное логирование для диагностики
              console.log("Successfully retrieved user data:", {
                full_response: JSON.stringify(userData, null, 2),
                has_accounts: !!userData.accounts,
                accounts_count: userData.accounts?.length || 0,
                keys: Object.keys(userData),
                has_id: !!userData.id,
                has_user_id: !!userData.user_id,
                userData_id: userData.id,
                userData_user_id: userData.user_id,
                userData_account_id: userData.account_id,
                userData_client_id: userData.client_id,
              });

              // Avito API может возвращать аккаунты в разных форматах
              // Проверяем разные возможные варианты
              let accounts: AvitoAccount[] = [];
              const userDataTyped = userData as AvitoUserData;
              
              if (Array.isArray(userData)) {
                // Если ответ - массив аккаунтов напрямую
                accounts = userData as AvitoAccount[];
              } else if (userDataTyped.accounts && Array.isArray(userDataTyped.accounts)) {
                // Если аккаунты в поле accounts
                accounts = userDataTyped.accounts;
              } else if (userDataTyped.data && Array.isArray(userDataTyped.data)) {
                // Если аккаунты в поле data
                accounts = userDataTyped.data;
              } else if (userDataTyped.items && Array.isArray(userDataTyped.items)) {
                // Если аккаунты в поле items
                accounts = userDataTyped.items;
              }

              // Если аккаунты не найдены, но есть данные пользователя в корне ответа,
              // создаем аккаунт из данных пользователя
              if (accounts.length === 0) {
                // Проверяем все возможные поля для ID
                const userId = userDataTyped.id || 
                               userDataTyped.user_id || 
                               userDataTyped.account_id ||
                               userDataTyped.client_id;
                
                if (userId) {
                  console.log("No accounts found in response, but user data exists. Creating account from user data.", {
                    userId,
                    userDataKeys: Object.keys(userDataTyped),
                    userDataSample: JSON.stringify(userDataTyped).substring(0, 500),
                  });
                  
                  const accountName = userDataTyped.name || 
                                      userDataTyped.username || 
                                      userDataTyped.display_name || 
                                      userDataTyped.email || 
                                      userDataTyped.title ||
                                      'Мой аккаунт';
                  
                  accounts = [{
                    id: String(userId),
                    name: String(accountName),
                    is_primary: true,
                    ...userDataTyped, // Сохраняем все остальные поля на случай, если они понадобятся
                  }];
                } else {
                  console.error("No accounts found and no user ID in response:", {
                    userDataKeys: Object.keys(userDataTyped),
                    userDataSample: JSON.stringify(userDataTyped).substring(0, 500),
                  });
                }
              }

              console.log("Extracted accounts:", {
                count: accounts.length,
                accounts: accounts.map((acc: AvitoAccount) => ({
                  id: acc.id || acc.account_id || acc.user_id,
                  name: acc.name || acc.title || acc.username || acc.display_name || 'Без названия',
                  is_primary: acc.is_primary || acc.primary || false,
                })),
              });

              // Преобразуем в нужный формат
              const formattedAccounts = accounts.map((acc: AvitoAccount) => ({
                id: String(acc.id || acc.account_id || acc.user_id || 'unknown'),
                name: acc.name || acc.title || acc.username || acc.display_name || 'Мой аккаунт',
                is_primary: acc.is_primary !== undefined ? acc.is_primary : (acc.primary !== undefined ? acc.primary : true),
              }));

              return new Response(JSON.stringify(formattedAccounts), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            // If not OK, try to get error details
            let errorBody = "";
            try {
              errorBody = await response.text();
              const errorJson = JSON.parse(errorBody);
              console.error("Avito API error response:", {
                endpoint,
                status: response.status,
                statusText: response.statusText,
                error: errorJson,
              });
            } catch {
              console.error("Avito API error response (non-JSON):", {
                endpoint,
                status: response.status,
                statusText: response.statusText,
                body: errorBody.substring(0, 200),
              });
            }

            lastResponse = response;
            lastErrorMessage = `Endpoint ${endpoint} returned ${response.status}: ${response.statusText}`;

            // If 404, try next endpoint
            if (response.status === 404) {
              continue;
            }

            // For other errors, stop trying
            break;
          } catch (error) {
            console.error(`Error fetching from ${endpoint}:`, error);
            lastErrorMessage = error instanceof Error ? error.message : String(error);
            continue;
          }
        }

        // All endpoints failed - return error response instead of throwing
        const errorMessage = lastResponse
          ? `Failed to get user accounts: ${lastResponse.status} ${lastResponse.statusText}`
          : lastErrorMessage
          ? `Failed to get user accounts: ${lastErrorMessage}`
          : "Failed to get user accounts: All endpoints returned errors";

        const statusCode = lastResponse?.status && lastResponse.status >= 400 && lastResponse.status < 600
          ? lastResponse.status
          : 500;

        return new Response(
          JSON.stringify({
            error: errorMessage,
            details: lastResponse
              ? {
                  status: lastResponse.status,
                  statusText: lastResponse.statusText,
                }
              : undefined,
          }),
          {
            status: statusCode,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case "validate-item": {
        const { account_id, item_id, access_token, property_id } = params;

        // Валидация параметров
        if (!account_id || !item_id || !access_token) {
          console.error("Missing required parameters for validate-item", {
            has_account_id: !!account_id,
            has_item_id: !!item_id,
            has_access_token: !!access_token,
          });
          return new Response(
            JSON.stringify({ available: false, error: "Отсутствуют обязательные параметры" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log("Validating item:", {
          account_id,
          item_id,
          token_length: access_token.length,
        });

        // Используем правильный endpoint из OpenAPI спецификации
        // /realty/v1/accounts/{user_id}/items/{item_id}/bookings требует обязательные query параметры date_start и date_end
        // Вычисляем даты: сегодня и завтра (для минимального диапазона)
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const dateStart = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const dateEnd = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

        console.log("Using realty/v1 endpoint with required date parameters", {
          date_start: dateStart,
          date_end: dateEnd,
        });

        // Используем endpoint из OpenAPI спецификации с обязательными параметрами
        const response = await fetch(
          `${AVITO_API_BASE}/realty/v1/accounts/${account_id}/items/${item_id}/bookings?date_start=${dateStart}&date_end=${dateEnd}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
          }
        );

        console.log("Item validation final response:", {
          status: response.status,
          statusText: response.statusText,
        });

        // Получаем тело ответа для детальной информации
        let responseBody = "";
        try {
          responseBody = await response.text();
          console.log("Item validation response body:", responseBody);
        } catch {
          // Игнорируем ошибки чтения
        }

        // Если объявление найдено (200 OK), проверяем, не используется ли оно уже в другой интеграции
        if (response.status === 200) {
          // Проверяем в базе данных, не используется ли этот item_id в другой интеграции
          const { data: existingIntegration } = await supabase
            .from("integrations")
            .select("id, property_id, is_active")
            .eq("platform", "avito")
            .eq("external_id", item_id)
            .maybeSingle();

          if (existingIntegration) {
            // Если property_id передан и совпадает с существующей интеграцией - разрешаем переподключение
            if (property_id && existingIntegration.property_id === property_id) {
              console.log("Item already used in same property, allowing reconnection:", {
                integration_id: existingIntegration.id,
                property_id: existingIntegration.property_id,
              });
              // Разрешаем переподключение к тому же property
              return new Response(JSON.stringify({ available: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            // Если используется в другом property - блокируем
            console.log("Item already used in different property:", {
              integration_id: existingIntegration.id,
              existing_property_id: existingIntegration.property_id,
              requested_property_id: property_id,
            });
            return new Response(
              JSON.stringify({ 
                available: false, 
                error: `ID уже используется в другом объекте (ID объекта: ${existingIntegration.property_id})` 
              }),
              {
                status: 409,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }

          // Объявление существует и доступно
          console.log("Item validation successful - item exists and is available");
          return new Response(JSON.stringify({ available: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (response.status === 404) {
          return new Response(
            JSON.stringify({ 
              available: false, 
              error: "Объявление с таким ID не найдено или не принадлежит выбранному аккаунту. Проверьте правильность ID и выбранный аккаунт." 
            }),
            {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Обработка других ошибок
        const errorMessage = responseBody || response.statusText;
        console.error("Item validation failed:", {
          status: response.status,
          statusText: response.statusText,
          body: responseBody,
        });
        return new Response(
          JSON.stringify({ 
            available: false, 
            error: `Ошибка при проверке ID: ${response.status} ${errorMessage}` 
          }),
          {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case "save-integration": {
        const {
          property_id,
          avito_account_id,
          avito_item_id,
          avito_markup,
          access_token,
        } = params;

        // Валидация обязательных параметров
        if (!property_id || !avito_account_id || !avito_item_id || !access_token) {
          console.error("Missing required parameters for save-integration", {
            has_property_id: !!property_id,
            has_avito_account_id: !!avito_account_id,
            has_avito_item_id: !!avito_item_id,
            has_access_token: !!access_token,
          });
          return new Response(
            JSON.stringify({ 
              error: "Отсутствуют обязательные параметры: property_id, avito_account_id, avito_item_id, access_token" 
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Валидация типов
        const parsedItemId = parseInt(avito_item_id, 10);
        if (isNaN(parsedItemId)) {
          console.error("Invalid avito_item_id type", { avito_item_id, type: typeof avito_item_id });
          return new Response(
            JSON.stringify({ error: "avito_item_id должен быть числом" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Calculate token expiration (default 1 hour, but Avito tokens may have different expiry)
        const tokenExpiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour default

        // Store token - Vault encryption will be handled by database trigger or RPC function
        // Note: For production, create a database trigger that encrypts access_token_encrypted
        // using vault.encrypt() before insert/update
        const { data: integration, error } = await supabase
          .from("integrations")
          .upsert({
            property_id,
            platform: "avito",
            external_id: avito_item_id.toString(),
            avito_account_id,
            avito_item_id: parsedItemId,
            avito_markup: avito_markup !== null && avito_markup !== undefined ? parseFloat(avito_markup) : 15.0,
            // Token will be encrypted by Vault trigger (create trigger in migration)
            access_token_encrypted: access_token,
            token_expires_at: tokenExpiresAt.toISOString(),
            is_active: true,
            is_enabled: true,
            markup_type: "percent",
            markup_value: avito_markup !== null && avito_markup !== undefined ? parseFloat(avito_markup) : 15.0,
          }, {
            onConflict: 'property_id,platform' // Указываем поля для разрешения конфликта
          })
          .select()
          .single();

        if (error) {
          console.error("Error saving integration:", {
            errorCode: error.code,
            errorMessage: error.message,
            errorDetails: error.details,
            errorHint: error.hint,
            params: {
              property_id,
              avito_account_id,
              avito_item_id: parsedItemId,
              has_avito_markup: !!avito_markup,
              has_access_token: !!access_token,
            }
          });
          throw error;
        }

        return new Response(JSON.stringify(integration), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "initial-sync":
      case "sync": {
        const { integration_id } = params;

        // Get integration with decrypted token
        const { data: integration, error: intError } = await supabase
          .from("integrations")
          .select("*")
          .eq("id", integration_id)
          .eq("is_active", true)
          .single();

        if (intError || !integration) {
          throw new Error("Integration not found or inactive");
        }

        // Check token expiration
        if (
          integration.token_expires_at &&
          new Date(integration.token_expires_at) < new Date()
        ) {
          throw new Error("Token expired. Please reconnect.");
        }

        // Get property and bookings
        const { data: property } = await supabase
          .from("properties")
          .select("*")
          .eq("id", integration.property_id)
          .single();

        const { data: bookings } = await supabase
          .from("bookings")
          .select("*")
          .eq("property_id", integration.property_id)
          .eq("status", "confirmed");

        // Calculate prices with markup
        const basePrice = property?.base_price || 0;
        const markup = integration.avito_markup !== null && integration.avito_markup !== undefined ? integration.avito_markup : 15;
        const priceWithMarkup = Math.round(basePrice * (1 + markup / 100));

        // Prepare blocked dates from bookings
        interface BookingRecord {
          check_in: string;
          check_out: string;
        }
        const blockedDates = (bookings as BookingRecord[] || []).map((b) => ({
          date: b.check_in,
          available: false,
        }));

        // Push availability and prices to Avito
        // Decrypt token using RPC function (or use directly if not encrypted yet)
        let accessToken = integration.access_token_encrypted;
        
        // Try to decrypt via RPC (if encrypted)
        try {
          const { data: decrypted } = await supabase.rpc('decrypt_avito_token', {
            encrypted_token: accessToken,
          });
          if (decrypted) accessToken = decrypted;
        } catch {
          // If RPC fails, assume token is not encrypted yet (for development)
        }
        
        const accountId = integration.avito_account_id;
        const itemId = integration.avito_item_id;

        // Update prices
        console.log("Updating base price in Avito", {
          accountId,
          itemId,
          basePrice,
          markup,
          priceWithMarkup,
          minStay: property?.minimum_booking_days || 1,
        });

        const pricesResponse = await fetch(
          `${AVITO_API_BASE}/short_term_rent/accounts/${accountId}/items/${itemId}/prices`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              price: priceWithMarkup,
              min_stay: property?.minimum_booking_days || 1,
            }),
          }
        );

        if (!pricesResponse.ok) {
          const errorText = await pricesResponse.text();
          console.error("Failed to update Avito prices", {
            status: pricesResponse.status,
            statusText: pricesResponse.statusText,
            error: errorText,
          });
          throw new Error(`Failed to update Avito prices: ${pricesResponse.status} ${pricesResponse.statusText} - ${errorText}`);
        } else {
          console.log("Avito prices updated successfully");
        }

        // Sync property_rates (calendar prices) and availability to Avito
        console.log("Syncing property_rates to Avito", {
          property_id: integration.property_id,
          accountId,
          itemId,
          markup,
        });

        const { data: propertyRates } = await supabase
          .from("property_rates")
          .select("*")
          .eq("property_id", integration.property_id)
          .gte("date", new Date().toISOString().split('T')[0]); // Only future dates

        console.log("Retrieved property_rates", {
          ratesCount: propertyRates?.length || 0,
          sampleRate: propertyRates && propertyRates.length > 0 ? {
            date: propertyRates[0].date,
            daily_price: propertyRates[0].daily_price,
            min_stay: propertyRates[0].min_stay,
          } : null,
        });

        // Prepare calendar dates: combine property_rates with blocked dates from bookings
        // Use format compatible with Avito API: { date, status: 'available'|'booked'|'blocked', price?, minStay? }
        const calendarDatesMap = new Map<string, { date: string; status: 'available' | 'booked' | 'blocked'; price?: number; minStay?: number }>();

        // Add property_rates with prices
        if (propertyRates && propertyRates.length > 0) {
          for (const rate of propertyRates) {
            const priceWithMarkup = Math.round(rate.daily_price * (1 + markup / 100));
            calendarDatesMap.set(rate.date, {
              date: rate.date,
              status: 'available',
              price: priceWithMarkup, // Apply markup
              minStay: rate.min_stay || property?.minimum_booking_days || 1,
            });
          }
        }

        // Override with blocked dates from bookings (bookings take priority)
        for (const blocked of blockedDates) {
          calendarDatesMap.set(blocked.date, {
            date: blocked.date,
            status: 'blocked', // Use 'blocked' status for unavailable dates
          });
        }

        // Convert map to array and update Avito calendar
        const calendarDates = Array.from(calendarDatesMap.values());
        
        console.log("Prepared calendar dates for Avito", {
          datesCount: calendarDates.length,
          sampleDate: calendarDates.length > 0 ? calendarDates[0] : null,
          blockedDatesCount: blockedDates.length,
        });
        
        if (calendarDates.length > 0) {
          console.log("Sending calendar update to Avito", {
            endpoint: `${AVITO_API_BASE}/short_term_rent/accounts/${accountId}/items/${itemId}/availability`,
            datesCount: calendarDates.length,
          });

          const calendarResponse = await fetch(
            `${AVITO_API_BASE}/short_term_rent/accounts/${accountId}/items/${itemId}/availability`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                dates: calendarDates,
              }),
            }
          );

          if (!calendarResponse.ok) {
            const errorText = await calendarResponse.text();
            console.error("Failed to update Avito calendar", {
              status: calendarResponse.status,
              statusText: calendarResponse.statusText,
              error: errorText,
            });
            throw new Error(`Failed to update Avito calendar: ${calendarResponse.status} ${calendarResponse.statusText} - ${errorText}`);
          } else {
            console.log("Avito calendar updated successfully", {
              datesCount: calendarDates.length,
            });
          }
        } else {
          console.log("No calendar dates to sync (all dates are in the past or no rates found)");
        }

        // Pull bookings from Avito
        const bookingsResponse = await fetch(
          `${AVITO_API_BASE}/short_term_rent/accounts/${accountId}/items/${itemId}/bookings`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (bookingsResponse.ok) {
          const avitoBookings = await bookingsResponse.json();

          // Create bookings in our DB
          for (const booking of avitoBookings || []) {
            const { data: existing } = await supabase
              .from("bookings")
              .select("id")
              .eq("source", "avito")
              .eq("external_id", booking.id)
              .maybeSingle();

            if (!existing) {
              await supabase.from("bookings").insert({
                property_id: integration.property_id,
                guest_name: booking.guest_name,
                guest_phone: booking.guest_phone,
                check_in: booking.check_in,
                check_out: booking.check_out,
                total_price: booking.total_price,
                currency: booking.currency,
                status: "confirmed",
                source: "avito",
                external_id: booking.id,
              });
            }
          }
        }

        // Update last_sync_at and ensure is_active is true
        await supabase
          .from("integrations")
          .update({ 
            last_sync_at: new Date().toISOString(),
            is_active: true 
          })
          .eq("id", integration_id);

        return new Response(
          JSON.stringify({ success: true, synced: true }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      default:
        console.error(`Unknown action: ${action}`);
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : "Error";

    // Log full error details for debugging
    console.error("Edge Function error:", {
      name: errorName,
      message: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        error: errorMessage,
        // Include stack trace in development mode (if needed)
        ...(process.env.DENO_ENV === "development" && errorStack
          ? { stack: errorStack }
          : {}),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

