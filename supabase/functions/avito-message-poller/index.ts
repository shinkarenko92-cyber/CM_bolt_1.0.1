/**
 * avito-message-poller — server-side cron that checks Avito for new messages
 * and fires Web Push notifications when the app is closed.
 *
 * Flow:
 * 1. Fetch all active integrations with messenger:read scope
 * 2. For each integration, call Avito chats API to get unread counts
 * 3. Compare with stored `last_push_unread` on the chat row
 * 4. If Avito reports more unread messages → send Web Push directly (no nested function call)
 * 5. Update the chat's unread_count and last_push_unread in DB
 *
 * Deploy:  supabase functions deploy avito-message-poller --no-verify-jwt
 * Cron:    Set up via Supabase Dashboard -> Database -> Cron Jobs
 *          Schedule: every 2 minutes, Edge Function: avito-message-poller
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOG = "[avito-message-poller]";
const AVITO_API_BASE = "https://api.avito.ru";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey, x-supabase-api-version",
};

interface Integration {
  id: string;
  property_id: string;
  avito_user_id: string | number;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  scope: string | null;
}

interface AvitoChat {
  id: string;
  unread_count: number;
  last_message?: {
    content?: { text?: string };
    direction?: "in" | "out";
    created?: string | number;
  };
  users?: Array<{ user_id?: string; id?: number; name: string }>;
  context?: { value?: { title?: string } };
}

interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// ---------------------------------------------------------------------------
// Web Push helpers (inlined to avoid nested edge function invocation rate limit)
// ---------------------------------------------------------------------------

function base64UrlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function buildVapidJwt(
  audience: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  email: string
): Promise<string> {
  const header = { alg: "ES256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: audience, exp: now + 12 * 3600, sub: `mailto:${email}` };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;

  const privateKeyBytes = base64UrlDecode(vapidPrivateKey);
  const publicKeyBytes = base64UrlDecode(vapidPublicKey);

  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: base64UrlEncode(privateKeyBytes),
    x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
    y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
  };

  const privateKey = await crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function encryptPayload(
  payload: string,
  p256dhBase64: string,
  authBase64: string
): Promise<{ ciphertext: ArrayBuffer; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const p256dh = base64UrlDecode(p256dhBase64);
  const auth = base64UrlDecode(authBase64);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey)
  );

  const clientPublicKey = await crypto.subtle.importKey(
    "raw", p256dh, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey }, serverKeyPair.privateKey, 256
  );

  const sharedSecretKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveBits"]);
  const prk = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: auth, info: new TextEncoder().encode("Content-Encoding: auth\0") },
    sharedSecretKey, 256
  );

  const context = (() => {
    const label = new TextEncoder().encode("P-256\0");
    const clientLen = new Uint8Array([(p256dh.length >> 8) & 0xff, p256dh.length & 0xff]);
    const serverLen = new Uint8Array([(serverPublicKeyRaw.length >> 8) & 0xff, serverPublicKeyRaw.length & 0xff]);
    const buf = new Uint8Array(label.length + 2 + p256dh.length + 2 + serverPublicKeyRaw.length);
    let offset = 0;
    buf.set(label, offset); offset += label.length;
    buf.set(clientLen, offset); offset += 2;
    buf.set(p256dh, offset); offset += p256dh.length;
    buf.set(serverLen, offset); offset += 2;
    buf.set(serverPublicKeyRaw, offset);
    return buf;
  })();

  const prkKey = await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]);
  const cekInfo = new Uint8Array([...new TextEncoder().encode("Content-Encoding: aesgcm\0"), ...context]);
  const nonceInfo = new Uint8Array([...new TextEncoder().encode("Content-Encoding: nonce\0"), ...context]);

  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: cekInfo }, prkKey, 128
  );
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo }, prkKey, 96
  );

  const cek = await crypto.subtle.importKey("raw", cekBits, "AES-GCM", false, ["encrypt"]);
  const encoded = new TextEncoder().encode(payload);
  const padded = new Uint8Array(2 + encoded.length);
  padded.set(encoded, 2);

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonceBits }, cek, padded);
  return { ciphertext, salt, serverPublicKey: serverPublicKeyRaw };
}

async function sendWebPush(
  subscription: PushSubscriptionRow,
  notificationPayload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidEmail: string
): Promise<{ ok: boolean; status: number }> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await buildVapidJwt(audience, vapidPublicKey, vapidPrivateKey, vapidEmail);
  const { ciphertext, salt, serverPublicKey } = await encryptPayload(
    notificationPayload, subscription.p256dh, subscription.auth
  );

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aesgcm",
      Encryption: `salt=${base64UrlEncode(salt)}`,
      "Crypto-Key": `dh=${base64UrlEncode(serverPublicKey)};p256ecdsa=${vapidPublicKey}`,
      Authorization: `vapid t=${jwt},k=${vapidPublicKey}`,
      TTL: "86400",
    },
    body: new Uint8Array(ciphertext),
  });
  await res.text().catch(() => "");
  return { ok: res.ok, status: res.status };
}

/**
 * Send push notifications directly to all subscriptions for a user.
 * Returns number of successfully delivered pushes.
 */
