/**
 * Verify OTP for phone login (no auth required).
 * Body: { phone, code }
 * On success: find or create user by phone, generate magic link, return token_hash for client verifyOtp.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s\-()]/g, "").replace(/^\+7/, "7").replace(/^8/, "7");
}

function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse({ error: "Missing Supabase configuration" }, 500);
    }

    const contentType = req.headers.get("Content-Type") || "";
    if (!req.body || !contentType.includes("application/json")) {
      return jsonResponse({ error: "Content-Type: application/json and request body required" }, 400);
    }

    let body: { phone?: string; code?: string };
    try {
      body = (await req.json()) as { phone?: string; code?: string };
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const rawPhone = typeof body?.phone === "string" ? body.phone : "";
    const phone = normalizePhone(rawPhone);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!phone || !code) {
      return jsonResponse({ error: "phone and code required" }, 400);
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const now = new Date().toISOString();
    const { data: row, error: selectError } = await adminClient
      .from("login_otp")
      .select("id, code, expires_at")
      .eq("phone", phone)
      .maybeSingle();

    if (selectError || !row) {
      return jsonResponse({ error: "Код не найден или истёк" }, 400);
    }
    if (row.expires_at < now) {
      await adminClient.from("login_otp").delete().eq("phone", phone);
      return jsonResponse({ error: "Код истёк" }, 400);
    }
    if (row.code !== code) {
      return jsonResponse({ error: "Неверный код" }, 400);
    }

    await adminClient.from("login_otp").delete().eq("phone", phone);

    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id, email")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();

    let email: string;
    if (existingProfile?.email) {
      email = existingProfile.email;
    } else {
      email = `${phone}@phone.roomi.local`;
      const password = randomPassword();
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError || !newUser?.user) {
        console.error("createUser error:", createError);
        return jsonResponse({ error: "Failed to create user" }, 500);
      }
      const demoEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error: profileError } = await adminClient.from("profiles").insert({
        id: newUser.user.id,
        email,
        phone,
        role: "user",
        is_active: true,
        subscription_tier: "demo",
        subscription_expires_at: demoEndsAt,
      });
      if (profileError) {
        console.error("profile insert error:", profileError);
      }
    }

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !linkData?.properties) {
      console.error("generateLink error:", linkError);
      return jsonResponse({ error: "Failed to generate session" }, 500);
    }

    const hashedToken = (linkData.properties as { hashed_token?: string }).hashed_token;
    const actionLink = (linkData.properties as { action_link?: string }).action_link;
    let tokenHash = hashedToken;
    if (!tokenHash && actionLink) {
      try {
        const u = new URL(actionLink);
        tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
      } catch {
        // ignore
      }
    }
    if (!tokenHash) {
      return jsonResponse({ error: "Failed to get session token" }, 500);
    }

    return jsonResponse({ token_hash: tokenHash }, 200);
  } catch (error) {
    console.error("verify-login-otp error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
