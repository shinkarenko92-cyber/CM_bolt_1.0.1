/**
 * Avito Sync Edge Function
 * Handles OAuth token exchange, account fetching, item validation, and bidirectional sync
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const AVITO_API_BASE = "https://api.avito.ru";
const MIN_CLIENT_ID_LENGTH = 20;

function getAvitoBaseUrl(): string {
  const base = Deno.env.get("AVITO_BASE_URL")?.trim();
  if (base) {
    if (!base.includes("api.avito.ru")) {
      console.warn("[avito] AVITO_BASE_URL не содержит api.avito.ru. Ожидается https://api.avito.ru", { value: base });
    }
    return base.replace(/\/$/, "");
  }
  return AVITO_API_BASE;
}

function logAvitoRequest(method: string, url: string, secret?: string): void {
  const safeUrl = secret ? url.replace(secret, "***") : url;
  console.log("[avito] request", { method, url: safeUrl });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/** Кэш токенов в памяти инстанса: integration_id -> { access_token, expires_at }. Буфер 60s до истечения. */
const tokenCache = new Map<string, { access_token: string; expires_at: number }>();
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

function getCachedToken(integrationId: string): string | null {
  const entry = tokenCache.get(integrationId);
  if (!entry) return null;
  if (Date.now() >= entry.expires_at - TOKEN_EXPIRY_BUFFER_MS) {
    tokenCache.delete(integrationId);
    return null;
  }
  return entry.access_token;
}

function setCachedToken(integrationId: string, access_token: string, expiresInSeconds: number): void {
  tokenCache.set(integrationId, {
    access_token,
    expires_at: Date.now() + expiresInSeconds * 1000,
  });
}

// Helper function to refresh access token
async function refreshAccessToken(
  baseUrl: string,
  integration: { id: string; refresh_token_encrypted?: string | null },
  avitoClientId: string,
  avitoClientSecret: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }> {
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

      const url = `${baseUrl}/token`;
      logAvitoRequest("POST", url, avitoClientSecret);
      const refreshResponse = await fetch(url, {
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
          scope: refreshData.scope ?? undefined,
        };
      }
      const errorText = await refreshResponse.text();
      console.log("[avito] avito_401_reason refresh_failed", {
        integration_id: integration.id,
        status: refreshResponse.status,
        error_preview: errorText.substring(0, 200),
      });
      if (refreshResponse.status === 401) {
        console.log("[avito] Token refresh returned 401 — check AVITO_CLIENT_ID/AVITO_CLIENT_SECRET in Secrets or reconnect Avito OAuth");
      }
    } catch (error) {
      console.warn("Refresh token flow failed, falling back to client_credentials", error);
      console.log("[avito] avito_401_reason refresh_failed", { integration_id: integration.id, error: String(error) });
    }
  }

  // Fallback to client_credentials flow
  const url = `${baseUrl}/token`;
  logAvitoRequest("POST", url, avitoClientSecret);
  const refreshResponse = await fetch(url, {
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
    console.log("[avito] avito_401_reason refresh_failed", {
      flow: "client_credentials",
      status: refreshResponse.status,
      error_preview: errorText.substring(0, 200),
    });
    throw new Error(`Token refresh failed: ${refreshResponse.status} ${errorText}`);
  }

  const refreshData = await refreshResponse.json();
  return {
    access_token: refreshData.access_token,
    refresh_token: refreshData.refresh_token,
    expires_in: refreshData.expires_in || 3600,
    scope: refreshData.scope ?? undefined,
  };
}

