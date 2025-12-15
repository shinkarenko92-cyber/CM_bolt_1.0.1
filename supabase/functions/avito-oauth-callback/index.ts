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

    // Parse state to get property_id
    let stateData: { property_id?: string; timestamp?: number } | null = null;
    try {
      stateData = JSON.parse(atob(state));
    } catch (stateError) {
      console.error("Failed to parse state:", stateError);
      return new Response(
        JSON.stringify({ error: "Invalid state parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!stateData?.property_id) {
      return new Response(
        JSON.stringify({ error: "Invalid state: property_id not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const propertyId = stateData.property_id;
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
        const errorData = await tokenResponse.json();
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

    const tokenData = await tokenResponse.json();
    console.log("Token exchange successful", {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
    });

    // Step 2: Get user info to extract account_id
    console.log("Fetching user info from Avito to get account_id");
    const userResponse = await fetch(`${AVITO_API_BASE}/core/v1/user`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text().catch(() => 'Unable to read error');
      console.error("Failed to get user info from Avito API", {
        status: userResponse.status,
        statusText: userResponse.statusText,
        errorText: errorText.substring(0, 500),
      });
      return new Response(
        JSON.stringify({ 
          error: `Не удалось получить данные аккаунта Avito (${userResponse.status}): ${errorText.substring(0, 200)}` 
        }),
        { status: userResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userData = await userResponse.json();
    console.log("Avito user API response", {
      userDataKeys: Object.keys(userData),
      hasUser: !!userData.user,
    });

    // Extract account_id from user data
    const accountId = userData.user?.id || userData.id || userData.user_id || null;

    if (!accountId) {
      console.error("Failed to extract account_id from user data", {
        userDataKeys: Object.keys(userData),
        userData: JSON.stringify(userData).substring(0, 1000),
      });
      return new Response(
        JSON.stringify({ 
          error: "Не удалось получить ID аккаунта Avito из ответа API. Попробуйте подключить заново." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Successfully extracted account_id", {
      accountId,
      source: userData.user?.id ? 'user.id' : (userData.id ? 'id' : 'user_id'),
    });

    // Step 3: Save to integrations
    const expiresInSeconds = tokenData.expires_in && typeof tokenData.expires_in === 'number' && tokenData.expires_in > 0 
      ? tokenData.expires_in 
      : 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const upsertData: {
      property_id: string;
      platform: string;
      avito_account_id: string;
      access_token_encrypted: string;
      refresh_token_encrypted?: string;
      token_expires_at: string;
      is_active: boolean;
      is_enabled: boolean;
    } = {
      property_id: propertyId,
      platform: "avito",
      avito_account_id: accountId,
      access_token_encrypted: tokenData.access_token,
      token_expires_at: tokenExpiresAt.toISOString(),
      is_active: true,
      is_enabled: true,
    };

    // Add refresh_token if provided
    if (tokenData.refresh_token) {
      upsertData.refresh_token_encrypted = tokenData.refresh_token;
    }

    console.log("Saving integration", {
      propertyId,
      accountId,
      hasRefreshToken: !!tokenData.refresh_token,
      tokenExpiresAt: tokenExpiresAt.toISOString(),
    });

    const { data: integration, error: saveError } = await supabase
      .from("integrations")
      .upsert(upsertData, {
        onConflict: 'property_id,platform'
      })
      .select('id, property_id, platform, avito_account_id, is_active')
      .single();

    if (saveError) {
      console.error("Error saving integration:", {
        errorCode: saveError.code,
        errorMessage: saveError.message,
        errorDetails: saveError.details,
      });
      return new Response(
        JSON.stringify({ 
          error: `Ошибка при сохранении интеграции: ${saveError.message}` 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Integration saved successfully", {
      integrationId: integration.id,
      propertyId: integration.property_id,
      accountId: integration.avito_account_id,
    });

    // Return success with accountId
    return new Response(
      JSON.stringify({
        success: true,
        accountId: accountId,
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

