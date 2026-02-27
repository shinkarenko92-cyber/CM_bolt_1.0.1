/**
 * Avito OAuth Callback Edge Function
 * Handles OAuth callback: exchange code for token, get account_id, save to integrations
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const AVITO_API_BASE = "https://api.avito.ru";
const LOG_PREFIX = "[avito-oauth]";
const MIN_CLIENT_ID_LENGTH = 20;

function getAvitoBaseUrl(env: { AVITO_BASE_URL?: string }): string {
  const base = env.AVITO_BASE_URL?.trim();
  if (base) {
    if (!base.includes("api.avito.ru")) {
      console.warn(`${LOG_PREFIX} AVITO_BASE_URL не содержит api.avito.ru. Ожидается https://api.avito.ru`, { value: base });
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Причина ошибки 422 для клиента */
export type Avito422Reason = "no_avito_integration" | "scope_missing";

/** Причина ошибки 400/401 при обмене кода на токен */
export type AvitoCredentialReason = "invalid_credentials" | "invalid_redirect_uri";

/**
 * Типизированная ошибка Avito OAuth callback.
 * @property code - HTTP-код ответа (400, 401, 422, 500)
 * @property message - Сообщение для логов/клиента
 * @property reason - Для 422: Avito422Reason; для 400/401: AvitoCredentialReason
 */
export class AvitoError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly reason?: Avito422Reason | AvitoCredentialReason
  ) {
    super(message);
    this.name = "AvitoError";
    Object.setPrototypeOf(this, AvitoError.prototype);
  }
}

// --- Zod schemas ---

const OAuthCallbackBodySchema = z.object({
  code: z.string().min(1, "Missing authorization code"),
  state: z.string().min(1, "Missing state parameter"),
  redirect_uri: z.string().url().optional(),
});

const StateDataSchema = z.object({
  type: z.string().optional(),
  property_id: z.string().optional(),
  integration_id: z.union([z.string(), z.null()]).optional(),
  timestamp: z.number().optional(),
  ts: z.number().optional(),
});

