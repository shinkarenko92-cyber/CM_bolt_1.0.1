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

        let lastError: Error | null = null;
        let lastResponse: Response | null = null;

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
              console.log("Successfully retrieved user data:", {
                has_accounts: !!userData.accounts,
                accounts_count: userData.accounts?.length || 0,
              });

              const accounts = userData.accounts || [];
              return new Response(JSON.stringify(accounts), {
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
            lastError = new Error(`Endpoint ${endpoint} returned ${response.status}: ${response.statusText}`);

            // If 404, try next endpoint
            if (response.status === 404) {
              continue;
            }

            // For other errors, stop trying
            break;
          } catch (error) {
            console.error(`Error fetching from ${endpoint}:`, error);
            lastError = error instanceof Error ? error : new Error(String(error));
            continue;
          }
        }

        // All endpoints failed - return error response instead of throwing
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
        const { account_id, item_id, access_token } = params;

        // Check if item ID is already connected (via check_connection endpoint)
        const response = await fetch(
          `${AVITO_API_BASE}/short_term_rent/accounts/${account_id}/items/${item_id}/check_connection`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.status === 409) {
          return new Response(
            JSON.stringify({ available: false, error: "ID уже используется" }),
            {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        if (!response.ok) {
          throw new Error(`Item validation failed: ${response.statusText}`);
        }

        return new Response(JSON.stringify({ available: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "save-integration": {
        const {
          property_id,
          avito_account_id,
          avito_item_id,
          avito_markup,
          access_token,
        } = params;

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
            avito_item_id: parseInt(avito_item_id, 10),
            avito_markup: parseFloat(avito_markup) || 15.0,
            // Token will be encrypted by Vault trigger (create trigger in migration)
            access_token_encrypted: access_token,
            token_expires_at: tokenExpiresAt.toISOString(),
            is_active: true,
            is_enabled: true,
            markup_type: "percent",
            markup_value: parseFloat(avito_markup) || 15.0,
          })
          .select()
          .single();

        if (error) throw error;

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
        const markup = integration.avito_markup || 15;
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
        await fetch(
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

        // Update availability (block dates)
        await fetch(
          `${AVITO_API_BASE}/short_term_rent/accounts/${accountId}/items/${itemId}/availability`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              dates: blockedDates,
            }),
          }
        );

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

        // Update last_sync_at
        await supabase
          .from("integrations")
          .update({ last_sync_at: new Date().toISOString() })
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

