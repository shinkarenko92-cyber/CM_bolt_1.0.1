/**
 * Verify OTP code. Checks phone_otp, on success sets profiles.phone_confirmed_at and deletes OTP row.
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
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

    const phone = typeof body?.phone === "string" ? body.phone.trim().replace(/[\s\-()]/g, "") : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!phone || !code) {
      return jsonResponse({ error: "phone and code required" }, 400);
    }

    const now = new Date().toISOString();
    const { data: row, error: selectError } = await adminClient
      .from("phone_otp")
      .select("id, code, expires_at")
      .eq("user_id", user.id)
      .eq("phone", phone)
      .maybeSingle();

    if (selectError || !row) {
      return jsonResponse({ error: "Код не найден или истёк" }, 400);
    }

    if (row.expires_at < now) {
      await adminClient.from("phone_otp").delete().eq("user_id", user.id).eq("phone", phone);
      return jsonResponse({ error: "Код истёк" }, 400);
    }

    if (row.code !== code) {
      return jsonResponse({ error: "Неверный код" }, 400);
    }

    await adminClient.from("phone_otp").delete().eq("user_id", user.id).eq("phone", phone);

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ phone_confirmed_at: now })
      .eq("id", user.id);

    if (updateError) {
      console.error("profiles phone_confirmed_at update error:", updateError);
      return jsonResponse({ error: "Failed to update profile" }, 500);
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    console.error("verify-otp error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
