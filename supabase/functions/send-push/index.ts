/**
 * send-push Edge Function
 * Sends a Web Push notification to all active subscriptions for a given user_id.
 * Uses VAPID authentication.
 *
 * Body: { user_id: string, title: string, body: string, tag?: string, url?: string }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey, x-supabase-api-version",
};

interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// ---------------------------------------------------------------------------
// Minimal VAPID Web Push implementation using Web Crypto API
// ---------------------------------------------------------------------------

function base64UrlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
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
  const claims = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: `mailto:${email}`,
  };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;

  // Import private key (raw base64url-encoded 32-byte scalar)
  const privateKeyBytes = base64UrlDecode(vapidPrivateKey);
  const publicKeyBytes = base64UrlDecode(vapidPublicKey);

  // Build JWK from raw components
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: base64UrlEncode(privateKeyBytes),
    x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
    y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
  };

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput)
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

  // Generate ephemeral key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey)
  );

  // Import client public key
  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    p256dh,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey },
    serverKeyPair.privateKey,
    256
  );

  // HKDF pseudo-random key: IKM = sharedSecret, salt = auth (per RFC 8291)
  const sharedSecretKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveBits"]);
  const prk = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: auth,
      info: new TextEncoder().encode("Content-Encoding: auth\0"),
    },
    sharedSecretKey,
    256
  );

  // Key and nonce from salt + keys context
  const context = (() => {
    const label = new TextEncoder().encode("P-256\0");
    const clientLen = new Uint8Array([(p256dh.length >> 8) & 0xff, p256dh.length & 0xff]);
    const serverLen = new Uint8Array([
      (serverPublicKeyRaw.length >> 8) & 0xff,
      serverPublicKeyRaw.length & 0xff,
    ]);
    const buf = new Uint8Array(
      label.length + 2 + p256dh.length + 2 + serverPublicKeyRaw.length
    );
    let offset = 0;
    buf.set(label, offset); offset += label.length;
    buf.set(clientLen, offset); offset += 2;
    buf.set(p256dh, offset); offset += p256dh.length;
    buf.set(serverLen, offset); offset += 2;
    buf.set(serverPublicKeyRaw, offset);
    return buf;
  })();

  const prkKey = await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]);

  const cekInfo = new Uint8Array([
    ...new TextEncoder().encode("Content-Encoding: aesgcm\0"),
    ...context,
  ]);
  const nonceInfo = new Uint8Array([
    ...new TextEncoder().encode("Content-Encoding: nonce\0"),
    ...context,
  ]);

  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: cekInfo },
    prkKey,
    128
  );
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo },
    prkKey,
    96
  );

  const cek = await crypto.subtle.importKey("raw", cekBits, "AES-GCM", false, ["encrypt"]);

  const encoded = new TextEncoder().encode(payload);
  const padded = new Uint8Array(2 + encoded.length);
  padded.set(encoded, 2);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonceBits },
    cek,
    padded
  );

  return { ciphertext, salt, serverPublicKey: serverPublicKeyRaw };
}

async function sendWebPush(
  subscription: PushSubscriptionRow,
  notificationPayload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidEmail: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const jwt = await buildVapidJwt(audience, vapidPublicKey, vapidPrivateKey, vapidEmail);

  const { ciphertext, salt, serverPublicKey } = await encryptPayload(
    notificationPayload,
    subscription.p256dh,
    subscription.auth
  );

  const body = new Uint8Array(ciphertext);

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aesgcm",
    Encryption: `salt=${base64UrlEncode(salt)}`,
    "Crypto-Key": `dh=${base64UrlEncode(serverPublicKey)};p256ecdsa=${vapidPublicKey}`,
    Authorization: `vapid t=${jwt},k=${vapidPublicKey}`,
    TTL: "86400",
  };

  const res = await fetch(subscription.endpoint, { method: "POST", headers, body });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body: text };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidEmail = Deno.env.get("VAPID_EMAIL") ?? "admin@roomi.pro";

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("send-push: VAPID keys not configured");
      return new Response(JSON.stringify({ error: "VAPID not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, title, body, tag, url } = await req.json() as PushPayload;
    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "user_id and title are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (subsError || !subs?.length) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({ title, body: body ?? "", tag: tag ?? "avito-message", url: url ?? "/?view=messages" });

    const results = await Promise.allSettled(
      subs.map((sub) => sendWebPush(sub as PushSubscriptionRow, payload, vapidPublicKey, vapidPrivateKey, vapidEmail))
    );

    let sent = 0;
    const stale: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        if (r.value.ok) {
          sent++;
        } else if (r.value.status === 404 || r.value.status === 410) {
          // Subscription expired — clean up
          stale.push((subs[i] as PushSubscriptionRow).endpoint);
        } else {
          console.error("Push failed:", r.value.status, r.value.body);
        }
      } else {
        console.error("Push error:", r.reason);
      }
    });

    // Remove stale subscriptions
    if (stale.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", stale);
    }

    return new Response(JSON.stringify({ sent, stale: stale.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-push fatal:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
