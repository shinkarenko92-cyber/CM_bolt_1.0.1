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

// Helper function to refresh access token
async function refreshAccessToken(
  integration: { id: string; refresh_token_encrypted?: string | null },
  avitoClientId: string,
  avitoClientSecret: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  // Try refresh_token grant_type first if refresh_token exists
  if (integration.refresh_token_encrypted) {
    try {
      // Try to decrypt refresh token
      let refreshToken = integration.refresh_token_encrypted;
      try {
        const { data: decrypted } = await supabase.rpc('decrypt_avito_token', {
          encrypted_token: refreshToken,
        });
        if (decrypted) refreshToken = decrypted;
      } catch {
        // If RPC fails, assume token is not encrypted yet
      }

      const refreshResponse = await fetch(`${AVITO_API_BASE}/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: avitoClientId,
          client_secret: avitoClientSecret,
          refresh_token: refreshToken,
        }),
      });

      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        return {
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token,
          expires_in: refreshData.expires_in || 3600,
        };
      }
    } catch (error) {
      console.warn("Refresh token flow failed, falling back to client_credentials", error);
    }
  }

  // Fallback to client_credentials flow
  const refreshResponse = await fetch(`${AVITO_API_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: avitoClientId,
      client_secret: avitoClientSecret,
    }),
  });

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text();
    throw new Error(`Token refresh failed: ${refreshResponse.status} ${errorText}`);
  }

  const refreshData = await refreshResponse.json();
  return {
    access_token: refreshData.access_token,
    refresh_token: refreshData.refresh_token,
    expires_in: refreshData.expires_in || 3600,
  };
}