async function sendPushToUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  body: string,
  tag: string,
  url: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidEmail: string
): Promise<number> {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs?.length) return 0;

  const payload = JSON.stringify({ title, body, tag, url });
  const results = await Promise.allSettled(
    subs.map((sub) => sendWebPush(sub as PushSubscriptionRow, payload, vapidPublicKey, vapidPrivateKey, vapidEmail))
  );

  const stale: string[] = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      if (r.value.ok) {
        sent++;
      } else if (r.value.status === 404 || r.value.status === 410) {
        stale.push((subs[i] as PushSubscriptionRow).endpoint);
      }
    }
  });

  if (stale.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", stale);
  }

  return sent;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidEmail = Deno.env.get("VAPID_EMAIL") ?? "admin@roomi.pro";

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error(`${LOG} VAPID keys not configured`);
    return new Response(JSON.stringify({ error: "VAPID not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Get all active integrations with messenger:read scope
    const { data: integrations, error: intErr } = await supabase
      .from("integrations")
      .select("id, property_id, avito_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, scope")
      .eq("platform", "avito")
      .eq("is_active", true)
      .like("scope", "%messenger:read%");

    if (intErr || !integrations?.length) {
      console.log(`${LOG} No messenger integrations found`, intErr?.message);
      return new Response(JSON.stringify({ checked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let pushesSent = 0;
    let chatsChecked = 0;

    for (const integration of integrations as Integration[]) {
      const avitoUserId = Number(integration.avito_user_id);
      if (!Number.isFinite(avitoUserId) || avitoUserId <= 0) continue;

      const accessToken = await getAccessToken(supabase, integration);
      if (!accessToken) {
        console.error(`${LOG} No token for integration ${integration.id}`);
        continue;
      }

      const { data: property } = await supabase
        .from("properties")
        .select("owner_id")
        .eq("id", integration.property_id)
        .single();
      if (!property?.owner_id) continue;

      // 2. Call Avito chats API
      let avitoChats: AvitoChat[];
      try {
        const res = await fetch(
          `${AVITO_API_BASE}/messenger/v2/accounts/${avitoUserId}/chats?limit=50`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) {
          console.error(`${LOG} Avito chats API ${res.status} for integration ${integration.id}`);
          continue;
        }
        const data = await res.json();
        avitoChats = data.chats ?? [];
      } catch (err) {
        console.error(`${LOG} Avito fetch error:`, err);
        continue;
      }

      // 3. Get existing chats from DB
      const { data: dbChats } = await supabase
        .from("chats")
        .select("id, avito_chat_id, unread_count, last_push_unread")
        .eq("owner_id", property.owner_id)
        .eq("integration_id", integration.id);

      const dbChatMap = new Map(
        (dbChats ?? []).map((c: { avito_chat_id: string; unread_count: number; last_push_unread?: number; id: string }) => [
          c.avito_chat_id,
          c,
        ])
      );

      // 4. Check for new unread messages
      for (const avitoChat of avitoChats) {
        chatsChecked++;

        const dbChat = dbChatMap.get(avitoChat.id);
        const lastPushUnread = (dbChat as { last_push_unread?: number } | undefined)?.last_push_unread ?? 0;

        // If user read all messages externally (Avito app/web) — reset last_push_unread
        // so the next incoming message correctly triggers a push
        if (avitoChat.unread_count <= 0) {
          if (dbChat && lastPushUnread > 0) {
            await supabase.from("chats").update({ last_push_unread: 0 }).eq("id", (dbChat as { id: string }).id);
          }
          continue;
        }

        // Only notify if unread count increased since last push
        if (avitoChat.unread_count <= lastPushUnread) continue;

        const ownerIdStr = String(avitoUserId);
        const contact = avitoChat.users?.find(
          (u) => String(u.user_id ?? u.id ?? "") !== ownerIdStr
        );
        const contactName = contact?.name ?? "Avito";
        const listingTitle = avitoChat.context?.value?.title ?? null;

        const lastMsg = avitoChat.last_message;
        const msgBody =
          lastMsg?.direction === "in"
            ? lastMsg?.content?.text ?? "Новое сообщение"
            : "Новое сообщение";

        const title = listingTitle ? `${contactName} · ${listingTitle}` : contactName;

        // 5. Send push directly (no nested function invocation)
        const sent = await sendPushToUser(
          supabase,
          property.owner_id,
          title,
          msgBody,
          `avito-msg-${avitoChat.id}`,
          "/?view=messages",
          vapidPublicKey,
          vapidPrivateKey,
          vapidEmail
        );

        if (sent > 0) {
          pushesSent++;
          console.log(`${LOG} push sent for chat ${avitoChat.id} to user ${property.owner_id}`);
        }

        // Update last_push_unread so we don't re-notify for the same batch
        if (dbChat) {
          await supabase
            .from("chats")
            .update({
              unread_count: avitoChat.unread_count,
              last_push_unread: avitoChat.unread_count,
            })
            .eq("id", (dbChat as { id: string }).id);
        }
      }
    }

    const result = {
      integrations: integrations.length,
      chats_checked: chatsChecked,
      pushes_sent: pushesSent,
    };
    console.log(`${LOG} done`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`${LOG} fatal:`, error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Decrypts and optionally refreshes the Avito access token for an integration.
 */
async function getAccessToken(
  supabase: ReturnType<typeof createClient>,
  integration: Integration
): Promise<string | null> {
  let tokenExpires = integration.token_expires_at;
  if (tokenExpires && typeof tokenExpires === "string" && !tokenExpires.includes("Z")) {
    tokenExpires += "Z";
  }
  const expiresMs = tokenExpires ? new Date(tokenExpires).getTime() : 0;
  const needsRefresh = !tokenExpires || Number.isNaN(expiresMs) || expiresMs < Date.now() + 5 * 60 * 1000;

  if (needsRefresh && integration.refresh_token_encrypted) {
    try {
      const { data: refreshToken } = await supabase.rpc("decrypt_avito_token", {
        encrypted_token: integration.refresh_token_encrypted,
      });
      if (!refreshToken) return null;

      const clientId = Deno.env.get("AVITO_CLIENT_ID") ?? "";
      const clientSecret = Deno.env.get("AVITO_CLIENT_SECRET") ?? "";

      const res = await fetch(`${AVITO_API_BASE}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!res.ok) {
        console.error(`${LOG} token refresh failed: ${res.status}`);
      } else {
        const data = await res.json();
        if (data.access_token) {
          const newExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
          const { data: encAccess } = await supabase.rpc("encrypt_avito_token", { token: data.access_token });
          const { data: encRefresh } = await supabase.rpc("encrypt_avito_token", {
            token: data.refresh_token ?? refreshToken,
          });
          await supabase
            .from("integrations")
            .update({
              access_token_encrypted: encAccess ?? data.access_token,
              refresh_token_encrypted: encRefresh ?? integration.refresh_token_encrypted,
              token_expires_at: newExpiresAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", integration.id);
          return data.access_token;
        }
      }
    } catch (err) {
      console.error(`${LOG} refresh error:`, err);
    }
  }

  try {
    const { data: decrypted } = await supabase.rpc("decrypt_avito_token", {
      encrypted_token: integration.access_token_encrypted,
    });
    return decrypted ?? null;
  } catch {
    return null;
  }
}
