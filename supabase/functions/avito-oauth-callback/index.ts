/**
 * Avito OAuth Callback Edge Function
 * Handles OAuth callback: exchange code for token, get account_id, save to integrations
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const AVITO_API_BASE = "https://api.avito.ru";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Type definitions for Avito API responses
interface AvitoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

interface AvitoErrorResponse {
  error?: string;
  error_description?: string;
  error_uri?: string;
}

// AvitoUserResponse removed - not needed for STR API

interface OAuthCallbackRequest {
  code?: string;
  state?: string;
  redirect_uri?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight - must return 204 No Content
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
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
    let requestBody: OAuthCallbackRequest;
    try {
      requestBody = await req.json() as OAuthCallbackRequest;
    } catch (jsonError: unknown) {
      const errorMessage = jsonError instanceof Error ? jsonError.message : String(jsonError);
      console.error("Failed to parse JSON:", errorMessage);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { code, state, redirect_uri } = requestBody;

    // Validate required parameters
    if (!code) {
      return new Response(
        JSON.stringify({ error: "Missing authorization code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!state) {
      return new Response(
        JSON.stringify({ error: "Missing state parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse state to get property_id and/or integration_id
    let stateData: { property_id?: string; integration_id?: string; timestamp?: number } | null = null;
    try {
      stateData = JSON.parse(atob(state));
    } catch (stateError: unknown) {
      const errorMessage = stateError instanceof Error ? stateError.message : String(stateError);
      console.error("Failed to parse state:", errorMessage);
      return new Response(
        JSON.stringify({ error: "Invalid state parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!stateData?.property_id && !stateData?.integration_id) {
      return new Response(
        JSON.stringify({ error: "Invalid state: property_id or integration_id not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const propertyId = stateData.property_id;
    const integrationIdFromState = stateData.integration_id;
    const redirectUri = redirect_uri || `${new URL(req.url).origin}/auth/avito-callback`;

    console.log("Processing OAuth callback", {
      propertyId,
      hasCode: !!code,
      codeLength: code.length,
      redirectUri,
    });

    // Step 1: Exchange code for token
    console.log("Exchanging code for token");
    const tokenResponse = await fetch(`${AVITO_API_BASE}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: avitoClientId,
        client_secret: avitoClientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      let errorMessage = `Token exchange failed (${tokenResponse.status})`;
      try {
        const errorData = await tokenResponse.json() as AvitoErrorResponse;
        if (errorData.error) {
          errorMessage = `Avito API error: ${errorData.error}`;
          if (errorData.error_description) {
            errorMessage += ` - ${errorData.error_description}`;
          }
        }
      } catch {
        const errorText = await tokenResponse.text().catch(() => 'Unable to read error');
        errorMessage = errorText || errorMessage;
      }

      console.error("Token exchange error:", {
        status: tokenResponse.status,
        errorMessage,
      });

      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: tokenResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenData = await tokenResponse.json() as AvitoTokenResponse;
    console.log("Token exchange successful", {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
    });

    // Step 2: Save to integrations (no account_id needed for STR API)
    // According to Avito STR API docs: endpoints /items/{item_id}/... don't require account_id
    // Token itself verifies item_id ownership
    const expiresInSeconds = tokenData.expires_in && typeof tokenData.expires_in === 'number' && tokenData.expires_in > 0 
      ? tokenData.expires_in 
      : 3600;
    
    // Calculate token expiration: now + expires_in seconds
    const tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    console.log("Saving token to integration", {
      propertyId,
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: expiresInSeconds,
      tokenExpiresAt: tokenExpiresAt.toISOString(),
    });

    // Get integration_id: from state if provided, otherwise find by property_id
    let integrationId: string | undefined = integrationIdFromState;

    if (!integrationId && propertyId) {
      // Find existing integration by property_id and platform
      const { data: existingIntegration, error: findError } = await supabase
        .from("integrations")
        .select("id")
        .eq("property_id", propertyId)
        .eq("platform", "avito")
        .maybeSingle();

      if (findError && findError.code !== 'PGRST116') { // PGRST116 = not found, which is OK
        console.error("Error finding integration:", {
          errorCode: findError.code,
          errorMessage: findError.message,
        });
        return new Response(
          JSON.stringify({ 
            error: `Ошибка при поиске интеграции: ${findError.message}` 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      integrationId = existingIntegration?.id;
    }

    // Prepare update data with plain tokens (for testing, vault encryption later)
    // token_expires_at = NOW() + INTERVAL '1 second' * token.expires_in
    const updateData: {
      access_token_encrypted: string;
      refresh_token_encrypted?: string;
      token_expires_at: string;
      is_active: boolean;
      is_enabled: boolean;
    } = {
      access_token_encrypted: tokenData.access_token, // Plain text for testing
      token_expires_at: tokenExpiresAt.toISOString(),
      is_active: true,
      is_enabled: true,
    };

    // Add refresh_token if provided
    if (tokenData.refresh_token) {
      updateData.refresh_token_encrypted = tokenData.refresh_token; // Plain text for testing
    }

    let integration;
    let saveError;

    if (integrationId) {
      // Update existing integration by id (from state)
      console.log("Updating existing integration", { integrationId });
      const { data, error } = await supabase
        .from("integrations")
        .update(updateData)
        .eq("id", integrationId)
        .select('id, property_id, platform, is_active')
        .single();
      
      integration = data;
      saveError = error;
    } else if (propertyId) {
      // Create new integration if no integration_id found
      console.log("Creating new integration");
      const upsertData = {
        property_id: propertyId,
        platform: "avito",
        ...updateData,
      };

      const { data, error } = await supabase
        .from("integrations")
        .insert(upsertData)
        .select('id, property_id, platform, is_active')
        .single();
      
      integration = data;
      saveError = error;
    } else {
      return new Response(
        JSON.stringify({ 
          error: "Cannot save integration: neither integration_id nor property_id provided" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (saveError) {
      console.error("Error saving integration:", {
        errorCode: saveError.code,
        errorMessage: saveError.message,
        errorDetails: saveError.details,
        integrationId,
        propertyId,
      });
      return new Response(
        JSON.stringify({ 
          error: `Ошибка при сохранении интеграции: ${saveError.message}` 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration) {
      console.error("Integration not returned after save", { integrationId, propertyId });
      return new Response(
        JSON.stringify({ 
          error: "Интеграция не была сохранена" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify token was saved by reloading integration
    const { data: verifyIntegration, error: verifyError } = await supabase
      .from("integrations")
      .select("id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .eq("id", integration.id)
      .single();

    if (verifyError) {
      console.error("Failed to verify token save", {
        error: verifyError,
        integration_id: integration.id,
      });
    } else {
      console.log("Token save verified", {
        integration_id: integration.id,
        hasAccessToken: !!verifyIntegration?.access_token_encrypted,
        accessTokenLength: verifyIntegration?.access_token_encrypted?.length || 0,
        hasRefreshToken: !!verifyIntegration?.refresh_token_encrypted,
        tokenExpiresAt: verifyIntegration?.token_expires_at,
      });
    }

    console.log("Tokens saved for integration", integration.id);

    // Return success (no accountId needed)
    return new Response(
      JSON.stringify({
        success: true,
        integrationId: integration.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Unexpected error in avito-oauth-callback:", {
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return new Response(
      JSON.stringify({ 
        error: errorMessage || "Внутренняя ошибка сервера" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