// Helper function to fetch with retry on 429 (rate limiting)
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  secret?: string
): Promise<Response> {
  const method = options.method ?? "GET";
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    logAvitoRequest(method, url, secret);
    const response = await fetch(url, options);
    
    // If 429 or 5xx, retry with exponential backoff
    const shouldRetry = response.status === 429 || (response.status >= 500 && response.status < 600);
    if (shouldRetry && attempt < maxRetries - 1) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.pow(2, attempt) * 1000;
      console.log(`[avito] retry ${response.status} in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
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
      console.error("[avito] Server configuration error: AVITO_CLIENT_ID and/or AVITO_CLIENT_SECRET not set in Supabase Edge Function Secrets");
      return new Response(
        JSON.stringify({
          error: "AVITO_CLIENT_ID and AVITO_CLIENT_SECRET must be set in Supabase Secrets (Project Settings → Edge Functions → Secrets). Sync will not work until these are configured.",
          code: "MISSING_AVITO_SECRETS",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (avitoClientId.length < MIN_CLIENT_ID_LENGTH) {
      console.error("[avito] Server configuration error: AVITO_CLIENT_ID too short");
      return new Response(
        JSON.stringify({
          error: `AVITO_CLIENT_ID должен быть не короче ${MIN_CLIENT_ID_LENGTH} символов`,
          code: "INVALID_AVITO_CLIENT_ID",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const avitoBaseUrl = getAvitoBaseUrl();

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
      case "refresh-expired-tokens": {
        // Ручной запуск обновления токенов для всех активных интеграций с протухшим токеном
        const now = Date.now();
        const { data: allActive, error: listError } = await supabase
          .from("integrations")
          .select("id, property_id, refresh_token_encrypted, token_expires_at")
          .eq("platform", "avito")
          .eq("is_active", true);

        if (listError) {
          console.error("[avito] refresh-expired-tokens list error", listError);
          return new Response(
            JSON.stringify({ error: listError.message, refreshed: 0, failed: 0 }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const list = (allActive ?? []).filter((row) => {
          if (!row.token_expires_at) return true;
          const exp = new Date(row.token_expires_at).getTime();
          return exp <= now + 5 * 60 * 1000;
        });
        let refreshed = 0;
        const errors: Array<{ integration_id: string; error: string }> = [];

        for (const row of list) {
          if (!row.refresh_token_encrypted) {
            errors.push({ integration_id: row.id, error: "no_refresh_token" });
            continue;
          }
          try {
            const refreshData = await refreshAccessToken(
              avitoBaseUrl,
              { id: row.id, refresh_token_encrypted: row.refresh_token_encrypted },
              avitoClientId,
              avitoClientSecret,
              supabase
            );
            const expiresIn = refreshData.expires_in || 3600;
            const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
            const updateData: Record<string, unknown> = {
              access_token_encrypted: refreshData.access_token,
              token_expires_at: tokenExpiresAt.toISOString(),
            };
            if (refreshData.refresh_token) updateData.refresh_token_encrypted = refreshData.refresh_token;
            if (refreshData.scope != null) updateData.scope = refreshData.scope;

            const { error: updateError } = await supabase
              .from("integrations")
              .update(updateData)
              .eq("id", row.id);

            if (updateError) {
              errors.push({ integration_id: row.id, error: updateError.message });
              continue;
            }
            refreshed++;
            console.log("[avito] refresh-expired-tokens ok", { integration_id: row.id, new_expires_at: tokenExpiresAt.toISOString() });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push({ integration_id: row.id, error: msg });
            console.warn("[avito] refresh-expired-tokens fail", { integration_id: row.id, error: msg });
          }
        }

        return new Response(
          JSON.stringify({
            refreshed,
            failed: list.length - refreshed,
            total: list.length,
            errors: errors.length ? errors : undefined,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
        const tokenUrl = `${avitoBaseUrl}/token`;
        logAvitoRequest("POST", tokenUrl, avitoClientSecret);
        const response = await fetch(tokenUrl, {
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

        // Get user info to extract account_id (user.id)
        // This is required for Avito STR API to verify item_id ownership
        // According to Avito docs: GET /core/v1/user → user.id = account_id
        let accountId: string | null = null;
        try {
          const userUrl = `${avitoBaseUrl}/core/v1/user`;
          console.log("Fetching user info from Avito to get account_id", {
            tokenLength: tokenData.access_token.length,
            endpoint: userUrl,
          });
          logAvitoRequest("GET", userUrl);
          const userResponse = await fetch(userUrl, {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              "Content-Type": "application/json",
            },
          });

          if (userResponse.ok) {
            const userData = await userResponse.json();
            console.log("Avito user API response", {
              userDataKeys: Object.keys(userData),
              hasUser: !!userData.user,
              userDataStructure: JSON.stringify(userData).substring(0, 500), // First 500 chars for debugging
            });

            // Avito API returns user.id or id field
            // Try multiple possible paths: user.id, id, user_id
            accountId = userData.user?.id || userData.id || userData.user_id || null;
            
            if (accountId) {
              console.log("Successfully extracted account_id from Avito user API", {
                accountId,
                source: userData.user?.id ? 'user.id' : (userData.id ? 'id' : 'user_id'),
              });
            } else {
              console.error("Failed to extract account_id from user data", {
                userDataKeys: Object.keys(userData),
                userData: JSON.stringify(userData).substring(0, 1000),
              });
            }
          } else {
            const errorText = await userResponse.text().catch(() => 'Unable to read error');
            console.error("Failed to get user info from Avito API", {
              status: userResponse.status,
              statusText: userResponse.statusText,
              errorText: errorText.substring(0, 500),
            });
            // This is critical - we need account_id for Avito STR API
            // Throw error to prevent saving integration without account_id
            throw new Error(`Не удалось получить данные аккаунта Avito (${userResponse.status}): ${errorText.substring(0, 200)}`);
          }
        } catch (userError) {
          const errorMessage = userError instanceof Error ? userError.message : String(userError);
          console.error("Critical error fetching user info from Avito", {
            error: errorMessage,
            errorType: userError instanceof Error ? userError.constructor.name : typeof userError,
          });
          // Fail token exchange if we can't get account_id - it's required for Avito STR API
          return new Response(
            JSON.stringify({ 
              error: errorMessage || "Не удалось получить ID аккаунта Avito. Попробуйте подключить заново.",
              details: "account_id is required for Avito STR API to verify item_id ownership"
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate that we got account_id
        if (!accountId) {
          console.error("account_id is null or empty after fetching user info");
          return new Response(
            JSON.stringify({ 
              error: "Не удалось получить ID аккаунта Avito из ответа API. Попробуйте подключить заново.",
              details: "Avito API did not return user.id or id field"
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            access_token: tokenData.access_token,
            token_type: tokenData.token_type,
            expires_in: tokenData.expires_in,
            refresh_token: tokenData.refresh_token || null,
            scope: tokenData.scope ?? null,
            account_id: accountId,
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
          `${avitoBaseUrl}/core/v1/accounts/self`,
          `${avitoBaseUrl}/v1/user`,
          `${avitoBaseUrl}/user`,
        ];

        let lastResponse: Response | null = null;
        let lastErrorMessage: string | null = null;

        for (const endpoint of endpoints) {
          try {
            console.log(`Trying endpoint: ${endpoint}`);
            logAvitoRequest("GET", endpoint);
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
        const { integration_id, item_id, property_id } = params;

        // Валидация параметров
        if (!integration_id || !item_id) {
          console.error("Missing required parameters for validate-item", {
            has_integration_id: !!integration_id,
            has_item_id: !!item_id,
          });
          return new Response(
            JSON.stringify({ available: false, error: "Отсутствуют обязательные параметры" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Load integration to get access token
        const { data: integration, error: intError } = await supabase
          .from("integrations")
          .select("id, access_token_encrypted")
          .eq("id", integration_id)
          .eq("is_active", true)
          .single();

        if (intError || !integration || !integration.access_token_encrypted) {
          return new Response(
            JSON.stringify({ available: false, error: "Интеграция не найдена или неактивна" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Decrypt token (simplified - in production use Vault)
        const accessToken = integration.access_token_encrypted;

        console.log("Validating item:", {
          integration_id,
          item_id,
          token_length: accessToken.length,
        });

        // Use STR API endpoint: GET /realty/v1/{user_id}/items/{item_id}/bookings
        // Requires date_start and date_end query parameters
        // Need user_id from integration
        const integrationForValidation = await supabase
          .from("integrations")
          .select("avito_user_id, avito_account_id")
          .eq("id", integration_id)
          .single();
        
        const userIdForValidation = integrationForValidation.data?.avito_user_id || integrationForValidation.data?.avito_account_id;
        
        if (!userIdForValidation) {
          throw new Error("user_id not found in integration for bookings validation");
        }
        
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const dateStart = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const dateEnd = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

        console.log("Using realty/v1/accounts/{user_id}/items endpoint with required date parameters", {
          user_id: userIdForValidation,
          date_start: dateStart,
          date_end: dateEnd,
        });

        // Use STR API endpoint with user_id
        const bookingsCheckUrl = `${avitoBaseUrl}/realty/v1/accounts/${userIdForValidation}/items/${item_id}/bookings?date_start=${dateStart}&date_end=${dateEnd}&skip_error=true`;
        logAvitoRequest("GET", bookingsCheckUrl);
        const response = await fetch(bookingsCheckUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
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

      case "get-oauth-info": {
        const { integration_id: oauthInfoIntegrationId } = params as { integration_id?: string };
        if (!oauthInfoIntegrationId) {
          return new Response(
            JSON.stringify({ error: "Missing integration_id" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { data: oauthIntegration, error: oauthIntErr } = await supabase
          .from("integrations")
          .select("id, property_id, access_token_encrypted")
          .eq("id", oauthInfoIntegrationId)
          .eq("platform", "avito")
          .eq("is_active", true)
          .maybeSingle();
        if (oauthIntErr || !oauthIntegration) {
          return new Response(
            JSON.stringify({ skipped: true, reason: "integration_not_found" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        let accessToken = oauthIntegration.access_token_encrypted;
        if (!accessToken || typeof accessToken !== "string") {
          return new Response(
            JSON.stringify({ skipped: true, reason: "no_token" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        try {
          const { data: decrypted } = await supabase.rpc("decrypt_avito_token", {
            encrypted_token: accessToken,
          });
          if (decrypted) accessToken = decrypted;
        } catch {
          // use as-is if decrypt not available
        }
        // Отключено: /web/1/oauth/info часто возвращает 400 на api.avito.ru; scope проверяется по integrations.scope из OAuth callback.
        return new Response(
          JSON.stringify({ skipped: true, reason: "oauth_info_disabled" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "save-integration": {
        const {
          property_id,
          avito_account_id,
          avito_item_id,
          avito_markup,
          access_token,
          refresh_token,
          expires_in,
          scope: scopeParam,
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

        // Валидация item_id: должен быть строкой из 10-11 цифр
        const itemIdString = String(avito_item_id).trim();
        if (!/^[0-9]{10,11}$/.test(itemIdString)) {
          console.error("Invalid avito_item_id format", { 
            avito_item_id, 
            itemIdString,
            length: itemIdString.length,
            type: typeof avito_item_id 
          });
          return new Response(
            JSON.stringify({ error: "ID объявления должен содержать 10-11 цифр" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Валидация типов (для обратной совместимости)
        const parsedItemId = parseInt(itemIdString, 10);
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
        const upsertData: {
          property_id: string;
          platform: string;
          external_id: string;
          avito_account_id: string;
          avito_item_id: string;
          avito_markup: number;
          access_token_encrypted: string;
          refresh_token_encrypted?: string;
          token_expires_at: string;
          scope?: string | null;
          is_active: boolean;
          is_enabled: boolean;
          markup_type: string;
          markup_value: number;
        } = {
            property_id,
            platform: "avito",
          external_id: itemIdString,
            avito_account_id,
          avito_item_id: itemIdString, // Store as TEXT for API calls
            avito_markup: avito_markup !== null && avito_markup !== undefined ? parseFloat(avito_markup) : 0,
            // Token will be encrypted by Vault trigger (create trigger in migration)
            access_token_encrypted: access_token,
            token_expires_at: tokenExpiresAt.toISOString(),
            is_active: true,
            is_enabled: true,
            markup_type: "percent",
            markup_value: avito_markup !== null && avito_markup !== undefined ? parseFloat(avito_markup) : 0,
        };

        if (refresh_token) {
          upsertData.refresh_token_encrypted = refresh_token;
        }
        if (scopeParam != null && scopeParam !== "") {
          upsertData.scope = scopeParam;
        }

        const { data: integration, error } = await supabase
          .from("integrations")
          .upsert(upsertData, {
            onConflict: 'property_id,platform' // Указываем поля для разрешения конфликта
          })
          .select('id, property_id, platform, avito_item_id, avito_markup, is_active, token_expires_at, last_sync_at')
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
        try {
        const { integration_id, exclude_booking_id, booking_limit, booking_offset } = params as {
          integration_id: string;
          exclude_booking_id?: string;
          booking_limit?: number;
          booking_offset?: number;
        };

          console.log("Sync started", {
            integration_id,
            exclude_booking_id: exclude_booking_id || null,
            action: params.action || 'sync',
          });

        // Get integration with decrypted token
        const { data: integration, error: intError } = await supabase
          .from("integrations")
            .select("id, property_id, platform, avito_user_id, avito_account_id, avito_item_id, avito_markup, access_token_encrypted, refresh_token_encrypted, token_expires_at, is_active, last_sync_at, sync_interval_seconds")
          .eq("id", integration_id)
          .eq("is_active", true)
          .single();

        if (intError || !integration) {
            console.error("Integration not found or inactive", {
              integration_id,
              error: intError,
              has_integration: !!integration,
            });
            return new Response(
              JSON.stringify({ 
                success: false,
                error: "Integration not found or inactive" 
              }),
              { 
                status: 404, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              }
            );
          }

          // Log integration data (without exposing token value)
          console.log("Integration loaded", {
            integration_id: integration.id,
            property_id: integration.property_id,
            hasAccessToken: !!integration.access_token_encrypted,
            accessTokenLength: integration.access_token_encrypted?.length || 0,
            accessTokenType: typeof integration.access_token_encrypted,
            hasRefreshToken: !!integration.refresh_token_encrypted,
            refreshTokenLength: integration.refresh_token_encrypted?.length || 0,
            tokenExpiresAt: integration.token_expires_at,
            isActive: integration.is_active,
          });

          // GUARD: Check if user_id and item_id are set (required for all STR API operations)
          const userIdRaw = integration?.avito_user_id || integration?.avito_account_id;
          const userId = userIdRaw != null ? String(userIdRaw).trim() : null;
          
          const itemIdRaw = integration?.avito_item_id;
          const itemId = itemIdRaw != null ? String(itemIdRaw).trim() : null;

          // Log account_id and item_id before requests for debugging
          console.log("Sync with account_id:", userId, "item_id:", itemId, {
            integration_id: integration.id,
            avito_user_id: integration.avito_user_id,
            avito_account_id: integration.avito_account_id,
            avito_item_id: integration.avito_item_id,
            user_id_raw: userIdRaw,
            item_id_raw: itemIdRaw,
            user_id_type: typeof userIdRaw,
            item_id_type: typeof itemIdRaw,
            user_id_length: userId?.length,
            item_id_length: itemId?.length,
          });

          // Guard: Check if account_id (avito_user_id) is set
          if (!userId || !/^[0-9]{6,8}$/.test(userId)) {
            console.error("CRITICAL: account_id (avito_user_id) is missing or invalid", {
              integration_id: integration.id,
              avito_user_id: integration.avito_user_id,
              avito_account_id: integration.avito_account_id,
              extracted_userId: userId,
              userIdLength: userId?.length,
            });
            return new Response(
              JSON.stringify({ 
                success: false,
                hasError: true,
                errorMessage: "Введи номер аккаунта (4720770)",
                errors: [{
                  operation: 'validation',
                  statusCode: 400,
                  message: "Введи номер аккаунта (4720770)"
                }]
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              }
            );
          }

          // Guard: Validate item_id format (10-12 digits)
          if (!itemId || !itemId.toString().match(/^\d{10,12}$/)) {
            console.error("CRITICAL: item_id format is invalid", {
              integration_id: integration.id,
              avito_item_id: integration.avito_item_id,
              extracted_itemId: itemId,
              itemIdType: typeof itemId,
              itemIdLength: itemId?.length,
              itemIdMatch: itemId ? itemId.toString().match(/^\d{10,12}$/) : null,
            });
            return new Response(
              JSON.stringify({ 
                success: false,
                hasError: true,
                errorMessage: "Неверный формат ID объявления. Должен быть длинный номер из URL Avito (10-12 цифр)",
                errors: [{
                  operation: 'validation',
                  statusCode: 400,
                  message: "Неверный формат ID объявления. Должен быть длинный номер из URL Avito (10-12 цифр)"
                }]
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              }
            );
          }

          console.log("Sync operation validated", {
            integration_id: integration.id,
            property_id: integration.property_id,
            user_id: userId,
            item_id: itemId,
            has_token: !!integration.access_token_encrypted,
          });

        // Helper function to get and refresh token if needed
        const getAccessToken = async (): Promise<string | null> => {
          const cached = getCachedToken(integration_id);
          if (cached) return cached;

          // Check if token exists
          if (!integration.access_token_encrypted) {
            console.log("No token - reconnect Avito", {
              integration_id: integration.id,
              property_id: integration.property_id,
              hasAccessToken: !!integration.access_token_encrypted,
              hasRefreshToken: !!integration.refresh_token_encrypted,
              tokenExpiresAt: integration.token_expires_at,
            });
            
            // Try to reload integration from database
            console.log("Attempting to reload integration from database");
            const { data: reloadedIntegration, error: reloadError } = await supabase
              .from("integrations")
              .select("id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
              .eq("id", integration.id)
              .single();
            
            if (reloadError) {
              console.error("Failed to reload integration", {
                error: reloadError,
                integration_id: integration.id,
              });
              return null;
            } else {
              console.log("Reloaded integration", {
                integration_id: reloadedIntegration?.id,
                hasAccessToken: !!reloadedIntegration?.access_token_encrypted,
                accessTokenLength: reloadedIntegration?.access_token_encrypted?.length || 0,
              });
              
              // Update local integration object
              if (reloadedIntegration) {
                integration.access_token_encrypted = reloadedIntegration.access_token_encrypted;
                integration.refresh_token_encrypted = reloadedIntegration.refresh_token_encrypted;
                integration.token_expires_at = reloadedIntegration.token_expires_at;
                
                // If token is still not available, return null
                if (!integration.access_token_encrypted) {
                  console.log("No token - reconnect Avito (after reload)");
                  return null;
                }
              } else {
                console.log("No token - reconnect Avito (integration not found)");
                return null;
              }
            }
            
            if (!integration.access_token_encrypted) {
              console.log("No token - reconnect Avito (final check)");
              return null;
            }
          }

          let accessToken = integration.access_token_encrypted;
          
          const now = Date.now();
          const fiveMinMs = 5 * 60 * 1000;
          let shouldRefresh = false;
          if (integration.token_expires_at) {
            let expiresAtString = integration.token_expires_at;
            if (!expiresAtString.endsWith('Z') && !expiresAtString.includes('+') && !expiresAtString.includes('-', 10)) {
              expiresAtString = expiresAtString + 'Z';
            }
            const expiresAt = new Date(expiresAtString).getTime();
            // Refresh if expired or expires within 5 minutes
            if (expiresAt <= now + fiveMinMs) shouldRefresh = true;
          } else if (integration.refresh_token_encrypted) {
            // token_expires_at missing but we have refresh_token — treat as expired and refresh
            shouldRefresh = true;
          }

          if (shouldRefresh) {
              console.log("Token expired or expiring soon, refreshing...", {
                integration_id: integration.id,
                hasRefreshToken: !!integration.refresh_token_encrypted,
                token_expires_at: integration.token_expires_at ?? null,
              });

              // Check if refresh token is available
              if (!integration.refresh_token_encrypted) {
                console.log("No token - reconnect Avito (token expired, no refresh token)", {
                  integration_id: integration.id,
                  property_id: integration.property_id,
                });
                return null;
              }

              try {
                const refreshData = await refreshAccessToken(
                  avitoBaseUrl,
                  integration,
                  avitoClientId,
                  avitoClientSecret,
                  supabase
                );
                
                accessToken = refreshData.access_token;
                setCachedToken(integration_id, refreshData.access_token, refreshData.expires_in || 3600);

                // Update token in database (plain text for testing, vault encryption later)
                const expiresIn = refreshData.expires_in || 3600;
                const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

                const updateData: {
                  access_token_encrypted: string;
                  token_expires_at: string;
                  refresh_token_encrypted?: string;
                  scope?: string | null;
                } = {
                  access_token_encrypted: accessToken,
                  token_expires_at: tokenExpiresAt.toISOString(),
                };
                if (refreshData.refresh_token) {
                  updateData.refresh_token_encrypted = refreshData.refresh_token;
                }
                if (refreshData.scope != null) {
                  updateData.scope = refreshData.scope;
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
                  throw new Error(`Failed to update token: ${updateError.message}`);
                } else {
                  console.log("Token refreshed and updated in database", {
                    integration_id: integration.id,
                    newExpiresAt: tokenExpiresAt.toISOString(),
                  });
                  
                  // Update local integration object for subsequent calls
                  integration.access_token_encrypted = accessToken;
                  integration.token_expires_at = tokenExpiresAt.toISOString();
                  if (refreshData.refresh_token) {
                    integration.refresh_token_encrypted = refreshData.refresh_token;
                  }
                  
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
                  stack: error instanceof Error ? error.stack : undefined,
                });
                
                // Log refresh failure
                await supabase.from("avito_logs").insert({
                  integration_id: integration.id,
                  property_id: integration.property_id,
                  action: "refresh_token",
                  status: "error",
                  error: error instanceof Error ? error.message : String(error),
                });
                
                console.log("No token - reconnect Avito (refresh failed)", {
                  error: error instanceof Error ? error.message : String(error),
                  integration_id: integration.id,
                });
                return null;
              }
          }

          if (!accessToken) {
            console.log("No token - reconnect Avito (no token after refresh check)", {
              integration_id: integration.id,
              property_id: integration.property_id,
            });
            return null;
          }

          // Try to decrypt token if encrypted
          try {
            const { data: decrypted } = await supabase.rpc('decrypt_avito_token', {
              encrypted_token: accessToken,
            });
            if (decrypted) accessToken = decrypted;
          } catch (error) {
            // If RPC fails, assume token is not encrypted yet
            console.warn("RPC decrypt_avito_token failed, using token as-is", {
              error: error instanceof Error ? error.message : String(error),
            });
          }

          if (integration.token_expires_at) {
            const expiresAt = new Date(integration.token_expires_at).getTime();
            const ttlSec = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000));
            setCachedToken(integration_id, accessToken, ttlSec);
          }
          return accessToken;
        };

        // Get access token (will refresh if needed)
        const accessToken = await getAccessToken();

        // If no token available, return error response for frontend
        if (!accessToken) {
          console.log("[avito] avito_401_reason refresh_failed", {
            integration_id: integration.id,
            property_id: integration.property_id,
            message: "No access token after refresh attempt — user must reconnect Avito",
          });
          console.log("Sync aborted: No access token available", {
            integration_id: integration.id,
            property_id: integration.property_id,
          });
          return new Response(
            JSON.stringify({
              success: false,
              error: "Переподключи Avito для синхронизации",
              errorCode: "NO_ACCESS_TOKEN",
              requiresReconnect: true,
            }),
            { 
              status: 401, 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            }
          );
        }

        // Get property and bookings
        const { data: property } = await supabase
          .from("properties")
          .select("*")
          .eq("id", integration.property_id)
          .single();

        // Only confirmed bookings close dates in Avito (we create as confirmed)
        const { data: bookings } = await supabase
          .from("bookings")
          .select("*")
          .eq("property_id", integration.property_id)
          .eq("status", "confirmed");

        // Calculate prices with markup
        // Negative values = rub, positive = %
        const basePrice = property?.base_price || 0;
        const markup = integration.avito_markup ?? 0;
        const priceWithMarkup = Math.max(1, markup < 0 
          ? Math.round(basePrice + Math.abs(markup))  // Fixed rub markup
          : Math.round(basePrice * (1 + markup / 100)));  // Avito: night_price must be > 0

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

        // itemId already validated at the beginning of sync action
        console.log("Using validated item_id for sync", {
          integration_id: integration.id,
          item_id: itemId,
        });

        // Sync property_rates (calendar prices) and availability to Avito
        // According to Avito STR API docs: all endpoints require user_id in path
        // Endpoints:
        // 1. POST /realty/v1/accounts/{user_id}/items/{item_id}/prices — цены по периодам
        // 2. POST /realty/v1/items/{item_id}/base — базовые параметры (night_price, minimal_duration)
        // 3. POST /core/v1/accounts/{user_id}/items/{item_id}/bookings — календарь занятости
        // 4. GET /realty/v1/accounts/{user_id}/items/{item_id}/bookings — получение броней с Avito
        console.log("Syncing property_rates to Avito", {
          property_id: integration.property_id,
          itemId,
          markup,
          basePrice,
          priceWithMarkup,
        });

        // Массив для сбора критичных ошибок (влияют на success)
        const syncErrors: Array<{
          operation: string;
          statusCode?: number;
          errorCode?: string;
          message: string;
          details?: unknown;
        }> = [];
        // Некритичные предупреждения (404 на base — календарь и цены при этом могут быть OK)
        const syncWarnings: Array<{
          operation: string;
          statusCode?: number;
          message: string;
          details?: unknown;
        }> = [];

        // Track success of push operations (prices/intervals)
        let pricesPushSuccess = false;
        let intervalsPushSuccess = false;

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
            const priceWithMarkup = Math.max(1, Math.round(rate.daily_price * (1 + markup / 100)));  // Avito: night_price must be > 0
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
            night_price: Math.max(1, priceWithMarkup),  // Avito: night_price must be > 0
            minimal_duration: property?.minimum_booking_days || 1,
            // TODO: Добавить extra_guest_fee когда поле будет доступно в property
            // extra_guest_fee: property?.extra_guest_fee,
          });
        }

        // Отправляем обновление цен
        if (pricesToUpdate.length > 0) {
          console.log("Sending price update to Avito", {
            endpoint: `${avitoBaseUrl}/realty/v1/accounts/${userId}/items/${itemId}/prices`,
            periodsCount: pricesToUpdate.length,
          });

          // Use correct endpoint: /realty/v1/accounts/{user_id}/items/{item_id}/prices
          try {
            console.log("POST /realty/v1/accounts/{user_id}/items/{item_id}/prices - starting", { 
              user_id: userId, 
              item_id: itemId,
              user_id_type: typeof userId,
              item_id_type: typeof itemId,
              user_id_length: userId?.length,
              item_id_length: itemId?.length,
            });
            let pricesResponse = await fetchWithRetry(
              `${avitoBaseUrl}/realty/v1/accounts/${userId}/items/${itemId}/prices?skip_error=true`,
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

            // Handle 401 and retry with refreshed token
            if (pricesResponse.status === 401) {
              console.log("[avito] avito_401_reason token_expired", { integration_id, endpoint: "prices" });
              console.log("401 Unauthorized, refreshing token and retrying prices update");
              const refreshedToken = await getAccessToken();
              pricesResponse = await fetchWithRetry(
                `${avitoBaseUrl}/realty/v1/accounts/${userId}/items/${itemId}/prices?skip_error=true`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${refreshedToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    prices: pricesToUpdate,
                  }),
                }
              );
            }

          if (!pricesResponse.ok) {
            // Handle 404 - item not found
            if (pricesResponse.status === 404) {
              const errorMessage = "Объявление не найдено в Avito. Проверь ID объявления — должен быть длинный номер вроде 2336174775";
              syncErrors.push({
                operation: 'price_update',
                statusCode: 404,
                message: errorMessage,
                details: { item_id: itemId },
              });
                console.error("Avito item not found (404)", { item_id: itemId, response_status: pricesResponse.status });
            } else {
                const errorText = await pricesResponse.text().catch(() => 'Failed to read error response');
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
                  itemId: itemId,
              });
              // Не бросаем ошибку, продолжаем синхронизацию
              console.warn("Price update failed, but continuing with bookings sync");
            }
          } else {
            const responseData = await pricesResponse.json().catch(() => null);
            console.log("Avito prices updated successfully", {
              periodsCount: pricesToUpdate.length,
                itemId: itemId,
              response: responseData,
            });
              pricesPushSuccess = true;
            }
          } catch (fetchError) {
              // Network error or other fetch failure
              const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
              console.error("Network error updating Avito prices", {
                error: errorMessage,
                itemId: itemId,
              });
              syncErrors.push({
                operation: 'price_update',
                message: `Network error: ${errorMessage}`,
                details: { item_id: itemId },
              });
              // Continue with other operations
          }
        } else {
          console.log("No prices to update (pricesToUpdate is empty)", {
            hasPropertyRates: !!propertyRates,
            propertyRatesCount: propertyRates?.length || 0,
            basePrice: property?.base_price,
            priceWithMarkup,
          });
        }

        // 2. Базовые параметры: POST /realty/v1/items/{item_id}/base (Avito STR spec, без user_id в пути)
        const baseParamsUrl = `${avitoBaseUrl}/realty/v1/items/${itemId}/base`;
        const baseParamsBody = {
          night_price: Math.max(1, priceWithMarkup),  // Avito: night_price must be > 0
          minimal_duration: property?.minimum_booking_days || 1,
        };
        console.log("Updating base parameters in Avito", {
          endpoint: baseParamsUrl,
          itemId: itemId,
          night_price: priceWithMarkup,
          minimal_duration: baseParamsBody.minimal_duration,
        });

          try {
            let baseParamsResponse = await fetchWithRetry(baseParamsUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(baseParamsBody),
            });

            if (baseParamsResponse.status === 401) {
              console.log("[avito] avito_401_reason token_expired", { integration_id, endpoint: "base_params" });
              console.log("401 Unauthorized, refreshing token and retrying base params update");
              const refreshedToken = await getAccessToken();
              baseParamsResponse = await fetchWithRetry(baseParamsUrl, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${refreshedToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(baseParamsBody),
              });
            }

        if (!baseParamsResponse.ok) {
          // 404 на base — не критично: календарь и цены могут быть успешны, пишем в warnings
          if (baseParamsResponse.status === 404) {
            syncWarnings.push({
              operation: 'base_params_update',
              statusCode: 404,
              message: "Календарь и цены обновлены. Базовые параметры объявления не найдены (404) — проверь item_id.",
              details: { item_id: itemId },
            });
            console.warn("Avito base params 404 (non-blocking)", { item_id: itemId });
          } else {
                const errorText = await baseParamsResponse.text().catch(() => 'Failed to read error response');
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
                  itemId: itemId,
            });
            // Не бросаем ошибку, продолжаем синхронизацию
            console.warn("Base parameters update failed, but continuing with bookings sync");
          }
        } else {
            const responseData = await baseParamsResponse.json().catch(() => null);
            console.log("Avito base parameters updated successfully", {
                itemId: itemId,
              response: responseData,
            });
            }
          } catch (fetchError) {
            // Network error or other fetch failure
            const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
            console.error("Network error updating Avito base parameters", {
              error: errorMessage,
              itemId: itemId,
            });
            syncErrors.push({
              operation: 'base_params_update',
              message: `Network error: ${errorMessage}`,
              details: { item_id: itemId },
            });
            // Continue with other operations
          }

        // 3. Заполнение календаря занятости: POST /core/v1/accounts/{user_id}/items/{item_id}/bookings (Avito STR spec)
        // Тело: PostCalendarData — bookings[] с date_start, date_end, type ("manual" | "booking"), source
        const bookingsPayload: Array<{ date_start: string; date_end: string; type?: "manual" | "booking" }> = [];
        for (const booking of bookingsForAvito) {
          const dateStart = booking.check_in.split("T")[0];
          const dateEnd = booking.check_out.split("T")[0];
          bookingsPayload.push({
            date_start: dateStart,
            date_end: dateEnd,
            type: "booking",
          });
        }
        const calendarUrl = `${avitoBaseUrl}/core/v1/accounts/${userId}/items/${itemId}/bookings`;
        const calendarBody = { bookings: bookingsPayload, source: "roomi" };

        if (bookingsPayload.length > 0) {
          console.log("Sending calendar (bookings) to Avito", {
            endpoint: calendarUrl,
            bookingsCount: bookingsPayload.length,
            exclude_booking_id: exclude_booking_id || null,
          });

          try {
            let bookingsUpdateResponse = await fetchWithRetry(calendarUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(calendarBody),
            });

            if (bookingsUpdateResponse.status === 401) {
              console.log("[avito] avito_401_reason token_expired", { integration_id, endpoint: "calendar" });
              console.log("401 Unauthorized, refreshing token and retrying calendar update");
              const refreshedToken = await getAccessToken();
              bookingsUpdateResponse = await fetchWithRetry(calendarUrl, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${refreshedToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(calendarBody),
              });
            }

          if (!bookingsUpdateResponse.ok) {
              const errorText = await bookingsUpdateResponse.text().catch(() => 'Failed to read error response');
            const errorStatus = bookingsUpdateResponse.status;
            
            // 404 - возвращаем как ошибку с телом ответа Avito
            if (errorStatus === 404) {
              let errMsg = "Даты в Avito не обновились (404).";
              try {
                const errJson = JSON.parse(errorText || "{}");
                const apiMsg = errJson?.message ?? errJson?.error ?? errJson?.error_description;
                if (apiMsg) errMsg += ` ${typeof apiMsg === "string" ? apiMsg : JSON.stringify(apiMsg)}`;
              } catch {
                if (errorText) errMsg += ` Ответ: ${errorText.substring(0, 200)}`;
              }
              syncErrors.push({
                operation: "bookings_update",
                statusCode: 404,
                message: errMsg,
                details: { item_id: itemId, response_body: errorText?.substring?.(0, 500) },
              });
              intervalsPushSuccess = false;
            }
            // Специальная обработка ошибки 409 (конфликт с оплаченными бронями)
            else if (errorStatus === 409) {
              const errorMessage = exclude_booking_id
                ? "Конфликт с оплаченной бронью в Avito — проверь вручную"
                : "Some bookings conflict with paid bookings in Avito (409)";
              
              console.warn(errorMessage, {
                error: errorText,
                bookingsCount: bookingsPayload.length,
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
                : "Avito calendar (bookings) updated successfully";
              
              console.log(logMessage, {
                bookingsCount: bookingsPayload.length,
                excluded_booking_id: exclude_booking_id || null,
                response: responseData,
              });
              intervalsPushSuccess = true;

              // Log success to avito_logs
              try {
              await supabase.from("avito_logs").insert({
                integration_id: integration.id,
                property_id: integration.property_id,
                action: exclude_booking_id ? "open_dates_after_delete" : "sync_calendar_bookings",
                status: "success",
                details: {
                  bookings_count: bookingsPayload.length,
                  excluded_booking_id: exclude_booking_id || null,
                },
              });
              } catch (logError) {
                console.error("Failed to log success", { error: logError });
              }
            } catch {
              console.log("Avito calendar (bookings) updated successfully", {
                bookingsCount: bookingsPayload.length,
                status: bookingsUpdateResponse.status,
                excluded_booking_id: exclude_booking_id || null,
              });
            }
          }
        } catch (fetchError) {
          const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
          console.error("Network error updating Avito calendar (bookings)", {
            error: errorMessage,
            itemId: itemId,
          });
          syncErrors.push({
            operation: 'bookings_update',
            message: `Network error: ${errorMessage}`,
            details: { item_id: itemId },
          });
          // Continue with other operations
          }
        } else {
          // No bookings to block — send empty bookings to open all dates (POST /core/v1/.../bookings)
          if (exclude_booking_id) {
            console.log("No bookings left after deletion, opening all dates in Avito", {
              excluded_booking_id: exclude_booking_id,
            });

            try {
              const openAllUrl = `${avitoBaseUrl}/core/v1/accounts/${userId}/items/${itemId}/bookings`;
              const openAllResponse = await fetchWithRetry(openAllUrl, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ bookings: [], source: "roomi" }),
              });

            if (openAllResponse.ok) {
                console.log("All dates opened in Avito after manual booking deletion", {
                  itemId: itemId,
                });
                intervalsPushSuccess = true;
              // Log success to avito_logs
                try {
              await supabase.from("avito_logs").insert({
                integration_id: integration.id,
                property_id: integration.property_id,
                action: "open_all_dates_after_delete",
                status: "success",
                details: {
                  excluded_booking_id: exclude_booking_id,
                },
              });
                } catch (logError) {
                  console.error("Failed to log success", { error: logError });
                }
            } else {
                const errorText = await openAllResponse.text().catch(() => 'Failed to read error response');
              console.error("Failed to open all dates in Avito", {
                status: openAllResponse.status,
                error: errorText,
                  itemId: itemId,
                });
                syncErrors.push({
                  operation: 'open_all_dates',
                  statusCode: openAllResponse.status,
                  message: `Failed to open all dates: ${openAllResponse.status} ${openAllResponse.statusText}`,
                  details: { item_id: itemId },
                });
              }
            } catch (fetchError) {
              // Network error or other fetch failure
              const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
              console.error("Network error opening all dates in Avito", {
                error: errorMessage,
                itemId: itemId,
              });
              syncErrors.push({
                operation: 'open_all_dates',
                message: `Network error: ${errorMessage}`,
                details: { item_id: itemId },
              });
            }
          } else {
            console.log("No bookings to send to Avito (no blocked dates)", {
              bookingsForAvitoCount: bookingsForAvito.length,
              today: new Date().toISOString().split('T')[0],
            });
            // No intervals to push = nothing to fail
            intervalsPushSuccess = true;
          }
        }

        // Pull bookings from Avito
        // Use STR API endpoint: GET /realty/v1/{user_id}/items/{item_id}/bookings
        // With required parameters date_start and date_end (range: 1 year ahead)
        // Parameter with_unpaid=true allows getting unpaid bookings (status: pending)
        const today = new Date();
        const oneYearLater = new Date(today);
        oneYearLater.setFullYear(today.getFullYear() + 1);
        
        const dateStart = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const dateEnd = oneYearLater.toISOString().split('T')[0]; // YYYY-MM-DD

          console.log("Pulling bookings from Avito", {
          itemId,
          property_id: integration.property_id,
          date_start: dateStart,
          date_end: dateEnd,
          with_unpaid: true, // Get unpaid bookings (status: pending)
          skip_error: true, // Get 200 status instead of errors for item issues
          endpoint: `/realty/v1/accounts/${userId}/items/${itemId}/bookings`,
        });

        console.log("GET /realty/v1/accounts/{user_id}/items/{item_id}/bookings - starting", { 
          user_id: userId, 
          item_id: itemId,
          user_id_type: typeof userId,
          item_id_type: typeof itemId,
          user_id_length: userId?.length,
          item_id_length: itemId?.length,
        });

        // Пагинация: limit/offset для запроса бронирований (передаются из avito-poller)
        const limit = typeof booking_limit === "number" && booking_limit > 0 ? Math.min(booking_limit, 500) : undefined;
        const offset = typeof booking_offset === "number" && booking_offset >= 0 ? booking_offset : undefined;
        const bookingsQuery = new URLSearchParams({
          date_start: dateStart,
          date_end: dateEnd,
          with_unpaid: "true",
          skip_error: "true",
          ...(limit != null && { limit: String(limit) }),
          ...(offset != null && { offset: String(offset) }),
        });

        // Helper function to fetch bookings with 401 retry and error handling
        // Use STR API endpoint with user_id: /realty/v1/accounts/{user_id}/items/{item_id}/bookings
        const bookingsUrl = `${avitoBaseUrl}/realty/v1/accounts/${userId}/items/${itemId}/bookings?${bookingsQuery}`;
        const fetchBookings = async (token: string): Promise<Response> => {
          try {
          const response = await fetchWithRetry(
              bookingsUrl,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          // If 401, refresh token and retry once
          if (response.status === 401) {
              console.log("[avito] avito_401_reason token_expired", { integration_id, endpoint: "bookings" });
              console.log("Got 401, refreshing token and retrying...", {
                item_id: itemId,
                integration_id: integration.id,
              });
              
              try {
            const refreshData = await refreshAccessToken(
              avitoBaseUrl,
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
              scope?: string | null;
            } = {
              access_token_encrypted: refreshData.access_token,
              token_expires_at: tokenExpiresAt.toISOString(),
            };
            if (refreshData.refresh_token) {
              updateData.refresh_token_encrypted = refreshData.refresh_token;
            }
            if (refreshData.scope != null) {
              updateData.scope = refreshData.scope;
            }
                
                const { error: updateError } = await supabase
                  .from("integrations")
                  .update(updateData)
                  .eq("id", integration_id);
                
                if (updateError) {
                  console.error("Failed to update token in database after refresh", {
                    error: updateError,
                    integration_id: integration.id,
                  });
                } else {
                  console.log("Token refreshed and updated in database", {
                    integration_id: integration.id,
                    newExpiresAt: tokenExpiresAt.toISOString(),
                  });
                }
            
            // Retry with new token
            return await fetchWithRetry(
                  bookingsUrl,
              {
                headers: {
                  Authorization: `Bearer ${refreshData.access_token}`,
                  "Content-Type": "application/json",
                },
              }
            );
              } catch (refreshError) {
                console.error("Failed to refresh token", {
                  error: refreshError instanceof Error ? refreshError.message : String(refreshError),
                  integration_id: integration.id,
                });
                throw refreshError;
              }
          }

          return response;
          } catch (fetchError) {
            console.error("Error fetching bookings from Avito", {
              error: fetchError instanceof Error ? fetchError.message : String(fetchError),
              item_id: itemId,
              integration_id: integration.id,
            });
            throw fetchError;
          }
        };

        const bookingsResponse = await fetchBookings(accessToken);

        // Handle 404 - item not found
        if (bookingsResponse.status === 404) {
          console.log("Bookings pull skipped (404) - continuing with push operations");
          // Don't add to syncErrors - bookings pull is not critical, continue with push
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
            name?: string; // Верхнеуровневые поля (некоторые ответы API)
            phone?: string;
            phone_number?: string; // Альтернативное поле телефона в API
            contact_phone?: string;
            email?: string;
            first_name?: string; // Имя и фамилия отдельно (API может отдавать так)
            last_name?: string;
            contact?: {
              name?: string; // Имя гостя
              first_name?: string;
              last_name?: string;
              email?: string; // Email гостя
              phone?: string; // Номер телефона
              phone_number?: string;
              contact_phone?: string;
            };
            customer?: {  // Приоритетное поле согласно документации
              name?: string;
              first_name?: string;
              last_name?: string;
              email?: string;
              phone?: string;
              phone_number?: string;
              contact_phone?: string;
            };
            user?: {  // Возможный вариант структуры данных
              name?: string;
              first_name?: string;
              last_name?: string;
              email?: string;
              phone?: string;
              phone_number?: string;
            };
            booker?: { name?: string; first_name?: string; last_name?: string; email?: string; phone?: string; phone_number?: string };
            renter?: { name?: string; first_name?: string; last_name?: string; email?: string; phone?: string; phone_number?: string };
            profile?: { name?: string; first_name?: string; last_name?: string; email?: string; phone?: string; phone_number?: string };
            guest_name?: string; // Fallback для обратной совместимости
            guest_email?: string; // Fallback для обратной совместимости
            guest_phone?: string; // Fallback для обратной совместимости
            guest?: {
              name?: string;
              first_name?: string;
              last_name?: string;
              email?: string;
              phone?: string;
              phone_number?: string;
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

          // Helper function to fetch booking details by ID
          // Try endpoint: GET /realty/v1/accounts/{user_id}/items/{item_id}/bookings/{booking_id}
          const fetchBookingDetails = async (bookingId: string | number, token: string): Promise<AvitoBookingResponse | null> => {
            try {
              const bookingIdStr = String(bookingId);
              const detailsUrl = `${avitoBaseUrl}/realty/v1/accounts/${userId}/items/${itemId}/bookings/${bookingIdStr}`;
              
              console.log("Attempting to fetch booking details", {
                bookingId: bookingIdStr,
                url: detailsUrl,
              });

              const detailsResponse = await fetchWithRetry(detailsUrl, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              });

              if (detailsResponse.ok) {
                const detailsData = await detailsResponse.json() as AvitoBookingResponse;
                console.log("Successfully fetched booking details", {
                  bookingId: bookingIdStr,
                  hasContact: !!detailsData.contact,
                  hasCustomer: !!detailsData.customer,
                  contactName: detailsData.contact?.name,
                  customerName: detailsData.customer?.name,
                });
                return detailsData;
              } else if (detailsResponse.status === 404) {
                console.log("Booking details endpoint not found (404) - endpoint may not exist", {
                  bookingId: bookingIdStr,
                });
                return null;
              } else {
                console.warn("Failed to fetch booking details", {
                  bookingId: bookingIdStr,
                  status: detailsResponse.status,
                  statusText: detailsResponse.statusText,
                });
                return null;
              }
            } catch (error) {
              console.warn("Error fetching booking details", {
                bookingId: String(bookingId),
                error: error instanceof Error ? error.message : String(error),
              });
              return null;
            }
          };

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

                // Try to fetch booking details if contact data is missing
                let bookingWithDetails = booking;
                const hasContactData = booking.contact?.name || booking.contact?.email || booking.contact?.phone ||
                                      booking.customer?.name || booking.customer?.email || booking.customer?.phone ||
                                      booking.guest?.name || booking.guest?.phone || booking.guest?.email ||
                                      booking.user?.name || booking.user?.phone || booking.user?.email ||
                                      booking.booker?.name || booking.booker?.phone || booking.booker?.email ||
                                      booking.renter?.name || booking.renter?.phone || booking.renter?.email ||
                                      booking.profile?.name || booking.profile?.phone || booking.profile?.email ||
                                      booking.guest_name || booking.guest_phone || booking.guest_email ||
                                      (typeof booking.name === "string" && booking.name.trim()) ||
                                      (typeof booking.phone === "string" && booking.phone.trim()) ||
                                      (typeof booking.email === "string" && booking.email.trim());
                
                if (!hasContactData) {
                  console.log("Contact data missing, attempting to fetch booking details", {
                    bookingId: String(bookingId),
                  });
                  
                  const details = await fetchBookingDetails(bookingId, accessToken);
                  if (details) {
                    // Merge details with original booking, prioritizing details
                    bookingWithDetails = {
                      ...booking,
                      contact: details.contact || booking.contact,
                      customer: details.customer || booking.customer,
                      guest: details.guest || booking.guest,
                      user: details.user || booking.user,
                      booker: details.booker || booking.booker,
                      renter: details.renter || booking.renter,
                      profile: details.profile || booking.profile,
                      name: details.name ?? booking.name,
                      phone: details.phone ?? booking.phone,
                      email: details.email ?? booking.email,
                      guest_name: details.guest_name ?? booking.guest_name,
                      guest_phone: details.guest_phone ?? booking.guest_phone,
                      guest_email: details.guest_email ?? booking.guest_email,
                    };
                    console.log("Merged booking details", {
                      bookingId: String(bookingId),
                      hasContactAfterMerge: !!bookingWithDetails.contact?.name || !!bookingWithDetails.customer?.name,
                    });
                  }
                }


                // Собирает полное имя из first_name + last_name
                const fullNameFromParts = (first?: string, last?: string): string | undefined => {
                  const f = typeof first === "string" ? first.trim() : "";
                  const l = typeof last === "string" ? last.trim() : "";
                  if (!f && !l) return undefined;
                  return (f + " " + l).trim() || undefined;
                };

                // Расширенная функция извлечения имени с проверкой всех возможных полей
                // Приоритет: customer > contact > booker > renter > profile > guest > user > top-level; также first_name + last_name
                const extractGuestName = (booking: AvitoBookingResponse): string => {
                  const name = booking.customer?.name
                    || booking.contact?.name
                    || booking.booker?.name
                    || booking.renter?.name
                    || booking.profile?.name
                    || booking.guest_name
                    || booking.guest?.name
                    || booking.user?.name
                    || (typeof booking.name === "string" ? booking.name : undefined)
                    || fullNameFromParts(booking.customer?.first_name, booking.customer?.last_name)
                    || fullNameFromParts(booking.contact?.first_name, booking.contact?.last_name)
                    || fullNameFromParts(booking.guest?.first_name, booking.guest?.last_name)
                    || fullNameFromParts(booking.user?.first_name, booking.user?.last_name)
                    || fullNameFromParts(booking.booker?.first_name, booking.booker?.last_name)
                    || fullNameFromParts(booking.renter?.first_name, booking.renter?.last_name)
                    || fullNameFromParts(booking.profile?.first_name, booking.profile?.last_name)
                    || fullNameFromParts(booking.first_name, booking.last_name);

                  if (name && name.trim() && name !== "Гость с Avito") {
                    return name.trim();
                  }

                  console.warn("Guest name not found in booking", {
                    bookingId: booking.avito_booking_id || booking.id,
                    availableFields: Object.keys(booking),
                    contact: booking.contact,
                    customer: booking.customer,
                    guest: booking.guest,
                    user: booking.user,
                    booker: booking.booker,
                    renter: booking.renter,
                    profile: booking.profile,
                  });

                  return "Гость Avito";
                };

                // Расширенная функция извлечения телефона
                // Приоритет: customer > contact > booker > renter > profile > guest > user > top-level; также phone_number, contact_phone
                const extractGuestPhone = (booking: AvitoBookingResponse): string | null => {
                  const phone = booking.customer?.phone
                    || booking.customer?.phone_number
                    || booking.customer?.contact_phone
                    || booking.contact?.phone
                    || booking.contact?.phone_number
                    || booking.contact?.contact_phone
                    || booking.booker?.phone
                    || booking.booker?.phone_number
                    || booking.renter?.phone
                    || booking.renter?.phone_number
                    || booking.profile?.phone
                    || booking.profile?.phone_number
                    || booking.guest_phone
                    || booking.guest?.phone
                    || booking.guest?.phone_number
                    || booking.user?.phone
                    || booking.user?.phone_number
                    || (typeof booking.phone === "string" ? booking.phone : undefined)
                    || (typeof booking.phone_number === "string" ? booking.phone_number : undefined)
                    || (typeof booking.contact_phone === "string" ? booking.contact_phone : undefined);

                  return normalizePhone(phone);
                };

                // Извлекаем данные гостя используя расширенные функции и bookingWithDetails
                const contactName = extractGuestName(bookingWithDetails);
                const contactEmail = bookingWithDetails.customer?.email
                  || bookingWithDetails.contact?.email
                  || bookingWithDetails.booker?.email
                  || bookingWithDetails.renter?.email
                  || bookingWithDetails.profile?.email
                  || bookingWithDetails.guest_email
                  || bookingWithDetails.guest?.email
                  || bookingWithDetails.user?.email
                  || (typeof bookingWithDetails.email === "string" ? bookingWithDetails.email : null)
                  || null;
                const contactPhone = extractGuestPhone(bookingWithDetails);

                // Логируем, какие поля были найдены для диагностики
                console.log("Extracted guest data from booking", {
                  bookingId: booking.avito_booking_id || booking.id,
                  guestName: contactName,
                  nameSource: bookingWithDetails.contact?.name ? 'contact.name' 
                    : bookingWithDetails.customer?.name ? 'customer.name'
                    : bookingWithDetails.guest_name ? 'guest_name'
                    : bookingWithDetails.guest?.name ? 'guest.name'
                    : bookingWithDetails.user?.name ? 'user.name'
                    : 'fallback',
                  hasEmail: !!contactEmail,
                  emailSource: bookingWithDetails.contact?.email ? 'contact.email'
                    : bookingWithDetails.customer?.email ? 'customer.email'
                    : bookingWithDetails.guest_email ? 'guest_email'
                    : bookingWithDetails.guest?.email ? 'guest.email'
                    : bookingWithDetails.user?.email ? 'user.email'
                    : 'none',
                  hasPhone: !!contactPhone,
                  phoneSource: bookingWithDetails.contact?.phone ? 'contact.phone'
                    : bookingWithDetails.customer?.phone ? 'customer.phone'
                    : bookingWithDetails.guest_phone ? 'guest_phone'
                    : bookingWithDetails.guest?.phone ? 'guest.phone'
                    : bookingWithDetails.user?.phone ? 'user.phone'
                    : 'none',
                  detailsFetched: bookingWithDetails !== booking,
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
                // Convert bookingId to number for BIGINT column
                const avitoBookingIdNum = typeof bookingId === 'number' ? bookingId : parseInt(bookingId.toString(), 10);
                
                const bookingData = {
                  property_id: integration.property_id,
                  avito_booking_id: avitoBookingIdNum, // Use BIGINT
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
                  .eq("avito_booking_id", avitoBookingIdNum)
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
                  // Handle PGRST204 error (column not found) - skip silently
                  if (upsertError.code === 'PGRST204' || upsertError.message?.includes('Could not find the') || upsertError.message?.includes('avito_booking_id')) {
                    console.log("Upsert skipped (column missing)", {
                      bookingId: bookingId.toString(),
                      errorCode: upsertError.code,
                      errorMessage: upsertError.message,
                    });
                    skippedCount++;
                  } else {
                  console.error("Failed to upsert booking from Avito", {
                    booking,
                    error: upsertError,
                  });
                  errorCount++;
                  }
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

          // Cancel unpaid bookings in Avito (optional - only if not paid)
          // This helps prevent overbooking by canceling pending bookings that weren't paid
          let canceledCount = 0;
          for (const booking of avitoBookings) {
            try {
              // Only cancel if status is "pending" (unpaid) and we have booking ID
              const bookingId = booking.avito_booking_id || booking.id;
              if (booking.status === "pending" && bookingId) {
                try {
                  // Use STR API endpoint with user_id
                  const cancelResponse = await fetchWithRetry(
                    `${avitoBaseUrl}/realty/v1/accounts/${userId}/items/${itemId}/bookings/${bookingId}/cancel`,
                    {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                      },
                    }
                  );

                  if (cancelResponse.ok) {
                    console.log("Canceled unpaid booking in Avito", {
                      booking_id: bookingId,
                      check_in: booking.check_in,
                      check_out: booking.check_out,
                    });
                    canceledCount++;
                  } else if (cancelResponse.status === 409) {
                    // 409 = booking is paid, can't cancel - this is expected
                    console.log("Booking is paid, cannot cancel", {
                      booking_id: bookingId,
                    });
                  } else {
                    console.warn("Failed to cancel booking", {
                      booking_id: bookingId,
                      status: cancelResponse.status,
                    });
                  }
                } catch (cancelError) {
                  console.warn("Error canceling booking", {
                    booking_id: bookingId,
                    error: cancelError instanceof Error ? cancelError.message : String(cancelError),
                  });
                  // Don't fail sync if cancel fails
                }
              }
            } catch (error) {
              console.warn("Error processing booking cancellation", {
                booking,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          console.log("Bookings sync summary", {
            total: avitoBookings.length,
            created: createdCount,
            skipped: skippedCount,
            canceled: canceledCount,
            errors: errorCount,
          });

          // Log sync success to avito_logs
          try {
          await supabase.from("avito_logs").insert({
            integration_id: integration.id,
            property_id: integration.property_id,
            action: "sync_bookings",
            status: "success",
            details: {
              total: avitoBookings.length,
              created: createdCount,
              skipped: skippedCount,
                canceled: canceledCount,
              errors: errorCount,
            },
          });
          } catch (logError) {
            console.error("Failed to log bookings sync success", { error: logError });
          }
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
          try {
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
          } catch (logError) {
            console.error("Failed to log bookings sync error", { error: logError });
          }

          // Don't throw error - bookings pull is not critical for sync
          console.warn("Continuing sync despite bookings fetch failure");
        }

        // Update last_sync_at and ensure is_active is true
          try {
        await supabase
          .from("integrations")
          .update({ 
            last_sync_at: new Date().toISOString(),
            is_active: true 
          })
          .eq("id", integration_id);
          } catch (updateError) {
            console.error("Failed to update last_sync_at", {
              integration_id,
              error: updateError instanceof Error ? updateError.message : String(updateError),
            });
            // Don't fail sync if update fails
          }

          const hasError = syncErrors.length > 0;
          const pushSuccess = pricesPushSuccess && intervalsPushSuccess;

          console.log("Sync operation completed", {
            integration_id,
            hasError,
            errors_count: syncErrors.length,
            warnings_count: syncWarnings.length,
            pricesPushSuccess,
            intervalsPushSuccess,
            pushSuccess,
          });

          // Persist sync errors so the app can notify the user (Realtime + journal)
          if (hasError && integration?.id && integration?.property_id) {
            try {
              await supabase.from("avito_logs").insert({
                integration_id: integration.id,
                property_id: integration.property_id,
                action: "sync",
                status: "error",
                error: syncErrors.map((e) => e.message || "Ошибка синхронизации").join("; "),
                details: { errors: syncErrors },
              });
            } catch (logErr) {
              console.error("Failed to log sync error to avito_logs", { error: logErr });
            }
          }

        return new Response(
          JSON.stringify({ 
              success: !hasError,
              hasError,
              hasData: true,
              pushSuccess: !hasError && pushSuccess,
              pricesPushSuccess,
              intervalsPushSuccess,
              errorMessage: hasError ? syncErrors.map(e => e.message || 'Ошибка синхронизации').join('; ') : undefined,
              errors: syncErrors.length > 0 ? syncErrors : undefined,
              warnings: syncWarnings.length > 0 ? syncWarnings : undefined,
              warningMessage: syncWarnings.length > 0 ? syncWarnings.map(w => w.message).join(' ') : undefined,
            }),
            {
              status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
        } catch (error) {
          // Catch any unhandled errors in sync operation
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;
          
          console.error("CRITICAL: Unhandled error in sync operation", {
            integration_id: params?.integration_id,
            error: errorMessage,
            stack: errorStack,
          });

          return new Response(
            JSON.stringify({ 
              success: false,
              hasError: true,
              hasData: false,
              errorMessage: "Internal server error during sync: " + errorMessage,
              errors: [{
                operation: 'sync',
                statusCode: 500,
                message: errorMessage,
              }],
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
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

