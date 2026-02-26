/**
 * Send OTP for phone login (no auth required).
 * Body: { phone, channel: 'whatsapp' | 'telegram', telegram_id?: string }
 * Stores code in login_otp; sends via Telegram Bot API if channel=telegram and TELEGRAM_BOT_TOKEN set.
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

function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s\-()]/g, "").replace(/^\+7/, "7").replace(/^8/, "7");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse({ error: "Missing Supabase configuration" }, 500);
    }

    const contentType = req.headers.get("Content-Type") || "";
    if (!req.body || !contentType.includes("application/json")) {
      return jsonResponse({ error: "Content-Type: application/json and request body required" }, 400);
    }

    let body: { phone?: string; channel?: string; telegram_id?: string };
    try {
      body = (await req.json()) as { phone?: string; channel?: string; telegram_id?: string };
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const rawPhone = typeof body?.phone === "string" ? body.phone : "";
    const phone = normalizePhone(rawPhone);
    if (!phone || phone.length < 10) {
      return jsonResponse({ error: "Valid phone number required" }, 400);
    }

    const channel = (body?.channel === "telegram" || body?.channel === "whatsapp") ? body.channel : "telegram";
    const telegramId = typeof body?.telegram_id === "string" ? body.telegram_id.trim() : undefined;

    const code = generateCode(6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    await adminClient.from("login_otp").delete().eq("phone", phone);
    const { error: insertError } = await adminClient.from("login_otp").insert({
      phone,
      code,
      expires_at: expiresAt,
      channel,
    });

    if (insertError) {
      console.error("login_otp insert error:", insertError);
      return jsonResponse({ error: "Failed to store OTP" }, 500);
    }

    if (channel === "telegram" && telegramBotToken && telegramId) {
      try {
        const text = `Ваш код входа Roomi Pro: ${code}. Код действителен 10 минут.`;
        const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: telegramId, text }),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error("Telegram send error:", err);
        }
      } catch (e) {
        console.error("Telegram send error:", e);
      }
    } else {
      console.log(`send-login-otp: phone ${phone}, code ${code} (channel ${channel}, no delivery)`);
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    console.error("send-login-otp error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
