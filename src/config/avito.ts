/**
 * Avito API configuration (https://developers.avito.ru)
 * BASE_API_URL для всех запросов к API; OAuth authorize — отдельный URL.
 */

/** Базовый URL Avito API: token, user info, messenger, items */
export const AVITO_API_BASE = "https://api.avito.ru";

/** URL страницы авторизации OAuth (редирект пользователя в браузере) */
export const AVITO_OAUTH_AUTHORIZE_URL = "https://avito.ru/oauth";

/** OAuth user info (если поддерживается Avito) */
export const AVITO_OAUTH_INFO_URL = `${AVITO_API_BASE}/web/1/oauth/info`;

const MIN_CLIENT_ID_LENGTH = 20;

/**
 * Возвращает базовый URL для API. Если задан VITE_AVITO_BASE_URL и он не содержит api.avito.ru — warning в консоль.
 */
export function getAvitoApiBase(): string {
  const custom = import.meta.env?.VITE_AVITO_BASE_URL as string | undefined;
  if (custom && typeof custom === "string" && custom.trim()) {
    if (!custom.includes("api.avito.ru")) {
      console.warn("[avito] VITE_AVITO_BASE_URL не содержит api.avito.ru. Ожидается https://api.avito.ru.", {
        value: custom,
      });
    }
    return custom.trim().replace(/\/$/, "");
  }
  return AVITO_API_BASE;
}

/**
 * Валидация AVITO_CLIENT_ID: при инициализации должен быть не короче 20 символов.
 */
export function validateAvitoClientId(clientId: string | undefined): void {
  if (!clientId || typeof clientId !== "string") {
    throw new Error("Invalid AVITO_CLIENT_ID: check your .env file");
  }
  if (clientId.length < MIN_CLIENT_ID_LENGTH) {
    throw new Error("Invalid AVITO_CLIENT_ID: check your .env file");
  }
}

/**
 * Валидация redirect_uri: должен начинаться с https://.
 */
export function validateAvitoRedirectUri(redirectUri: string | undefined): void {
  if (!redirectUri || typeof redirectUri !== "string") {
    throw new Error("AVITO_REDIRECT_URI must be https");
  }
  if (!redirectUri.startsWith("https://")) {
    throw new Error("AVITO_REDIRECT_URI must be https");
  }
}

export type AvitoConfigValidation = { valid: true } | { valid: false; error: string };

/**
 * Предполётная проверка конфига Avito (client_id и redirect_uri). Не бросает исключение.
 */
export function getAvitoConfigValidation(): AvitoConfigValidation {
  const clientId = import.meta.env?.VITE_AVITO_CLIENT_ID as string | undefined;
  if (!clientId || clientId.length < MIN_CLIENT_ID_LENGTH) {
    return { valid: false, error: "Неверный Client ID. Проверьте настройки интеграции в админке" };
  }
  const redirectUri = import.meta.env?.VITE_AVITO_REDIRECT_URI as string | undefined;
  const uri = redirectUri?.trim() || "https://app.roomi.pro/auth/avito-callback";
  if (!uri.startsWith("https://")) {
    return { valid: false, error: "AVITO_REDIRECT_URI должен начинаться с https://" };
  }
  return { valid: true };
}
