/**
 * Avito Messenger Proxy — прокси к Avito Messenger API (https://developers.avito.ru/api-catalog/messenger/documentation).
 * Требуемые scopes: messenger:read, messenger:write.
 * Базовый URL: https://api.avito.ru/messenger/v2/
 * Actions: getChats, getMessages, sendMessage.
 * Deploy: supabase functions deploy avito-messenger --no-verify-jwt
 * (JWT проверяется внутри; шлюз не должен резать по 403.)
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

interface BodyDebug {
  action: "debug";
  integration_id: string;
}

type Body = BodyGetChats | BodyGetMessages | BodySendMessage | BodyDebug;

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

  const isDebugAction = body.action === "debug";
  if (isDebugAction) {
    const debugHeader = req.headers.get("X-Debug");
    const debugHeaderValid = debugHeader === "true";
    console.log("[avito-messenger-debug] header_check", { debugHeader, debugHeaderValid });
    if (!debugHeaderValid) {
      console.log("[avito-messenger-debug] access_denied_no_header", { userId: user.id });
      return new Response(
        JSON.stringify({ error: "Debug access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    console.log("[avito-messenger-debug] profile_check", { userId: user.id, role: profile?.role ?? null, profileError: profileError?.message ?? null });
    if (profileError || profile?.role !== "admin") {
      console.log("[avito-messenger-debug] access_denied_not_admin", { userId: user.id });
      return new Response(
        JSON.stringify({ error: "Debug access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("id, property_id, avito_user_id, avito_account_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, scope")
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

  const hasValidAvitoUserId =
    typeof integration.avito_user_id === "number" &&
    Number.isFinite(integration.avito_user_id) &&
    integration.avito_user_id > 0;
  if (!hasValidAvitoUserId && !isDebugAction) {
    log("invalid_avito_user_id", { avito_user_id: integration.avito_user_id, avito_account_id: integration.avito_account_id });
    return new Response(
      JSON.stringify({ error: "Integration missing valid avito_user_id (must be Avito user ID, not account_id)" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

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

  const avitoBaseUrl = getAvitoBaseUrl();

  // Check scope for messenger access
  const scope = integration.scope || "";
  const scopes = (scope ?? "").split(/\s+/);
  const hasMessengerRead = scopes.includes("messenger:read");
  const hasMessengerWrite = scopes.includes("messenger:write");

  if (!hasMessengerRead) {
    log("rejected", { reason: "missing messenger:read scope", scope });
    return new Response(
      JSON.stringify({
        error: "Требуется повторная авторизация для сообщений. Пожалуйста, авторизуйтесь в Avito через кнопку в разделе Сообщения.",
        requiresReauth: true,
        error_code: "missing_messenger_scope",
      }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ——— Проверка и refresh токена ———
  console.log("[avito-messenger] checking token expiration...");

  let expiresAt: string | null = integration.token_expires_at ?? null;
  let lastRefreshAttempt: string | null = null;
  // Нормализация без таймзоны
  if (expiresAt && typeof expiresAt === "string" && !expiresAt.includes("Z")) {
    expiresAt += "Z";
  }
  const expiresAtMs = expiresAt != null ? new Date(expiresAt).getTime() : NaN;
  // Рефрешим при отсутствии даты, невалидной дате или истечении в течение 15 мин
  const needsRefresh =
    !expiresAt || Number.isNaN(expiresAtMs) || expiresAtMs < Date.now() + 15 * 60 * 1000;

  if (needsRefresh) {
    console.log("[avito-messenger] token expired/near expiry, refreshing...");
    lastRefreshAttempt = new Date().toISOString();

    if (!integration.refresh_token_encrypted) {
      console.error("[avito-messenger] no refresh_token_encrypted");
      return new Response(JSON.stringify({ error: "Re-auth required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let refreshToken: string;
    try {
      const { data: decryptedRefresh, error: decryptErr } = await supabase.rpc("decrypt_avito_token", {
        encrypted_token: integration.refresh_token_encrypted,
      });
      if (decryptErr || decryptedRefresh == null) throw new Error(decryptErr?.message ?? "decrypt returned null");
      refreshToken = decryptedRefresh;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[avito-messenger] decrypt refresh_token failed:", msg);
      return new Response(JSON.stringify({ error: "Refresh token decryption failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const avitoClientId = Deno.env.get("AVITO_CLIENT_ID") ?? "";
    if (avitoClientId.length < MIN_CLIENT_ID_LENGTH) {
      console.error("[avito-messenger] AVITO_CLIENT_ID короче 20 символов");
      return new Response(JSON.stringify({ error: "Invalid Avito configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const url = `${avitoBaseUrl}/token`;
    logAvitoRequest("POST", url, Deno.env.get("AVITO_CLIENT_SECRET") ?? undefined);
    let refreshRes: Response;
    try {
      refreshRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: avitoClientId,
          client_secret: Deno.env.get("AVITO_CLIENT_SECRET") ?? "",
        }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[avito-messenger] refresh fetch failed:", msg);
      return new Response(JSON.stringify({ error: "Token refresh failed, please re-auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!refreshRes.ok) {
      const errorText = await refreshRes.text();
      console.error("[avito-messenger] refresh failed:", refreshRes.status, errorText);
      return new Response(JSON.stringify({ error: "Refresh failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data: { access_token?: string; refresh_token?: string; expires_in?: number };
    try {
      data = await refreshRes.json();
    } catch (err) {
      console.error("[avito-messenger] refresh response json parse failed:", err);
      return new Response(JSON.stringify({ error: "Token refresh failed, please re-auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token ?? refreshToken;
    const newExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);

    if (!newAccessToken) {
      console.error("[avito-messenger] refresh failed: no access_token in response");
      return new Response(JSON.stringify({ error: "Token refresh failed, please re-auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let newAccessEnc = newAccessToken;
    let newRefreshEnc = newRefreshToken;
    try {
      const { data: encAccess } = await supabase.rpc("encrypt_avito_token", { token: newAccessToken });
      if (encAccess) newAccessEnc = encAccess;
    } catch (err) {
      console.error("[avito-messenger] encrypt access_token failed:", err);
    }
    try {
      const { data: encRefresh } = await supabase.rpc("encrypt_avito_token", { token: newRefreshToken });
      if (encRefresh) newRefreshEnc = encRefresh;
    } catch (err) {
      console.error("[avito-messenger] encrypt refresh_token failed:", err);
    }

    const updatePayload = {
      access_token_encrypted: newAccessEnc,
      refresh_token_encrypted: newRefreshEnc,
      token_expires_at: newExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("integrations")
      .update(updatePayload)
      .eq("id", integration.id);

    if (updateError) {
      console.error("[avito-messenger] failed to save new tokens:", updateError.message);
    }

    console.log("[avito-messenger] refresh success, new expires_at:", newExpiresAt.toISOString());

    // Используем новый токен дальше (в памяти — зашифрованное значение, как в БД)
    integration.access_token_encrypted = newAccessEnc;
  }

  // Лог preview токена (расшифровка только для лога)
  try {
    const { data: decForLog } = await supabase.rpc("decrypt_avito_token", {
      encrypted_token: integration.access_token_encrypted,
    });
    console.log("[avito-messenger] using access_token (preview):", (decForLog ?? "").slice(0, 10) + "...");
  } catch {
    log("token_preview_skipped", { reason: "decrypt failed" });
  }

  // Use main integration token (after optional refresh)
  let accessToken: string | null = integration.access_token_encrypted;
  try {
    const { data: decrypted } = await supabase.rpc("decrypt_avito_token", {
      encrypted_token: accessToken,
    });
    if (decrypted) accessToken = decrypted;
  } catch (e) {
    log("decrypt_skipped", { reason: e instanceof Error ? e.message : "unknown" });
  }
  log("token_ready", { tokenLength: accessToken?.length ?? 0, tokenPreview: accessToken && accessToken.length >= 8 ? `${accessToken.slice(0, 4)}...${accessToken.slice(-4)}` : "empty", scope, hasMessengerRead, hasMessengerWrite });

  if (!accessToken) {
    log("rejected", { reason: "no access token" });
    return new Response(
      JSON.stringify({ error: "No Avito token found" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const avitoUserId = hasValidAvitoUserId ? (integration.avito_user_id as number) : null;
  log("avito_user_id", { avitoUserId });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const AVITO_FETCH_MS = 15000;
  const fetchWithTimeout = async (url: string, init: RequestInit, action: string): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AVITO_FETCH_MS);
    try {
      logAvitoRequest(init.method ?? "GET", url);
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
    if (body.action === "debug") {
      console.log("[avito-messenger-debug] start", {
        integration_id: integration.id,
        property_id: integration.property_id,
        hasValidAvitoUserId,
      });

      const scopeValid = hasMessengerRead && hasMessengerWrite;
      const tokenValid = !!accessToken;
      const tokenExpiresIso = expiresAt
        ? new Date(expiresAt).toISOString()
        : integration.token_expires_at
        ? new Date(integration.token_expires_at).toISOString()
        : null;

      let status: "ok" | "error" = "ok";
      let testRequestResult: { ok: boolean; status: number; body?: unknown } | null = null;

      if (hasValidAvitoUserId) {
        const testUrl = `${avitoBaseUrl}/messenger/v2/accounts/${avitoUserId}/chats?limit=1`;
        console.log("[avito-messenger-debug] test_request_start", { url: testUrl });
        try {
          const res = await fetchWithTimeout(testUrl, { headers }, "debug_test_chats");
          const bodyJson = await res.json().catch(() => ({}));
          testRequestResult = { ok: res.ok, status: res.status, body: bodyJson };
          if (!res.ok) {
            status = "error";
          }
          console.log("[avito-messenger-debug] test_request_done", { status: res.status, ok: res.ok });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          status = "error";
          console.error("[avito-messenger-debug] test_request_failed", message);
          testRequestResult = { ok: false, status: 0, body: { error: message } };
        }
      } else {
        status = "error";
        console.log("[avito-messenger-debug] skip_test_request_invalid_user_id", {
          avito_user_id: integration.avito_user_id,
          avito_account_id: integration.avito_account_id,
        });
      }

      const integrationDebug = {
        integration_id: integration.id,
        property_id: integration.property_id,
        scope,
        token_expires_at: tokenExpiresIso,
        avito_user_id: hasValidAvitoUserId ? avitoUserId : null,
        last_refresh_attempt: lastRefreshAttempt,
      };

      const responseBody = {
        status,
        integration: integrationDebug,
        scope_valid: scopeValid,
        token_valid: tokenValid,
        avito_api_response: testRequestResult,
      };

      console.log("[avito-messenger-debug] done", {
        status,
        scope_valid: scopeValid,
        token_valid: tokenValid,
      });

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "getChats") {
      const b = body as BodyGetChats;
      const action = "getChats";
      let url = `${avitoBaseUrl}/messenger/v2/accounts/${avitoUserId}/chats`;
      const params = new URLSearchParams();
      if (b.item_id) params.append("item_id", b.item_id);
      if (b.limit != null) params.append("limit", String(b.limit));
      if (b.offset != null) params.append("offset", String(b.offset));
      if (params.toString()) url += `?${params.toString()}`;
      log("avito_request", { action, url, method: "GET" });
      try {
        const res = await fetchWithTimeout(url, { headers }, action);
        if (res.status === 401 || res.status === 403) {
          const text = await res.clone().text().catch(() => "");
          console.error("[avito-messenger] Avito 401/403 response", { action, status: res.status, body: text });
        }
        const data = await res.json().catch(() => ({}));
        log("avito_response", { action, status: res.status, ok: res.ok, bodyPreview: JSON.stringify(data).slice(0, 200) });
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
      let url = `${avitoBaseUrl}/messenger/v2/accounts/${avitoUserId}/chats/${b.chat_id}/messages`;
      const params = new URLSearchParams();
      if (b.limit != null) params.append("limit", String(b.limit));
      if (b.offset != null) params.append("offset", String(b.offset));
      if (params.toString()) url += `?${params.toString()}`;
      log("avito_request", { action, url, method: "GET" });
      try {
        const res = await fetchWithTimeout(url, { headers }, action);
        if (res.status === 401 || res.status === 403) {
          const text = await res.clone().text().catch(() => "");
          console.error("[avito-messenger] Avito 401/403 response", { action, status: res.status, body: text });
        }
        const data = await res.json().catch(() => ({}));
        log("avito_response", { action, status: res.status, ok: res.ok, bodyPreview: JSON.stringify(data).slice(0, 200) });
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
      const url = `${avitoBaseUrl}/messenger/v2/accounts/${avitoUserId}/chats/${b.chat_id}/messages`;
      log("avito_request", { action, url, method: "POST", textLength: b.text?.length ?? 0 });
      try {
        const res = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(postBody) }, action);
        if (res.status === 401 || res.status === 403) {
          const text = await res.clone().text().catch(() => "");
          console.error("[avito-messenger] Avito 401/403 response", { action, status: res.status, body: text });
        }
        const data = await res.json().catch(() => ({}));
        log("avito_response", { action, status: res.status, ok: res.ok, bodyPreview: JSON.stringify(data).slice(0, 200) });
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
