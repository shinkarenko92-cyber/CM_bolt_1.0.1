/**
 * Send OTP (stub: no real SMS). Generates code, stores in phone_otp, returns success.
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

function generateCode(length = 6): string {
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
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

    let body: { phone?: string };
    try {
      body = (await req.json()) as { phone?: string };
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const phone = typeof body?.phone === "string" ? body.phone.trim().replace(/[\s\-()]/g, "") : "";
    if (!phone || phone.length < 9) {
      return jsonResponse({ error: "Valid phone number required" }, 400);
    }

    const code = generateCode(6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await adminClient.from("phone_otp").delete().eq("user_id", user.id).eq("phone", phone);
    const { error: insertError } = await adminClient.from("phone_otp").insert({
      user_id: user.id,
      phone,
      code,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("phone_otp insert error:", insertError);
      return jsonResponse({ error: "Failed to store OTP" }, 500);
    }

    console.log(`send-otp stub: user ${user.id}, phone ${phone}, code ${code} (no SMS sent)`);
    return jsonResponse({ success: true }, 200);
  } catch (error) {
    console.error("send-otp error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