// Helper function to fetch with retry on 429 (rate limiting)
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);
    
    // If 429 (rate limit), retry with exponential backoff
    if (response.status === 429) {
      if (attempt < maxRetries - 1) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter 
          ? parseInt(retryAfter, 10) * 1000 
          : Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
        
        console.log(`Rate limited (429), retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
    }
    
    return response;
  }
  
  throw new Error(`Failed after ${maxRetries} retries`);
}

// Helper function to normalize phone number (keep only digits and +)
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Keep only digits and +
  const cleaned = phone.replace(/[^\d+]/g, '');
  // Normalize to +7 format if starts with 8 or 7
  if (cleaned.startsWith('8')) {
    return '+7' + cleaned.slice(1);
  }
  if (cleaned.startsWith('7') && !cleaned.startsWith('+7')) {
    return '+7' + cleaned.slice(1);
  }
  if (!cleaned.startsWith('+')) {
    return '+7' + cleaned;
  }
  return cleaned || null;
}

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
        // Параметр skip_error=true позволяет получать 200 статус вместо ошибок при проблемах с items
        const response = await fetch(
          `${AVITO_API_BASE}/realty/v1/accounts/${account_id}/items/${item_id}/bookings?date_start=${dateStart}&date_end=${dateEnd}&skip_error=true`,
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
          expires_in,
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

        // Calculate token expiration using real expires_in from Avito API
        // expires_in is in seconds, convert to milliseconds
        const expiresInSeconds = expires_in && typeof expires_in === 'number' && expires_in > 0 
          ? expires_in 
          : 3600; // Fallback to 1 hour (3600 seconds) if not provided or invalid
        const tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
        
        console.log("Calculating token expiration", {
          expires_in,
          expiresInSeconds,
          tokenExpiresAt: tokenExpiresAt.toISOString(),
          now: new Date().toISOString(),
        });

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
            avito_item_id: avito_item_id.toString(), // Store as TEXT for API calls (primary field)
            avito_item_id_text: avito_item_id.toString(), // Keep for backward compatibility (legacy)
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
        const { integration_id, exclude_booking_id } = params;

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

        // Helper function to get and refresh token if needed
        const getAccessToken = async (): Promise<string> => {
          let accessToken = integration.access_token_encrypted;
          
          // Check if token is expired
          if (integration.token_expires_at) {
            let expiresAtString = integration.token_expires_at;
            if (!expiresAtString.endsWith('Z') && !expiresAtString.includes('+') && !expiresAtString.includes('-', 10)) {
              expiresAtString = expiresAtString + 'Z';
            }
            
            const expiresAt = new Date(expiresAtString);
            const now = new Date();
            
            // Refresh if expired or expires within 5 minutes
            if (expiresAt.getTime() <= now.getTime() + 5 * 60 * 1000) {
              console.log("Token expired or expiring soon, refreshing...", {
                expiresAt: expiresAt.toISOString(),
                now: now.toISOString(),
                integration_id: integration.id,
              });

              try {
                const refreshData = await refreshAccessToken(
                  integration,
                  avitoClientId,
                  avitoClientSecret,
                  supabase
                );
                
                accessToken = refreshData.access_token;

                // Update token in database
                const expiresIn = refreshData.expires_in || 3600;
                const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

                const updateData: {
                  access_token_encrypted: string;
                  token_expires_at: string;
                  refresh_token_encrypted?: string;
                } = {
                  access_token_encrypted: accessToken,
                  token_expires_at: tokenExpiresAt.toISOString(),
                };

                // Update refresh_token if provided
                if (refreshData.refresh_token) {
                  updateData.refresh_token_encrypted = refreshData.refresh_token;
                }

                const { error: updateError } = await supabase
                  .from("integrations")
                  .update(updateData)
                  .eq("id", integration_id);

                if (updateError) {
                  console.error("Failed to update token in database", {
                    error: updateError,
                    integration_id: integration.id,
                  });
                } else {
                  console.log("Token refreshed and updated in database", {
                    integration_id: integration.id,
                    newExpiresAt: tokenExpiresAt.toISOString(),
                  });
                  
                  // Log refresh success
                  await supabase.from("avito_logs").insert({
                    integration_id: integration.id,
                    property_id: integration.property_id,
                    action: "refresh_token",
                    status: "success",
                    details: { expires_at: tokenExpiresAt.toISOString() },
                  });
                }
              } catch (error) {
                console.error("Failed to refresh token", {
                  error: error instanceof Error ? error.message : String(error),
                  integration_id: integration.id,
                });
                
                // Log refresh failure
                await supabase.from("avito_logs").insert({
                  integration_id: integration.id,
                  property_id: integration.property_id,
                  action: "refresh_token",
                  status: "error",
                  error: error instanceof Error ? error.message : String(error),
                });
                
                throw new Error("Token expired and failed to refresh. Please reconnect.");
              }
            }
          }

          if (!accessToken) {
            throw new Error("No access token available");
          }

          // Try to decrypt token if encrypted
          try {
            const { data: decrypted } = await supabase.rpc('decrypt_avito_token', {
              encrypted_token: accessToken,
            });
            if (decrypted) accessToken = decrypted;
          } catch {
            // If RPC fails, assume token is not encrypted yet
            console.warn("RPC decrypt_avito_token failed, using token as-is");
          }

          return accessToken;
        };

        // Get access token (will refresh if needed)
        const accessToken = await getAccessToken();

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
        // Используем реальные check_in и check_out для создания бронирований
        interface BookingRecord {
          id: string;
          check_in: string;
          check_out: string;
          guest_name?: string | null;
          guest_phone?: string | null;
          source?: string | null;
        }
        
        // Filter bookings: exclude deleted booking if exclude_booking_id is provided
        // This is used when deleting manual bookings to open dates in Avito
        const bookingsForAvito = (bookings as BookingRecord[] || []).filter((b) => {
          // Exclude deleted booking if specified
          if (exclude_booking_id && b.id === exclude_booking_id) {
            console.log("Excluding deleted booking from Avito sync", {
              booking_id: b.id,
              check_in: b.check_in,
              check_out: b.check_out,
            });
            return false;
          }
          // Только будущие бронирования
          const checkIn = new Date(b.check_in);
          return checkIn >= new Date(new Date().toISOString().split('T')[0]);
        });

        // Log if we're excluding a booking (manual booking deletion)
        if (exclude_booking_id) {
          console.log("Syncing Avito with excluded booking (manual booking deleted)", {
            excluded_booking_id: exclude_booking_id,
            remaining_bookings_count: bookingsForAvito.length,
            total_bookings_count: bookings?.length || 0,
          });
        }

        // Get account_id and item_id
        // avito_account_id should be the account/user_id
        // avito_item_id should be the item/advertisement_id (TEXT)
        const accountId = integration.avito_account_id;
        // Use avito_item_id (TEXT) - primary field, fallback to avito_item_id_text or BIGINT conversion
        const itemId = (integration as { avito_item_id?: string | null }).avito_item_id
          || (integration as { avito_item_id_text?: string | null }).avito_item_id_text
          || (integration.avito_item_id ? String(integration.avito_item_id) : null);

        if (!itemId) {
          return new Response(
            JSON.stringify({ 
              success: false,
              error: "ID объявления не настроен. Проверь настройки интеграции Avito." 
            }),
            { 
              status: 400, 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            }
          );
        }

        // Sync property_rates (calendar prices) and availability to Avito
        // Используем правильные эндпоинты согласно документации:
        // 1. POST /realty/v1/accounts/{user_id}/items/{item_id}/prices - для обновления цен
        // 2. POST /realty/v1/items/{item_id}/base - для базовых параметров
        // 3. POST /core/v1/accounts/{user_id}/items/{item_id}/bookings - для отправки бронирований (putBookingsInfo)
        // Примечание: несмотря на название метода putBookingsInfo, API использует POST метод
        console.log("Syncing property_rates to Avito", {
          property_id: integration.property_id,
          accountId,
          itemId,
          markup,
          basePrice,
          priceWithMarkup,
        });

        // Массив для сбора всех ошибок во время синхронизации
        const syncErrors: Array<{
          operation: string;
          statusCode?: number;
          errorCode?: string;
          message: string;
          details?: unknown;
        }> = [];

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

        // 1. Обновление цен через POST /realty/v1/accounts/{account_id}/items/{item_id}/prices
        // Формат: { prices: [{ date_from, date_to, night_price, minimal_duration, extra_guest_fee? }] }
        // extra_guest_fee - опциональная доплата за гостя (рубли)
        const pricesToUpdate: Array<{
          date_from: string;
          date_to: string;
          night_price: number;
          minimal_duration: number;
          extra_guest_fee?: number; // TODO: Добавить поддержку когда поле будет в property_rates или property
        }> = [];

        // Группируем property_rates по периодам с одинаковой ценой и минимальным сроком
        if (propertyRates && propertyRates.length > 0) {
          // Сортируем по дате
          const sortedRates = [...propertyRates].sort((a, b) => a.date.localeCompare(b.date));
          
          let currentPeriod: {
            date_from: string;
            date_to: string;
            night_price: number;
            minimal_duration: number;
            extra_guest_fee?: number;
          } | null = null;

          for (const rate of sortedRates) {
            const priceWithMarkup = Math.round(rate.daily_price * (1 + markup / 100));
            const minStay = rate.min_stay || property?.minimum_booking_days || 1;
            // TODO: Добавить extra_guest_fee когда поле будет доступно в rate или property
            // const extraGuestFee = rate.extra_guest_fee || property?.extra_guest_fee;

            if (!currentPeriod || 
                currentPeriod.night_price !== priceWithMarkup || 
                currentPeriod.minimal_duration !== minStay) {
              // Сохраняем предыдущий период, если он есть
              if (currentPeriod) {
                pricesToUpdate.push(currentPeriod);
              }
              // Начинаем новый период
              currentPeriod = {
                date_from: rate.date,
                date_to: rate.date,
                night_price: priceWithMarkup,
                minimal_duration: minStay,
                // extra_guest_fee: extraGuestFee, // Раскомментировать когда поле будет доступно
              };
            } else {
              // Продолжаем текущий период
              currentPeriod.date_to = rate.date;
            }
          }
          
          // Добавляем последний период
          if (currentPeriod) {
            pricesToUpdate.push(currentPeriod);
          }
        } else {
          // Если нет property_rates, используем базовую цену на 90 дней вперед
          const today = new Date();
          const endDate = new Date();
          endDate.setDate(today.getDate() + 90);
          
          pricesToUpdate.push({
            date_from: today.toISOString().split('T')[0],
            date_to: endDate.toISOString().split('T')[0],
            night_price: priceWithMarkup,
            minimal_duration: property?.minimum_booking_days || 1,
            // TODO: Добавить extra_guest_fee когда поле будет доступно в property
            // extra_guest_fee: property?.extra_guest_fee,
          });
        }

        // Отправляем обновление цен
        if (pricesToUpdate.length > 0) {
          console.log("Sending price update to Avito", {
            endpoint: `${AVITO_API_BASE}/realty/v1/accounts/${accountId}/items/${itemId}/prices`,
            periodsCount: pricesToUpdate.length,
          });

          // Use correct endpoint: /realty/v1/items/{item_id}/prices (no account_id needed)
          const pricesResponse = await fetchWithRetry(
            `${AVITO_API_BASE}/realty/v1/items/${itemId}/prices?skip_error=true`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                prices: pricesToUpdate,
              }),
            }
          );

          if (!pricesResponse.ok) {
            // Handle 404 - item not found
            if (pricesResponse.status === 404) {
              const errorMessage = "Объявление не найдено в Avito. Проверь ID объекта в настройках интеграции";
              syncErrors.push({
                operation: 'price_update',
                statusCode: 404,
                message: errorMessage,
                details: { item_id: itemId },
              });
              console.error("Avito item not found (404)", { item_id: itemId });
              // Continue with other operations - skip rest of error handling
            } else {
              const errorText = await pricesResponse.text();
              let errorDetails: unknown = errorText;
              let errorCode: string | undefined;
              let errorMessage = `Failed to update prices: ${pricesResponse.status} ${pricesResponse.statusText}`;

              try {
                const errorJson = JSON.parse(errorText);
                errorDetails = errorJson;
                errorMessage = errorJson.message || errorJson.error?.message || errorMessage;
                errorCode = errorJson.error?.code || errorJson.code;
              } catch {
                // Если не JSON, используем текст как есть
              }

              syncErrors.push({
                operation: 'price_update',
                statusCode: pricesResponse.status,
                errorCode,
                message: errorMessage,
                details: errorDetails,
              });

              console.error("Failed to update Avito prices", {
                status: pricesResponse.status,
                statusText: pricesResponse.statusText,
                error: errorText,
              });
              // Не бросаем ошибку, продолжаем синхронизацию
              console.warn("Price update failed, but continuing with bookings sync");
            }
          } else {
            const responseData = await pricesResponse.json().catch(() => null);
            console.log("Avito prices updated successfully", {
              periodsCount: pricesToUpdate.length,
              response: responseData,
            });
          }
        } else {
          console.log("No prices to update (pricesToUpdate is empty)", {
            hasPropertyRates: !!propertyRates,
            propertyRatesCount: propertyRates?.length || 0,
            basePrice: property?.base_price,
            priceWithMarkup,
          });
        }

        // 2. Обновление базовых параметров через POST /realty/v1/items/{item_id}/base
        // Формат: { night_price, minimal_duration, extra_guest_fee?, extra_guest_threshold?, instant?, refund?, discount? }
        console.log("Updating base parameters in Avito", {
          endpoint: `${AVITO_API_BASE}/realty/v1/items/${itemId}/base`,
          night_price: priceWithMarkup,
          minimal_duration: property?.minimum_booking_days || 1,
        });

        const baseParamsResponse = await fetchWithRetry(
          `${AVITO_API_BASE}/realty/v1/items/${itemId}/base`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              night_price: priceWithMarkup,
              minimal_duration: property?.minimum_booking_days || 1,
              // TODO: Добавить поддержку extra_guest_fee и extra_guest_threshold когда поля будут в БД
              // extra_guest_fee: property?.extra_guest_fee,
              // extra_guest_threshold: property?.extra_guest_threshold,
            }),
          }
        );

        if (!baseParamsResponse.ok) {
          // Handle 404 - item not found
          if (baseParamsResponse.status === 404) {
            const errorMessage = "Объявление не найдено в Avito. Проверь ID объекта в настройках интеграции";
            syncErrors.push({
              operation: 'base_params_update',
              statusCode: 404,
              message: errorMessage,
              details: { item_id: itemId },
            });
            console.error("Avito item not found (404)", { item_id: itemId });
            // Continue with other operations
          } else {
            const errorText = await baseParamsResponse.text();
            let errorDetails: unknown = errorText;
            let errorCode: string | undefined;
            let errorMessage = `Failed to update base parameters: ${baseParamsResponse.status} ${baseParamsResponse.statusText}`;

            try {
              const errorJson = JSON.parse(errorText);
              errorDetails = errorJson;
              errorMessage = errorJson.message || errorJson.error?.message || errorMessage;
              errorCode = errorJson.error?.code || errorJson.code;
            } catch {
              // Если не JSON, используем текст как есть
            }

            syncErrors.push({
              operation: 'base_params_update',
              statusCode: baseParamsResponse.status,
              errorCode,
              message: errorMessage,
              details: errorDetails,
            });

            console.error("Failed to update Avito base parameters", {
              status: baseParamsResponse.status,
              statusText: baseParamsResponse.statusText,
              error: errorText,
            });
            // Не бросаем ошибку, продолжаем синхронизацию
            console.warn("Base parameters update failed, but continuing with bookings sync");
          }
        } else {
          try {
            const responseData = await baseParamsResponse.json().catch(() => null);
            console.log("Avito base parameters updated successfully", {
              response: responseData,
            });
          } catch {
            console.log("Avito base parameters updated successfully", {
              status: baseParamsResponse.status,
            });
          }
        }

        // 3. Отправка бронирований через POST /core/v1/accounts/{account_id}/items/{item_id}/bookings (putBookingsInfo)
        // Примечание: несмотря на название метода putBookingsInfo, API использует POST метод
        // Формат: { bookings: [{ date_start, date_end, type?, comment?, contact? }], source? }
        // type: "manual" | "booking" - тип бронирования (manual - закрыто вручную, booking - бронирование)
        // comment: дополнительная информация (опционально)
        // contact: { name?, phone? } - контактная информация гостя (опционально, если API поддерживает)
        // source: название PMS системы (опционально)
        // date_start и date_end должны быть в формате YYYY-MM-DD
        // Отправляем реальные бронирования из нашей системы
        const bookingsToSend: Array<{
          date_start: string;
          date_end: string;
          type?: string;
          comment?: string;
          contact?: {
            name?: string;
            phone?: string;
          };
        }> = [];

        // Преобразуем бронирования в формат Avito API
        for (const booking of bookingsForAvito) {
          // Убеждаемся, что даты в формате YYYY-MM-DD (обрезаем время, если есть)
          const dateStart = booking.check_in.split('T')[0];
          const dateEnd = booking.check_out.split('T')[0];
          
          // Формируем объект бронирования
          const bookingToSend: {
            date_start: string;
            date_end: string;
            type: string;
            comment?: string;
            contact?: {
              name?: string;
              phone?: string;
            };
          } = {
            date_start: dateStart,
            date_end: dateEnd,
            type: "booking", // Тип бронирования
          };

          // Добавляем комментарий с информацией о госте, если есть имя
          if (booking.guest_name && booking.guest_name !== "Гость с Avito") {
            bookingToSend.comment = `Бронирование: ${booking.guest_name}`;
            
            // Пытаемся добавить контактную информацию, если API поддерживает
            if (booking.guest_name || booking.guest_phone) {
              bookingToSend.contact = {};
              if (booking.guest_name && booking.guest_name !== "Гость с Avito") {
                bookingToSend.contact.name = booking.guest_name;
              }
              if (booking.guest_phone) {
                bookingToSend.contact.phone = booking.guest_phone;
              }
            }
          } else {
            bookingToSend.comment = "Бронирование из Roomi Pro";
          }
          
          bookingsToSend.push(bookingToSend);
        }

        // Отправляем бронирования через putBookingsInfo
        if (bookingsToSend.length > 0) {
          console.log("Sending bookings to Avito via putBookingsInfo", {
            endpoint: `${AVITO_API_BASE}/core/v1/accounts/${accountId}/items/${itemId}/bookings`,
            bookingsCount: bookingsToSend.length,
            method: "POST",
          });

          // Use correct endpoint: /realty/v1/items/{item_id}/intervals for blocking dates
          // Avito API: intervals array with date_start and date_end closes those dates
          // Empty intervals array opens all dates
          // We send only closed intervals (occupied dates), rest are open by default
          const intervalsToSend = bookingsToSend.map(b => ({
            date_start: b.date_start,
            date_end: b.date_end,
          }));

          console.log("Sending intervals to Avito", {
            endpoint: `${AVITO_API_BASE}/realty/v1/items/${itemId}/intervals`,
            intervalsCount: intervalsToSend.length,
            exclude_booking_id: exclude_booking_id || null,
            action: exclude_booking_id ? "open_dates_after_manual_delete" : "sync_occupancy",
          });

          const bookingsUpdateResponse = await fetchWithRetry(
            `${AVITO_API_BASE}/realty/v1/items/${itemId}/intervals`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                item_id: itemId,
                intervals: intervalsToSend,
                source: "Roomi Pro", // Название PMS системы
              }),
            }
          );

          if (!bookingsUpdateResponse.ok) {
            const errorText = await bookingsUpdateResponse.text();
            const errorStatus = bookingsUpdateResponse.status;
            
            // Handle 404 - item not found
            if (errorStatus === 404) {
              const errorMessage = "Объявление не найдено в Avito. Проверь ID объекта в настройках интеграции";
              syncErrors.push({
                operation: 'bookings_update',
                statusCode: 404,
                message: errorMessage,
                details: { item_id: itemId },
              });
              console.error("Avito item not found (404)", { item_id: itemId });
              // Continue with other operations
            }
            // Специальная обработка ошибки 409 (конфликт с оплаченными бронями)
            else if (errorStatus === 409) {
              const errorMessage = exclude_booking_id
                ? "Конфликт с оплаченной бронью в Avito — проверь вручную"
                : "Some bookings conflict with paid bookings in Avito (409)";
              
              console.warn(errorMessage, {
                error: errorText,
                bookingsCount: bookingsToSend.length,
                excluded_booking_id: exclude_booking_id || null,
              });
              
              // Add 409 to errors if it's a manual booking deletion (user needs to know)
              if (exclude_booking_id) {
                syncErrors.push({
                  operation: 'bookings_update',
                  statusCode: 409,
                  message: errorMessage,
                  details: { item_id: itemId, excluded_booking_id: exclude_booking_id },
                });
              }
              // Не добавляем 409 в ошибки для обычного sync, это нормальная ситуация
            } else {
              let errorDetails: unknown = errorText;
              let errorCode: string | undefined;
              let errorMessage = `Failed to update bookings: ${errorStatus} ${bookingsUpdateResponse.statusText}`;

              try {
                const errorJson = JSON.parse(errorText);
                errorDetails = errorJson;
                errorMessage = errorJson.message || errorJson.error?.message || errorMessage;
                errorCode = errorJson.error?.code || errorJson.code;
              } catch {
                // Если не JSON, используем текст как есть
              }

              syncErrors.push({
                operation: 'bookings_update',
                statusCode: errorStatus,
                errorCode,
                message: errorMessage,
                details: errorDetails,
              });

              console.error("Failed to update Avito bookings", {
                status: errorStatus,
                statusText: bookingsUpdateResponse.statusText,
                error: errorText,
              });
              // Не бросаем ошибку, продолжаем синхронизацию
              console.warn("Bookings update failed, but continuing with sync");
            }
          } else {
            try {
              const responseData = await bookingsUpdateResponse.json().catch(() => null);
              const logMessage = exclude_booking_id 
                ? "Dates opened in Avito for manual booking delete"
                : "Avito bookings updated successfully via intervals";
              
              console.log(logMessage, {
                intervalsCount: intervalsToSend.length,
                bookingsCount: bookingsToSend.length,
                excluded_booking_id: exclude_booking_id || null,
                response: responseData,
              });

              // Log success to avito_logs
              await supabase.from("avito_logs").insert({
                integration_id: integration.id,
                property_id: integration.property_id,
                action: exclude_booking_id ? "open_dates_after_delete" : "sync_intervals",
                status: "success",
                details: {
                  intervals_count: intervalsToSend.length,
                  excluded_booking_id: exclude_booking_id || null,
                },
              });
            } catch {
              console.log("Avito intervals updated successfully", {
                intervalsCount: intervalsToSend.length,
                bookingsCount: bookingsToSend.length,
                status: bookingsUpdateResponse.status,
                excluded_booking_id: exclude_booking_id || null,
              });
            }
          }
        } else {
          // No bookings to block - send empty intervals to open all dates
          // This happens when all bookings are deleted or none are future
          if (exclude_booking_id) {
            console.log("No bookings left after deletion, opening all dates in Avito", {
              excluded_booking_id: exclude_booking_id,
            });

            const openAllResponse = await fetchWithRetry(
              `${AVITO_API_BASE}/realty/v1/items/${itemId}/intervals`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  item_id: itemId,
                  intervals: [], // Empty array opens all dates
                  source: "Roomi Pro",
                }),
              }
            );

            if (openAllResponse.ok) {
              console.log("All dates opened in Avito after manual booking deletion");
              
              // Log success to avito_logs
              await supabase.from("avito_logs").insert({
                integration_id: integration.id,
                property_id: integration.property_id,
                action: "open_all_dates_after_delete",
                status: "success",
                details: {
                  excluded_booking_id: exclude_booking_id,
                },
              });
            } else {
              const errorText = await openAllResponse.text();
              console.error("Failed to open all dates in Avito", {
                status: openAllResponse.status,
                error: errorText,
              });
            }
          } else {
            console.log("No bookings to send to Avito (no blocked dates)", {
              bookingsForAvitoCount: bookingsForAvito.length,
              today: new Date().toISOString().split('T')[0],
            });
          }
        }

        // Pull bookings from Avito
        // Используем правильный endpoint из документации: GET /realty/v1/accounts/{user_id}/items/{item_id}/bookings
        // С обязательными параметрами date_start и date_end (диапазон на год вперед)
        // Параметр with_unpaid=true позволяет получать неоплаченные бронирования (в статусе pending)
        const today = new Date();
        const oneYearLater = new Date(today);
        oneYearLater.setFullYear(today.getFullYear() + 1);
        
        const dateStart = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const dateEnd = oneYearLater.toISOString().split('T')[0]; // YYYY-MM-DD

          console.log("Pulling bookings from Avito", {
          accountId,
          itemId,
          property_id: integration.property_id,
          date_start: dateStart,
          date_end: dateEnd,
          with_unpaid: true, // Получаем неоплаченные бронирования (в статусе pending)
          skip_error: true, // Получаем 200 статус вместо ошибок при проблемах с items
          endpoint: `/realty/v1/accounts/${accountId}/items/${itemId}/bookings`,
        });

        // Helper function to fetch bookings with 401 retry
        // For pull bookings, we need account_id in the path: /accounts/{account_id}/items/{item_id}/bookings
        const fetchBookings = async (token: string): Promise<Response> => {
          if (!accountId) {
            throw new Error("Missing avito_account_id for fetching bookings");
          }

          const response = await fetchWithRetry(
            `${AVITO_API_BASE}/realty/v1/accounts/${accountId}/items/${itemId}/bookings?date_start=${dateStart}&date_end=${dateEnd}&with_unpaid=true&skip_error=true`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          // If 401, refresh token and retry once
          if (response.status === 401) {
            console.log("Got 401, refreshing token and retrying...");
            const refreshData = await refreshAccessToken(
              integration,
              avitoClientId,
              avitoClientSecret,
              supabase
            );
            
            // Update token in database
            const expiresIn = refreshData.expires_in || 3600;
            const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
            const updateData: {
              access_token_encrypted: string;
              token_expires_at: string;
              refresh_token_encrypted?: string;
            } = {
              access_token_encrypted: refreshData.access_token,
              token_expires_at: tokenExpiresAt.toISOString(),
            };
            if (refreshData.refresh_token) {
              updateData.refresh_token_encrypted = refreshData.refresh_token;
            }
            await supabase.from("integrations").update(updateData).eq("id", integration_id);
            
            // Retry with new token
            return await fetchWithRetry(
              `${AVITO_API_BASE}/realty/v1/accounts/${accountId}/items/${itemId}/bookings?date_start=${dateStart}&date_end=${dateEnd}&with_unpaid=true&skip_error=true`,
              {
                headers: {
                  Authorization: `Bearer ${refreshData.access_token}`,
                  "Content-Type": "application/json",
                },
              }
            );
          }

          return response;
        };

        const bookingsResponse = await fetchBookings(accessToken);

        // Handle 404 - item not found
        if (bookingsResponse.status === 404) {
          const errorMessage = "Объявление не найдено в Avito. Проверь ID объекта в настройках интеграции";
          syncErrors.push({
            operation: 'bookings_fetch',
            statusCode: 404,
            message: errorMessage,
            details: { item_id: itemId, account_id: accountId },
          });
          console.error("Avito item not found (404)", { item_id: itemId, account_id: accountId });
          // Don't throw, continue with sync (bookings pull is not critical)
        }

        // Handle 409 conflict (some bookings conflict with paid bookings)
        if (bookingsResponse.status === 409) {
          console.warn("Some bookings conflict with paid bookings in Avito (409)", {
            integration_id: integration.id,
          });
          // Don't treat 409 as error, continue with sync
        }

        if (bookingsResponse.ok || bookingsResponse.status === 409) {
          let responseData: unknown;
          try {
            responseData = await bookingsResponse.json();
          } catch {
            // If 409 and no JSON body, continue
            if (bookingsResponse.status === 409) {
              console.log("409 conflict, no bookings data, continuing...");
              responseData = { bookings: [] };
            } else {
              throw new Error("Failed to parse bookings response");
            }
          }
          
          // Avito API может возвращать массив напрямую или объект с массивом внутри
          // Обрабатываем оба варианта
          // Структура согласно документации RealtyBooking
          interface AvitoBookingResponse {
            avito_booking_id?: number; // Идентификатор бронирования на Авито (основное поле)
            id?: string | number; // Fallback для обратной совместимости
            check_in: string; // Дата заезда гостей
            check_out: string; // Дата выезда гостей
            base_price?: number; // Стоимость проживания на весь срок бронирования (основное поле)
            total_price?: number; // Fallback для обратной совместимости
            price?: number; // Fallback для обратной совместимости
            contact?: {
              name?: string; // Имя гостя
              email?: string; // Email гостя
              phone?: string; // Номер телефона
            };
            customer?: {  // Приоритетное поле согласно документации
              name?: string;
              email?: string;
              phone?: string;
            };
            user?: {  // Возможный вариант структуры данных
              name?: string;
              email?: string;
              phone?: string;
            };
            guest_name?: string; // Fallback для обратной совместимости
            guest_email?: string; // Fallback для обратной совместимости
            guest_phone?: string; // Fallback для обратной совместимости
            guest?: {
              name?: string;
              email?: string;
              phone?: string;
            };
            guest_count?: number; // Количество гостей (основное поле)
            guests_count?: number; // Fallback для обратной совместимости
            guests?: number; // Fallback для обратной совместимости
            status?: "active" | "canceled" | "pending"; // Статус брони
            nights?: number; // Количество ночей
            safe_deposit?: {
              total_amount?: number; // Фактическая сумма предоплаты
              owner_amount?: number; // Сумма, которую получит владелец объекта
              tax?: number; // Комиссия Авито
            };
            currency?: string;
            [key: string]: unknown; // Для дополнительных полей
          }
          
          let avitoBookings: AvitoBookingResponse[] = [];
          if (Array.isArray(responseData)) {
            avitoBookings = responseData as AvitoBookingResponse[];
          } else if (responseData && typeof responseData === 'object' && responseData !== null) {
            const data = responseData as Record<string, unknown>;
            if (Array.isArray(data.bookings)) {
              avitoBookings = data.bookings as AvitoBookingResponse[];
            } else if (Array.isArray(data.data)) {
              avitoBookings = data.data as AvitoBookingResponse[];
            } else if (Array.isArray(data.items)) {
              avitoBookings = data.items as AvitoBookingResponse[];
            }
          }
          
          console.log("Received bookings from Avito", {
            rawResponseType: typeof responseData,
            rawResponseKeys: responseData && typeof responseData === 'object' ? Object.keys(responseData) : null,
            bookingsCount: avitoBookings.length,
            sampleBooking: avitoBookings.length > 0 ? avitoBookings[0] : null,
            fullResponse: responseData, // Логируем полный ответ для диагностики
          });
          
          // Детальное логирование структуры ответа в JSON формате для диагностики
          if (avitoBookings.length > 0) {
            console.log("Full booking response structure (JSON)", {
              firstBookingJSON: JSON.stringify(avitoBookings[0], null, 2),
              fullResponseJSON: JSON.stringify(responseData, null, 2),
            });
          }

          // Детальное логирование структуры первого бронирования для диагностики
          if (avitoBookings.length > 0) {
            const sample = avitoBookings[0];
            console.log("Sample booking structure for diagnostics", {
              bookingId: sample.avito_booking_id || sample.id,
              hasContact: !!sample.contact,
              contactFields: sample.contact ? Object.keys(sample.contact) : null,
              hasCustomer: !!sample.customer,
              customerFields: sample.customer ? Object.keys(sample.customer) : null,
              hasUser: !!sample.user,
              userFields: sample.user ? Object.keys(sample.user) : null,
              hasGuest: !!sample.guest,
              guestFields: sample.guest ? Object.keys(sample.guest) : null,
              allFields: Object.keys(sample),
              contactName: sample.contact?.name,
              customerName: sample.customer?.name,
              userName: sample.user?.name,
              guestName: sample.guest?.name,
              guest_name: sample.guest_name,
              contactPhone: sample.contact?.phone,
              customerPhone: sample.customer?.phone,
              userPhone: sample.user?.phone,
              guestPhone: sample.guest?.phone,
              guest_phone: sample.guest_phone,
            });
          }

          let createdCount = 0;
          let skippedCount = 0;
          let errorCount = 0;

          // Create bookings in our DB
          if (avitoBookings.length > 0) {
            for (const booking of avitoBookings) {
              try {
                // Validate booking data согласно документации RealtyBooking
                // Используем avito_booking_id как основное поле, fallback на id для обратной совместимости
                const bookingId = booking.avito_booking_id || booking.id;
                if (!bookingId || !booking.check_in || !booking.check_out) {
                  console.warn("Skipping invalid booking from Avito", {
                    booking,
                    missingFields: {
                      avito_booking_id: !booking.avito_booking_id,
                      id: !booking.id,
                      check_in: !booking.check_in,
                      check_out: !booking.check_out,
                    },
                  });
                  skippedCount++;
                  continue;
                }


                // Расширенная функция извлечения имени с проверкой всех возможных полей
                // Приоритет: customer.name > contact.name > остальные
                const extractGuestName = (booking: AvitoBookingResponse): string => {
                  // Приоритет customer.name согласно документации
                  const name = booking.customer?.name 
                    || booking.contact?.name 
                    || booking.guest_name 
                    || booking.guest?.name
                    || booking.user?.name
                    || ('name' in booking && typeof booking.name === 'string' ? booking.name : undefined);
                  
                  if (name && name.trim() && name !== "Гость с Avito") {
                    return name.trim();
                  }
                  
                  // Логируем для диагностики, если имя не найдено
                  console.warn("Guest name not found in booking", {
                    bookingId: booking.avito_booking_id || booking.id,
                    availableFields: Object.keys(booking),
                    contact: booking.contact,
                    customer: booking.customer,
                    guest: booking.guest,
                    user: booking.user,
                  });
                  
                  return "Гость Avito"; // Fallback только если действительно нет имени
                };

                // Расширенная функция извлечения телефона
                // Приоритет: customer.phone > contact.phone > остальные
                const extractGuestPhone = (booking: AvitoBookingResponse): string | null => {
                  // Приоритет customer.phone согласно документации
                  const phone = booking.customer?.phone
                    || booking.contact?.phone 
                    || booking.guest_phone 
                    || booking.guest?.phone
                    || booking.user?.phone
                    || ('phone' in booking && typeof booking.phone === 'string' ? booking.phone : undefined);
                  
                  return normalizePhone(phone);
                };

                // Извлекаем данные гостя используя расширенные функции
                // Приоритет customer согласно документации
                const contactName = extractGuestName(booking);
                const contactEmail = booking.customer?.email
                  || booking.contact?.email 
                  || booking.guest_email 
                  || booking.guest?.email
                  || booking.user?.email
                  || ('email' in booking && typeof booking.email === 'string' ? booking.email : null)
                  || null;
                const contactPhone = extractGuestPhone(booking);

                // Логируем, какие поля были найдены для диагностики
                console.log("Extracted guest data from booking", {
                  bookingId: booking.avito_booking_id || booking.id,
                  guestName: contactName,
                  nameSource: booking.contact?.name ? 'contact.name' 
                    : booking.customer?.name ? 'customer.name'
                    : booking.guest_name ? 'guest_name'
                    : booking.guest?.name ? 'guest.name'
                    : booking.user?.name ? 'user.name'
                    : 'fallback',
                  hasEmail: !!contactEmail,
                  emailSource: booking.contact?.email ? 'contact.email'
                    : booking.customer?.email ? 'customer.email'
                    : booking.guest_email ? 'guest_email'
                    : booking.guest?.email ? 'guest.email'
                    : booking.user?.email ? 'user.email'
                    : 'none',
                  hasPhone: !!contactPhone,
                  phoneSource: booking.contact?.phone ? 'contact.phone'
                    : booking.customer?.phone ? 'customer.phone'
                    : booking.guest_phone ? 'guest_phone'
                    : booking.guest?.phone ? 'guest.phone'
                    : booking.user?.phone ? 'user.phone'
                    : 'none',
                });
                
                // base_price - основное поле согласно документации
                const basePrice = booking.base_price || booking.total_price || booking.price || 0;
                
                // guest_count - основное поле согласно документации
                const guestCount = booking.guest_count || booking.guests_count || booking.guests || 1;
                
                // Статус согласно документации: "active" | "canceled" | "pending"
                // Маппим на наш статус: "active" -> "confirmed", "canceled" -> "cancelled", "pending" -> "pending"
                let bookingStatus = "confirmed"; // По умолчанию
                if (booking.status === "active") {
                  bookingStatus = "confirmed";
                } else if (booking.status === "canceled") {
                  bookingStatus = "cancelled";
                } else if (booking.status === "pending") {
                  bookingStatus = "pending";
                }

                // Use upsert with onConflict on avito_booking_id to avoid duplicates
                const bookingData = {
                  property_id: integration.property_id,
                  avito_booking_id: bookingId.toString(), // Use avito_booking_id for unique constraint
                  guest_name: contactName,
                  guest_email: contactEmail,
                  guest_phone: contactPhone,
                  check_in: booking.check_in,
                  check_out: booking.check_out,
                  total_price: basePrice,
                  currency: booking.currency || "RUB",
                  status: bookingStatus,
                  source: "avito",
                  external_id: bookingId.toString(), // Keep for backward compatibility
                  guests_count: guestCount,
                  // TODO: Добавить поля для nights и safe_deposit когда они будут в схеме БД
                  // nights: booking.nights,
                  // safe_deposit_total: booking.safe_deposit?.total_amount,
                  // safe_deposit_owner: booking.safe_deposit?.owner_amount,
                  // safe_deposit_tax: booking.safe_deposit?.tax,
                };

                // Upsert booking using avito_booking_id as unique key
                // First check if booking exists
                const { data: existing } = await supabase
                  .from("bookings")
                  .select("id, guest_name, guest_phone, guest_email")
                  .eq("avito_booking_id", bookingId.toString())
                  .maybeSingle();

                let upsertError;

                if (existing) {
                  // Update existing booking
                  const { error: updateError } = await supabase
                    .from("bookings")
                    .update(bookingData)
                    .eq("id", existing.id);
                  upsertError = updateError;
                } else {
                  // Insert new booking
                  const { error: insertError } = await supabase
                    .from("bookings")
                    .insert(bookingData);
                  upsertError = insertError;
                }

                if (upsertError) {
                  console.error("Failed to upsert booking from Avito", {
                    booking,
                    error: upsertError,
                  });
                  errorCount++;
                } else {
                  // Check if this was an insert or update
                  if (existing) {
                    // Check if we updated guest data
                    const wasUpdate = existing.guest_name !== contactName 
                      || existing.guest_phone !== contactPhone 
                      || existing.guest_email !== contactEmail;
                    
                    if (wasUpdate) {
                      console.log("Updated booking from Avito", {
                        avito_booking_id: bookingId,
                        check_in: booking.check_in,
                        check_out: booking.check_out,
                        status: bookingStatus,
                        guest_name: contactName,
                        has_phone: !!contactPhone,
                        has_email: !!contactEmail,
                      });
                      createdCount++; // Count as created/updated
                    } else {
                      console.log("Booking already exists, skipped", {
                        avito_booking_id: bookingId,
                      });
                      skippedCount++;
                    }
                  } else {
                    console.log("Created booking from Avito", {
                      avito_booking_id: bookingId,
                      check_in: booking.check_in,
                      check_out: booking.check_out,
                      status: bookingStatus,
                      base_price: basePrice,
                      guest_count: guestCount,
                      guest_name: contactName,
                      has_phone: !!contactPhone,
                      has_email: !!contactEmail,
                    });
                    createdCount++;
                  }
                }
              } catch (error) {
                console.error("Error processing booking from Avito", {
                  booking,
                  error: error instanceof Error ? error.message : String(error),
                });
                errorCount++;
              }
            }
          } else {
            console.log("No bookings found in Avito response", {
              responseData,
              extractedBookings: avitoBookings,
            });
          }

          console.log("Bookings sync summary", {
            total: avitoBookings.length,
            created: createdCount,
            skipped: skippedCount,
            errors: errorCount,
          });

          // Log sync success to avito_logs
          await supabase.from("avito_logs").insert({
            integration_id: integration.id,
            property_id: integration.property_id,
            action: "sync_bookings",
            status: "success",
            details: {
              total: avitoBookings.length,
              created: createdCount,
              skipped: skippedCount,
              errors: errorCount,
            },
          });
        } else {
          const errorText = await bookingsResponse.text();
          let errorDetails: unknown = errorText;
          let errorCode: string | undefined;
          let errorMessage = `Failed to fetch bookings: ${bookingsResponse.status} ${bookingsResponse.statusText}`;

          try {
            const errorJson = JSON.parse(errorText);
            errorDetails = errorJson;
            errorMessage = errorJson.message || errorJson.error?.message || errorMessage;
            errorCode = errorJson.error?.code || errorJson.code;
          } catch {
            // Если не JSON, используем текст как есть
          }

          syncErrors.push({
            operation: 'bookings_fetch',
            statusCode: bookingsResponse.status,
            errorCode,
            message: errorMessage,
            details: errorDetails,
          });

          console.error("Failed to fetch bookings from Avito", {
            status: bookingsResponse.status,
            statusText: bookingsResponse.statusText,
            error: errorText,
          });

          // Log error to avito_logs
          await supabase.from("avito_logs").insert({
            integration_id: integration.id,
            property_id: integration.property_id,
            action: "sync_bookings",
            status: "error",
            error: errorMessage,
            details: {
              statusCode: bookingsResponse.status,
              errorCode,
              details: errorDetails,
            },
          });

          // Don't throw error - bookings pull is not critical for sync
          console.warn("Continuing sync despite bookings fetch failure");
        }

        // Update last_sync_at and ensure is_active is true
        await supabase
          .from("integrations")
          .update({ 
            last_sync_at: new Date().toISOString(),
            is_active: true 
          })
          .eq("id", integration_id);

        // Return structured response with errors if any
        return new Response(
          JSON.stringify({ 
            success: syncErrors.length === 0,
            synced: true,
            errors: syncErrors.length > 0 ? syncErrors : undefined,
          }),
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
    // Improved error handling
    let errorMessage: string;
    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object' && error !== null) {
      errorMessage = (error as { message?: string }).message || JSON.stringify(error);
    } else {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    
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