const EnvSchema = z.object({
  SUPABASE_URL: z.string().min(1, "SUPABASE_URL is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  SUPABASE_ANON_KEY: z.string(),
  AVITO_CLIENT_ID: z.string().min(MIN_CLIENT_ID_LENGTH, `AVITO_CLIENT_ID должен быть не короче ${MIN_CLIENT_ID_LENGTH} символов`),
  AVITO_CLIENT_SECRET: z.string().min(1, "AVITO_CLIENT_SECRET is required"),
  AVITO_BASE_URL: z.string().optional(),
});

type OAuthCallbackBody = z.infer<typeof OAuthCallbackBodySchema>;
type StateData = z.infer<typeof StateDataSchema>;
type Env = z.infer<typeof EnvSchema>;

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

interface AvitoUserInfoResponse {
  id?: number;
  user_id?: number;
  account_id?: number | string;
}

/**
 * Парсит и валидирует state (base64 или plain JSON).
 * @param state - Строка state из OAuth callback (base64-encoded JSON или plain JSON)
 * @returns StateData — распарсенные поля type, property_id, integration_id, timestamp
 * @throws AvitoError 400 при невалидном state
 */
function parseState(state: string): StateData {
  try {
    try {
      return StateDataSchema.parse(JSON.parse(atob(state)));
    } catch {
      return StateDataSchema.parse(JSON.parse(state));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG_PREFIX} Failed to parse state:`, msg);
    throw new AvitoError("Invalid state parameter", 400);
  }
}

/**
 * Проверяет, что scope содержит права messenger (для messenger_auth).
 * @param scope - Строка scope из ответа Avito token
 * @returns void
 * @throws AvitoError с reason 'scope_missing' при отсутствии messenger в scope
 */
function checkMessengerScope(scope: string | undefined): void {
  const required = "messenger";
  const scopes = (scope ?? "").split(/\s+/).filter(Boolean);
  const hasMessenger = scopes.some((s) => s.toLowerCase().includes(required));
  if (!hasMessenger) {
    console.log(`${LOG_PREFIX} scope_missing: scope does not include messenger`, { scope });
    throw new AvitoError("Scope does not include messenger", 422, "scope_missing");
  }
}

/**
 * Обменивает authorization code на access_token и refresh_token в Avito API.
 * @param code - Код авторизации от Avito
 * @param redirectUri - redirect_uri, использованный при запросе кода
 * @param clientId - AVITO_CLIENT_ID
 * @param clientSecret - AVITO_CLIENT_SECRET
 * @returns Promise с данными токена (access_token, expires_in, refresh_token, scope)
 * @throws AvitoError при ошибке API Avito или сети/парсинга
 */
async function refreshTokens(
  baseUrl: string,
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<AvitoTokenResponse> {
  console.log(`${LOG_PREFIX} Exchanging code for token`);
  const url = `${baseUrl}/token`;
  logAvitoRequest("POST", url, clientSecret);
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG_PREFIX} Token exchange network error:`, msg);
    throw new AvitoError(`Сетевая ошибка при обмене кода: ${msg}`, 500);
  }

  if (!tokenResponse.ok) {
    let errorMessage = `Token exchange failed (${tokenResponse.status})`;
    let reason: AvitoCredentialReason | undefined;
    try {
      const errorData = (await tokenResponse.json()) as AvitoErrorResponse;
      if (errorData.error) {
        errorMessage = errorData.error_description ?? `Avito API error: ${errorData.error}`;
        const desc = (errorData.error_description ?? "").toLowerCase();
        const err = (errorData.error ?? "").toLowerCase();
        if (
          desc.includes("redirect_uri") ||
          err.includes("redirect_uri") ||
          desc.includes("redirect") ||
          err.includes("redirect")
        ) {
          reason = "invalid_redirect_uri";
        } else {
          reason = "invalid_credentials";
        }
      }
    } catch {
      const text = await tokenResponse.text().catch(() => "Unable to read error");
      errorMessage = text || errorMessage;
      if (tokenResponse.status === 400 || tokenResponse.status === 401) {
        reason = "invalid_credentials";
      }
    }
    console.log(`${LOG_PREFIX} Token exchange error:`, { status: tokenResponse.status, errorMessage, reason });
    throw new AvitoError(errorMessage, tokenResponse.status, reason);
  }

  let tokenData: AvitoTokenResponse;
  try {
    tokenData = (await tokenResponse.json()) as AvitoTokenResponse;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG_PREFIX} Token response parse error:`, msg);
    throw new AvitoError(`Ошибка разбора ответа Avito: ${msg}`, 500);
  }
  console.log(`${LOG_PREFIX} Token exchange successful`, {
    hasAccessToken: !!tokenData.access_token,
    hasRefreshToken: !!tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
  });
  return tokenData;
}

/**
 * Пытается получить числовой avito_user_id по access_token через Avito API.
 * Используется только для логов/предупреждений и валидации данных Messenger, не блокирует основной OAuth flow.
 */
async function fetchAvitoUserId(baseUrl: string, accessToken: string): Promise<number | null> {
  const headers: HeadersInit = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const tryFetch = async (path: string, retries = 3): Promise<number | null> => {
    const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
    for (let attempt = 0; attempt < retries; attempt++) {
      logAvitoRequest("GET", url);
      const res = await fetch(url, { method: "GET", headers });
      if (res.status === 401) {
        console.warn(`${LOG_PREFIX} Не удалось проверить права (401)`, { path: url });
        return null;
      }
      if ((res.status === 429 || (res.status >= 500 && res.status < 600)) && attempt < retries - 1) {
        const waitMs = Math.pow(2, attempt) * 1000;
        console.log(`${LOG_PREFIX} retry ${res.status} in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.log(`${LOG_PREFIX} Avito user info error`, { status: res.status, body: text });
        return null;
      }
      const data = (await res.json().catch(() => ({}))) as AvitoUserInfoResponse;
      const candidate = typeof data.user_id === "number" ? data.user_id : typeof data.id === "number" ? data.id : null;
      return candidate && candidate > 0 ? candidate : null;
    }
    return null;
  };

  // /web/1/oauth/info — не критичен для Messenger; avito_user_id можно получить из /user/info или /user.
  // При 400/401 не блокируем flow, только логируем.
  const oauthInfoUrl = `${baseUrl}/web/1/oauth/info`;
  try {
    console.log("[avito] oauth/info", { url: oauthInfoUrl, hasToken: !!accessToken });
    logAvitoRequest("GET", oauthInfoUrl);
    const res = await fetch(oauthInfoUrl, { method: "GET", headers });
    console.log("[avito] oauth/info", { url: oauthInfoUrl, status: res.status, hasToken: !!accessToken });
    if (res.status === 400 || res.status === 401) {
      const text = await res.text().catch(() => "");
      console.warn(`${LOG_PREFIX} /web/1/oauth/info ${res.status} — не блокируем OAuth`, { body: text });
      // continue to try /user/info and /user below
    } else if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as AvitoUserInfoResponse;
      const candidate = typeof data.user_id === "number" ? data.user_id : typeof data.id === "number" ? data.id : null;
      if (candidate && candidate > 0) return candidate;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG_PREFIX} /web/1/oauth/info fetch failed`, msg);
  }

  try {
    const fromInfo = await tryFetch("/user/info");
    if (fromInfo && fromInfo > 0) return fromInfo;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG_PREFIX} /user/info fetch failed`, msg);
  }

  try {
    const fromUser = await tryFetch("/user");
    if (fromUser && fromUser > 0) return fromUser;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG_PREFIX} /user fetch failed`, msg);
  }

  return null;
}

/**
 * Находит integration_id для messenger_auth: по state (с проверкой владельца) или fallback — первая Avito-интеграция пользователя.
 * @param supabase - Supabase client (service role)
 * @param userId - ID пользователя (owner)
 * @param integrationIdFromState - integration_id из state или null
 * @returns Promise с ID интеграции или null, если не найдена
 * @throws AvitoError при ошибке запросов к БД
 */
async function handleFallbackIntegration(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  integrationIdFromState: string | null
): Promise<string | null> {
  let targetIntegrationId: string | null = null;

  try {
    if (integrationIdFromState) {
      const { data: integrationRow, error: intErr } = await supabase
        .from("integrations")
        .select("id, property_id")
        .eq("id", integrationIdFromState)
        .eq("platform", "avito")
        .maybeSingle();

      if (intErr) {
        console.log(`${LOG_PREFIX} handleFallbackIntegration integration fetch error:`, intErr.message);
        throw new AvitoError(`Ошибка поиска интеграции: ${intErr.message}`, 500);
      }

      if (integrationRow?.property_id) {
        const { data: propertyRow, error: propErr } = await supabase
          .from("properties")
          .select("id")
          .eq("id", integrationRow.property_id)
          .eq("owner_id", userId)
          .maybeSingle();
        if (propErr) {
          console.log(`${LOG_PREFIX} handleFallbackIntegration property fetch error:`, propErr.message);
          throw new AvitoError(`Ошибка проверки объекта: ${propErr.message}`, 500);
        }
        if (propertyRow) {
          targetIntegrationId = integrationRow.id;
          console.log(`${LOG_PREFIX} messenger_auth_target source=state_ownership_ok target_id=${targetIntegrationId}`);
        }
      }
      if (!targetIntegrationId) {
        console.log(`${LOG_PREFIX} messenger_auth_state_invalid integration_id=${integrationIdFromState} reason=not_found_or_not_owner`);
      }
    }

    if (!targetIntegrationId) {
      const { data: userProperties, error: propsErr } = await supabase
        .from("properties")
        .select("id")
        .eq("owner_id", userId);
      if (propsErr) {
        console.log(`${LOG_PREFIX} handleFallbackIntegration user properties error:`, propsErr.message);
        throw new AvitoError(`Ошибка загрузки объектов: ${propsErr.message}`, 500);
      }
      const propertyIds = (userProperties ?? []).map((p: { id: string }) => p.id);
      if (propertyIds.length > 0) {
        const { data: firstIntegration, error: firstErr } = await supabase
          .from("integrations")
          .select("id")
          .eq("platform", "avito")
          .in("property_id", propertyIds)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (firstErr) {
          console.log(`${LOG_PREFIX} handleFallbackIntegration first integration error:`, firstErr.message);
          throw new AvitoError(`Ошибка поиска интеграции: ${firstErr.message}`, 500);
        }
        if (firstIntegration?.id) {
          targetIntegrationId = firstIntegration.id;
          console.log(`${LOG_PREFIX} messenger_auth_target source=fallback_first_by_created_at target_id=${targetIntegrationId}`);
        }
      }
    }
  } catch (e) {
    if (e instanceof AvitoError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG_PREFIX} handleFallbackIntegration unexpected error:`, msg);
    throw new AvitoError(`Ошибка при поиске интеграции: ${msg}`, 500);
  }

  return targetIntegrationId;
}

