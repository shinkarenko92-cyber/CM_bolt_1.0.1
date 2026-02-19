/**
 * Avito Messenger Proxy - server-side proxy to avoid CORS when calling Avito API from browser.
 * Actions: getChats, getMessages, sendMessage.
 * Deploy: supabase functions deploy avito-messenger --no-verify-jwt
 * (JWT is validated inside; gateway must not block with 403.)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const AVITO_API_BASE = "https://api.avito.ru";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey, x-supabase-api-version",
};

interface BodyGetChats {
  action: "getChats";
  integration_id: string;
  item_id?: string;
  limit?: number;
  offset?: number;
}

interface BodyGetMessages {
  action: "getMessages";
  integration_id: string;
  chat_id: string;
  limit?: number;
  offset?: number;
}

interface BodySendMessage {
  action: "sendMessage";
  integration_id: string;
  chat_id: string;
  text: string;
  attachments?: Array<{ type: string; url: string; name?: string }>;
}

type Body = BodyGetChats | BodyGetMessages | BodySendMessage;

Deno.serve(async (req: Request) => {
  const log = (step: string, data?: Record<string, unknown>) => {
    console.log(`[avito-messenger] ${step}`, data ?? "");
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    log("rejected", { reason: "method not allowed", method: req.method });
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    log("rejected", { reason: "no Bearer token" });
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  log("token_received", { tokenLength: token.length, tokenPreview: token.length >= 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : "***" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
  if (userError || !user) {
    log("auth_failed", { userError: userError?.message, hasUser: !!user });
    return new Response(
      JSON.stringify({ error: "Unauthorized", details: userError?.message }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  log("user_resolved", { userId: user.id, email: user.email });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    log("rejected", { reason: "invalid JSON body" });
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!body?.action || !body?.integration_id) {
    log("rejected", { reason: "missing action or integration_id", body: { action: body?.action, integration_id: body?.integration_id } });
    return new Response(
      JSON.stringify({ error: "Missing action or integration_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  log("body_parsed", { action: body.action, integration_id: body.integration_id });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("id, property_id, avito_user_id, avito_account_id, access_token_encrypted")
    .eq("id", body.integration_id)
    .eq("platform", "avito")
    .eq("is_active", true)
    .single();

  if (integrationError || !integration) {
    log("integration_not_found", { integration_id: body.integration_id, error: integrationError?.message });
    return new Response(
      JSON.stringify({ error: "Integration not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  log("integration_found", { integration_id: integration.id, property_id: integration.property_id, hasToken: !!integration.access_token_encrypted });

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("owner_id")
    .eq("id", integration.property_id)
    .single();

  if (propertyError || !property) {
    log("property_not_found", { property_id: integration.property_id, error: propertyError?.message });
    return new Response(
      JSON.stringify({ error: "Property not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (property.owner_id !== user.id) {
    log("forbidden_owner_mismatch", { property_owner_id: property.owner_id, user_id: user.id });
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  log("owner_verified", { owner_id: property.owner_id });

  let accessToken = integration.access_token_encrypted;
  try {
    const { data: decrypted } = await supabase.rpc("decrypt_avito_token", {
      encrypted_token: accessToken,
    });
    if (decrypted) accessToken = decrypted;
  } catch (e) {
    log("decrypt_skipped", { reason: e instanceof Error ? e.message : "unknown" });
  }
  log("token_ready", { tokenLength: accessToken?.length ?? 0, tokenPreview: accessToken && accessToken.length >= 8 ? `${accessToken.slice(0, 4)}...${accessToken.slice(-4)}` : "empty" });

  const userId = String(integration.avito_user_id ?? integration.avito_account_id ?? "");
  if (!userId) {
    log("rejected", { reason: "integration missing avito_user_id" });
    return new Response(
      JSON.stringify({ error: "Integration missing avito_user_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  log("avito_user_id", { userId });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const AVITO_FETCH_MS = 15000;
  const fetchWithTimeout = async (url: string, init: RequestInit, action: string): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AVITO_FETCH_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      console.error(`[avito-messenger] fetch failed for ${action}:`, err);
      throw err;
    }
  };

  try {
    if (body.action === "getChats") {
      const b = body as BodyGetChats;
      const action = "getChats";
      let url = `${AVITO_API_BASE}/messenger/v2/accounts/${userId}/chats`;
      const params = new URLSearchParams();
      if (b.item_id) params.append("item_id", b.item_id);
      if (b.limit != null) params.append("limit", String(b.limit));
      if (b.offset != null) params.append("offset", String(b.offset));
      if (params.toString()) url += `?${params.toString()}`;
      log("avito_request", { action, url });
      try {
        const res = await fetchWithTimeout(url, { headers }, action);
        const data = await res.json().catch(() => ({}));
        log("avito_response", { action, status: res.status, ok: res.ok });
        if (!res.ok) {
          return new Response(
            JSON.stringify({ error: "Avito API error", status: res.status, data }),
            { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(
          JSON.stringify({ error: "Avito request failed", details: message }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (body.action === "getMessages") {
      const b = body as BodyGetMessages;
      if (!b.chat_id) {
        return new Response(
          JSON.stringify({ error: "Missing chat_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const action = "getMessages";
      let url = `${AVITO_API_BASE}/messenger/v2/accounts/${userId}/chats/${b.chat_id}/messages`;
      const params = new URLSearchParams();
      if (b.limit != null) params.append("limit", String(b.limit));
      if (b.offset != null) params.append("offset", String(b.offset));
      if (params.toString()) url += `?${params.toString()}`;
      log("avito_request", { action, url });
      try {
        const res = await fetchWithTimeout(url, { headers }, action);
        const data = await res.json().catch(() => ({}));
        log("avito_response", { action, status: res.status, ok: res.ok });
        if (!res.ok) {
          return new Response(
            JSON.stringify({ error: "Avito API error", status: res.status, data }),
            { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(
          JSON.stringify({ error: "Avito request failed", details: message }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (body.action === "sendMessage") {
      const b = body as BodySendMessage;
      if (!b.chat_id) {
        return new Response(
          JSON.stringify({ error: "Missing chat_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const action = "sendMessage";
      const postBody: { text?: string; attachments?: typeof b.attachments } = {};
      if (b.text) postBody.text = b.text;
      if (b.attachments?.length) postBody.attachments = b.attachments;
      const url = `${AVITO_API_BASE}/messenger/v2/accounts/${userId}/chats/${b.chat_id}/messages`;
      log("avito_request", { action, url, textLength: b.text?.length ?? 0 });
      try {
        const res = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(postBody) }, action);
        const data = await res.json().catch(() => ({}));
        log("avito_response", { action, status: res.status, ok: res.ok });
        if (!res.ok) {
          return new Response(
            JSON.stringify({ error: "Avito API error", status: res.status, data }),
            { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(
          JSON.stringify({ error: "Avito request failed", details: message }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[avito-messenger] critical error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
