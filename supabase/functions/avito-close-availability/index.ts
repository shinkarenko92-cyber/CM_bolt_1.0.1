/**
 * Avito Close Availability Edge Function
 * Closes all dates in Avito for a property before deletion
 * Uses POST /realty/v1/items/intervals with empty intervals array to close full calendar
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const AVITO_API_BASE = "https://api.avito.ru";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CloseAvailabilityRequest {
  integration_id: string;
  property_id: string;
}

interface AvitoIntervalsResponse {
  result?: string; // "success" on success
  error?: {
    code?: number;
    message?: string;
    details?: unknown;
  };
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

    // Parse request body
    let requestBody: CloseAvailabilityRequest;
    try {
      requestBody = await req.json();
    } catch (jsonError) {
      console.error("Failed to parse JSON:", jsonError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { integration_id, property_id } = requestBody;

    if (!integration_id || !property_id) {
      return new Response(
        JSON.stringify({ error: "Missing integration_id or property_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Closing Avito availability", { integration_id, property_id });

    // Fetch integration from database
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integration_id)
      .eq("property_id", property_id)
      .eq("platform", "avito")
      .eq("is_active", true)
      .single();

    if (integrationError || !integration) {
      console.error("Integration not found or inactive", { integrationError, integration_id, property_id });
      return new Response(
        JSON.stringify({ error: "Integration not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get item_id - use avito_item_id (TEXT) - primary field, fallback to avito_item_id_text or BIGINT conversion
    const itemIdText = (integration as { avito_item_id?: string | null }).avito_item_id
      || (integration as { avito_item_id_text?: string | null }).avito_item_id_text
      || (integration.avito_item_id ? String(integration.avito_item_id) : null);

    // Validate item_id - must be non-empty string
    // CRITICAL: NEVER use avito_account_id in /items/{id}/ paths - ONLY use avito_item_id
    if (!itemIdText || itemIdText.trim() === '') {
      return new Response(
        JSON.stringify({ error: "ID объявления Avito не настроен. Проверь настройки интеграции — должен быть длинный номер вроде 2336174775" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get access token
    let accessToken = integration.access_token_encrypted;

    // Check token expiration and refresh if needed
    if (integration.token_expires_at) {
      let expiresAtString = integration.token_expires_at;
      if (!expiresAtString.endsWith('Z') && !expiresAtString.includes('+') && !expiresAtString.includes('-', 10)) {
        expiresAtString = expiresAtString + 'Z';
      }
      
      const expiresAt = new Date(expiresAtString);
      const now = new Date();
      
      if (expiresAt.getTime() <= now.getTime()) {
        console.log("Token expired, refreshing...", {
          expiresAt: expiresAt.toISOString(),
          now: now.toISOString(),
        });

        // Refresh token using client_credentials flow
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
          console.error("Failed to refresh token", {
            status: refreshResponse.status,
            error: errorText,
          });
          return new Response(
            JSON.stringify({ error: "Failed to refresh token", details: errorText }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const refreshData = await refreshResponse.json();
        accessToken = refreshData.access_token;

        // Update token in database
        const expiresIn = refreshData.expires_in || 3600;
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

        await supabase
          .from("integrations")
          .update({
            access_token_encrypted: accessToken,
            token_expires_at: tokenExpiresAt.toISOString(),
          })
          .eq("id", integration_id);
      }
    }

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "No access token available" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Avito API to close all dates
    // POST /realty/v1/items/{item_id}/intervals with empty intervals array closes full calendar
    const itemId = itemIdText;
    const closeUrl = `${AVITO_API_BASE}/realty/v1/items/${itemId}/intervals`;

    console.log("Calling Avito API to close availability", {
      url: closeUrl,
      item_id: itemId,
    });

    // Retry logic for 429 (rate limit)
    let lastError: { status: number; message: string; details?: unknown } | null = null;
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch(closeUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          item_id: itemId,
          intervals: [], // Empty array closes full calendar (year ahead by default)
          source: "roomi_pms", // PMS source identifier
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorDetails: unknown = errorText;
        let errorMessage: string;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetails = errorJson;
          errorMessage = typeof errorJson === 'object' && errorJson !== null
            ? (errorJson as { message?: string; error?: { message?: string } }).message 
              || (errorJson as { error?: { message?: string } }).error?.message
              || JSON.stringify(errorJson)
            : String(errorJson);
        } catch {
          // Keep as text if not JSON
          errorMessage = errorText;
        }

        // Handle 404 - item not found
        if (response.status === 404) {
          const userMessage = "Объявление не найдено в Avito. Проверь ID объекта в настройках интеграции";
          console.error("Avito item not found (404)", { item_id: itemId, error: errorDetails });

          // Log error to avito_logs
          await supabase.from("avito_logs").insert({
            integration_id,
            property_id,
            action: "close_availability",
            status: "error",
            error: userMessage,
            details: { item_id: itemId, error: errorDetails },
          });

          return new Response(
            JSON.stringify({
              success: false,
              error: "item_not_found",
              message: userMessage,
              details: errorDetails,
            }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Handle 409 Conflict (paid bookings)
        if (response.status === 409) {
          console.error("Avito API returned 409 Conflict (paid bookings)", {
            status: response.status,
            error: errorDetails,
          });

          // Log error to avito_logs
          await supabase.from("avito_logs").insert({
            integration_id,
            property_id,
            action: "close_availability",
            status: "error",
            error: "409 Conflict: Paid bookings exist",
            details: { item_id: itemId, error: errorDetails },
          });

          return new Response(
            JSON.stringify({
              success: false,
              error: "paid_conflict",
              message: "???? ?????????? ????? � ??????? ?????? ???????",
              details: errorDetails,
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Handle 429 Rate Limit - retry
        if (response.status === 429) {
          lastError = {
            status: 429,
            message: "Rate limit exceeded",
            details: errorDetails,
          };
          console.warn(`Rate limit hit (attempt ${attempt + 1}/${maxRetries})`, { errorDetails });
          continue; // Retry
        }

        // Handle other errors - don't retry
        lastError = {
          status: response.status,
          message: errorMessage || `Avito API error: ${response.status} ${response.statusText}`,
          details: errorDetails,
        };

        console.error("Avito API error", {
          status: response.status,
          statusText: response.statusText,
          error: errorDetails,
        });

        break; // Don't retry for non-429 errors
      }

      // Success response - parse and type it
      let responseData: AvitoIntervalsResponse;
      try {
        responseData = await response.json() as AvitoIntervalsResponse;
      } catch (jsonError) {
        // If response is not JSON, treat as success if status is 200
        console.warn("Avito API returned non-JSON response, treating as success", {
          status: response.status,
          error: jsonError,
        });
        responseData = { result: "success" };
      }

      console.log("Avito availability closed successfully", {
        result: responseData.result,
        response: responseData,
      });

      // Log success to avito_logs
      await supabase.from("avito_logs").insert({
        integration_id,
        property_id,
        action: "close_availability",
        status: "success",
        details: { item_id: itemId, response: responseData },
      });

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If we get here, all retries failed or non-retryable error occurred
    const finalError = lastError || {
      status: 500,
      message: "Unknown error",
    };

    // Log error to avito_logs
    await supabase.from("avito_logs").insert({
      integration_id,
      property_id,
      action: "close_availability",
      status: "error",
      error: finalError.message,
      details: { item_id: itemId, error: finalError.details },
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: finalError.message,
        details: finalError.details,
      }),
      {
        status: finalError.status >= 400 && finalError.status < 600 ? finalError.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    let errorMessage: string;
    if (typeof error === 'object' && error !== null) {
      errorMessage = (error as { message?: string }).message || JSON.stringify(error);
    } else {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Edge Function error:", {
      name: error instanceof Error ? error.name : "Error",
      message: errorMessage,
      stack: errorStack,
    });

    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: errorStack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