/**
 * Главный обработчик OAuth callback: валидация, обмен кода на токен, сохранение в integrations (или расширение scope для messenger).
 * @param req - Входящий Request (JSON body: code, state, redirect_uri?)
 * @param env - Валидированные переменные окружения (Supabase URL/keys, Avito client credentials)
 * @returns Promise<Response> с CORS и JSON телом { success: true } или { success: true, isMessengerAuth: true }
 * @throws AvitoError при ошибках валидации (400), авторизации (401), бизнес-логики (422), сервера (500)
 */
async function handleOAuthCallback(req: Request, env: Env): Promise<Response> {
  try {
    return await handleOAuthCallbackImpl(req, env);
  } catch (e) {
    if (e instanceof AvitoError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG_PREFIX} handleOAuthCallback unexpected error:`, msg, e instanceof Error ? e.stack : "");
    throw new AvitoError(`Внутренняя ошибка: ${msg}`, 500);
  }
}

/**
 * Внутренняя реализация OAuth callback (вызывается из handleOAuthCallback с обёрткой try/catch).
 * @param req - Входящий Request
 * @param env - Env
 * @returns Promise<Response>
 */
async function handleOAuthCallbackImpl(req: Request, env: Env): Promise<Response> {
  const { code, state, redirect_uri } = await parseRequestBody(req);

  const stateData = parseState(state);
  const isMessengerAuth = stateData.type === "messenger_auth";

  if (!isMessengerAuth && !stateData.property_id && !stateData.integration_id) {
    throw new AvitoError("Invalid state: property_id or integration_id not found", 400);
  }

  const propertyId = stateData.property_id;
  const integrationIdFromState = stateData.integration_id && String(stateData.integration_id).trim() ? stateData.integration_id : null;
  const origin = new URL(req.url).origin;
  const redirectUri = redirect_uri ?? (isMessengerAuth ? "https://app.roomi.pro/auth/avito-callback" : `${origin}/auth/avito-callback`);

  const clientId = env.AVITO_CLIENT_ID;
  const clientSecret = env.AVITO_CLIENT_SECRET;

  const baseUrl = getAvitoBaseUrl(env);
  console.log(`${LOG_PREFIX} Processing OAuth callback`, { propertyId, hasCode: !!code, codeLength: code.length, redirectUri });

  const tokenData = await refreshTokens(baseUrl, code, redirectUri, clientId, clientSecret);

  const avitoUserId = await fetchAvitoUserId(baseUrl, tokenData.access_token).catch(() => null);
  if (avitoUserId && avitoUserId > 0) {
    console.log(`${LOG_PREFIX} Resolved avito_user_id from Avito API`, { avitoUserId });
  } else {
    console.log(`${LOG_PREFIX} avito_user_id_not_resolved`, { scope: tokenData.scope ?? null });
  }

  const expiresInSeconds =
    tokenData.expires_in && typeof tokenData.expires_in === "number" && tokenData.expires_in > 0 ? tokenData.expires_in : 3600;
  const tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  if (isMessengerAuth) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log(`${LOG_PREFIX} messenger_auth_rejected reason=no_bearer_token`);
      throw new AvitoError("Unauthorized", 401);
    }
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !user) {
      console.log(`${LOG_PREFIX} messenger_auth_rejected reason=user_resolve_failed error=${userError?.message ?? ""}`);
      throw new AvitoError("Unauthorized", 401);
    }

    console.log(`${LOG_PREFIX} messenger_auth_state integration_id_from_state=${integrationIdFromState} user_id=${user.id}`);

    checkMessengerScope(tokenData.scope);

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const targetIntegrationId = await handleFallbackIntegration(supabase, user.id, integrationIdFromState);

    if (!targetIntegrationId) {
      console.log(`${LOG_PREFIX} messenger_auth_failed reason=no_avito_integration user_id=${user.id}`);
      throw new AvitoError("Нет подходящей интеграции Avito для подключения чатов.", 422, "no_avito_integration");
    }

    const updateData: Record<string, unknown> = {
      access_token_encrypted: tokenData.access_token,
      token_expires_at: tokenExpiresAt.toISOString(),
      scope: tokenData.scope ?? "user:read short_term_rent:read short_term_rent:write messenger:read messenger:write",
      is_active: true,
      is_enabled: true,
    };
    if (tokenData.refresh_token) {
      updateData.refresh_token_encrypted = tokenData.refresh_token;
    }

    const { error: updateError } = await supabase.from("integrations").update(updateData).eq("id", targetIntegrationId);

    if (updateError) {
      console.log(`${LOG_PREFIX} messenger_auth_update_error target_id=${targetIntegrationId} error=${updateError.message}`);
      throw new AvitoError(`Ошибка обновления интеграции: ${updateError.message}`, 500);
    }
    console.log(`${LOG_PREFIX} messenger_auth_success target_id=${targetIntegrationId}`, {
      avitoUserId,
      avitoUserIdMissing: !avitoUserId,
    });
    return jsonResponse({ success: true, isMessengerAuth: true, avitoUserId, avitoUserIdMissing: !avitoUserId });
  }

  // Main OAuth flow: save to integrations
  console.log(`${LOG_PREFIX} Saving token to integration`, {
    propertyId,
    hasAccessToken: !!tokenData.access_token,
    hasRefreshToken: !!tokenData.refresh_token,
    expiresIn: expiresInSeconds,
    tokenExpiresAt: tokenExpiresAt.toISOString(),
  });

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  let integrationId: string | undefined = integrationIdFromState ?? undefined;

  if (!integrationId && propertyId) {
    const { data: existingIntegration, error: findError } = await supabase
      .from("integrations")
      .select("id")
      .eq("property_id", propertyId)
      .eq("platform", "avito")
      .maybeSingle();

    if (findError && findError.code !== "PGRST116") {
      console.log(`${LOG_PREFIX} Error finding integration:`, findError.code, findError.message);
      throw new AvitoError(`Ошибка при поиске интеграции: ${findError.message}`, 500);
    }
    integrationId = existingIntegration?.id;
  }

  const updateData: Record<string, unknown> = {
    access_token_encrypted: tokenData.access_token,
    token_expires_at: tokenExpiresAt.toISOString(),
    scope: tokenData.scope ?? null,
    is_active: true,
    is_enabled: true,
  };
  if (tokenData.refresh_token) {
    updateData.refresh_token_encrypted = tokenData.refresh_token;
  }

  let integration: { id: string; property_id: string; platform: string; is_active: boolean } | null = null;
  let saveError: { message: string } | null = null;

  if (integrationId) {
    console.log(`${LOG_PREFIX} Updating existing integration`, { integrationId });
    const { data, error } = await supabase
      .from("integrations")
      .update(updateData)
      .eq("id", integrationId)
      .select("id, property_id, platform, is_active")
      .single();
    integration = data;
    saveError = error;
  } else if (propertyId) {
    console.log(`${LOG_PREFIX} Creating new integration`);
    const { data, error } = await supabase
      .from("integrations")
      .insert({ property_id: propertyId, platform: "avito", ...updateData })
      .select("id, property_id, platform, is_active")
      .single();
    integration = data;
    saveError = error;
  } else {
    throw new AvitoError("Cannot save integration: neither integration_id nor property_id provided", 400);
  }

  if (saveError) {
    console.log(`${LOG_PREFIX} Error saving integration:`, saveError.message);
    throw new AvitoError(`Ошибка при сохранении интеграции: ${saveError.message}`, 500);
  }
  if (!integration) {
    console.log(`${LOG_PREFIX} Integration not returned after save`, { integrationId, propertyId });
    throw new AvitoError("Интеграция не была сохранена", 500);
  }

  const { data: verifyIntegration, error: verifyError } = await supabase
    .from("integrations")
    .select("id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("id", integration.id)
    .single();

  if (verifyError) {
    console.log(`${LOG_PREFIX} Failed to verify token save`, verifyError.message);
  } else {
    console.log(`${LOG_PREFIX} Token save verified`, {
      integration_id: integration.id,
      hasAccessToken: !!verifyIntegration?.access_token_encrypted,
      hasRefreshToken: !!verifyIntegration?.refresh_token_encrypted,
    });
  }

  console.log(`${LOG_PREFIX} Tokens saved for integration`, integration.id, {
    avitoUserId,
    avitoUserIdMissing: !avitoUserId,
  });
  return jsonResponse({ success: true, avitoUserId, avitoUserIdMissing: !avitoUserId });
}

/**
 * Парсит и валидирует тело запроса (JSON) через Zod.
 * @param req - Входящий Request с JSON body
 * @returns Promise с валидированными полями { code, state, redirect_uri? }
 * @throws AvitoError 400 при невалидном JSON или полях
 */
async function parseRequestBody(req: Request): Promise<OAuthCallbackBody> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG_PREFIX} Failed to parse JSON:`, msg);
    throw new AvitoError("Invalid JSON in request body", 400);
  }
  const result = OAuthCallbackBodySchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.flatten().fieldErrors;
    const msg = first.code?.[0] ?? first.state?.[0] ?? result.error.message;
    console.log(`${LOG_PREFIX} Validation failed:`, msg);
    throw new AvitoError(String(msg), 400);
  }
  return result.data;
}

