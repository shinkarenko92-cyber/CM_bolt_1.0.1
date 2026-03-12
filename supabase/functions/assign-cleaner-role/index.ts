import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const INTERNAL_EMAIL_DOMAIN = "internal.roomi.pro";

type AssignCleanerPayload = {
  full_name: string;
  phone: string;
  telegram_chat_id?: string | null;
  color?: string | null;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("7") && digits.length === 11 ? digits : digits.length === 10 ? "7" + digits : digits;
  return `${normalized}@${INTERNAL_EMAIL_DOMAIN}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Missing Supabase configuration" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: caller },
      error: callerError,
    } = await adminClient.auth.getUser(token);

    if (callerError || !caller) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", caller.id)
      .single();

    if (callerProfile?.role !== "admin" || callerProfile?.is_active !== true) {
      return jsonResponse({ error: "Forbidden: admin role required" }, 403);
    }

    const contentType = req.headers.get("Content-Type") || "";
    if (req.method !== "POST" || !req.body || !contentType.includes("application/json")) {
      return jsonResponse(
        { error: "Content-Type: application/json and request body required" },
        400,
      );
    }

    let payload: AssignCleanerPayload;
    try {
      payload = (await req.json()) as AssignCleanerPayload;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const fullName = payload.full_name?.trim();
    const phone = payload.phone?.trim();
    if (!fullName) {
      return jsonResponse({ error: "full_name is required" }, 400);
    }
    if (!phone) {
      return jsonResponse({ error: "phone is required" }, 400);
    }

    const email = phoneToEmail(phone);

    const {
      data: { user: newUser },
      error: createError,
    } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });

    if (createError) {
      if (createError.message.includes("already been registered")) {
        return jsonResponse(
          { error: "Уборщица с таким номером уже добавлена" },
          409,
        );
      }
      console.error("Error creating user:", createError);
      return jsonResponse({ error: createError.message }, 500);
    }

    if (!newUser) {
      return jsonResponse({ error: "Failed to create user" }, 500);
    }

    const {
      data: { properties: linkData },
      error: linkError,
    } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    let magicLink: string | null = null;
    if (!linkError && linkData?.action_link) {
      magicLink = linkData.action_link;
    } else {
      console.error("Generate magic link error:", linkError);
    }

    const { data: cleaner, error: cleanerError } = await adminClient
      .from("cleaners")
      .insert({
        user_id: newUser.id,
        full_name: fullName,
        phone: phone,
        telegram_chat_id: payload.telegram_chat_id?.trim() || null,
        color: payload.color?.trim() || null,
        is_active: true,
      })
      .select("*")
      .single();

    if (cleanerError) {
      console.error("Error creating cleaner:", cleanerError);
      return jsonResponse({ error: "Failed to create cleaner" }, 500);
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ role: "cleaner", is_active: true })
      .eq("id", newUser.id);

    if (profileError) {
      console.error("Error updating profile role:", profileError);
      return jsonResponse({ error: "Failed to update user role" }, 500);
    }

    return jsonResponse(
      { success: true, cleaner, magic_link: magicLink ?? undefined },
      200,
    );
  } catch (error) {
    console.error("Unexpected error in assign-cleaner-role:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