/**
 * Создаёт JSON Response с CORS-заголовками.
 * @param body - Объект для JSON.stringify
 * @param status - HTTP-статус (по умолчанию 200)
 * @returns Response с Content-Type application/json и corsHeaders
 */
function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Преобразует пойманную ошибку в HTTP Response.
 * Для AvitoError с code 422 возвращает reason: Avito422Reason; для 400/401 — reason: AvitoCredentialReason.
 * @param e - Пойманное значение (AvitoError или иное)
 * @returns Response с JSON { error: string, reason?: string } и соответствующим status
 */
function errorToResponse(e: unknown): Response {
  if (e instanceof AvitoError) {
    const body: { error: string; reason?: string } = { error: e.message };
    if (e.reason && (e.code === 422 || e.code === 400 || e.code === 401)) {
      body.reason = e.reason;
    }
    return jsonResponse(body, e.code);
  }
  const message = e instanceof Error ? e.message : String(e);
  console.log(`${LOG_PREFIX} Unexpected error:`, message, e instanceof Error ? e.stack : "");
  return jsonResponse({ error: message || "Внутренняя ошибка сервера" }, 500);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const rawEnv = {
      SUPABASE_URL: Deno.env.get("SUPABASE_URL") ?? "",
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      AVITO_CLIENT_ID: Deno.env.get("AVITO_CLIENT_ID") ?? "",
      AVITO_CLIENT_SECRET: Deno.env.get("AVITO_CLIENT_SECRET") ?? "",
      AVITO_BASE_URL: Deno.env.get("AVITO_BASE_URL") ?? undefined,
    };
    const envResult = EnvSchema.safeParse(rawEnv);
    if (!envResult.success) {
      const msg = envResult.error.flatten().formErrors[0] ?? envResult.error.message;
      console.log(`${LOG_PREFIX} Env validation failed:`, msg);
      throw new AvitoError(
        msg.includes("AVITO_CLIENT") ? "AVITO_CLIENT_ID and AVITO_CLIENT_SECRET must be set in Supabase Secrets" : msg,
        500
      );
    }
    const env = envResult.data;

    return await handleOAuthCallback(req, env);
  } catch (e) {
    return errorToResponse(e);
  }
});
