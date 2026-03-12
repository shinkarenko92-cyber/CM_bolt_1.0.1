import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type AssignCleanerPayload = {
  email: string;
  full_name: string;
  phone?: string | null;
  telegram_chat_id?: string | null;
  color?: string | null;
};

function jsonResponse(body: unknown, status: number): Response {
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

    const email = payload.email?.trim().toLowerCase();
    if (!email) {
      return jsonResponse({ error: "Email is required" }, 400);
    }

    // Look up user by email: listUsers has no email filter, so we fetch a page and find by email
    const {
      data: { users },
      error: listError,
    } = await adminClient.auth.admin.listUsers({ perPage: 1000 });

    if (listError) {
      console.error("Error looking up user by email:", listError);
      return jsonResponse({ error: "Failed to look up user by email" }, 500);
    }

    const targetUser = users?.find((u) => u.email?.toLowerCase() === email);
    if (!targetUser) {
      return jsonResponse(
        { error: "Пользователь с таким email не зарегистрирован" },
        404,
      );
    }

    const userId = targetUser.id;

    // Upsert cleaner row
    const { data: cleaner, error: cleanerError } = await adminClient
      .from("cleaners")
      .upsert(
        {
          user_id: userId,
          full_name: payload.full_name || targetUser.user_metadata?.full_name || email,
          phone: payload.phone ?? null,
          telegram_chat_id: payload.telegram_chat_id ?? null,
          color: payload.color ?? null,
          is_active: true,
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (cleanerError) {
      console.error("Error upserting cleaner:", cleanerError);
      return jsonResponse({ error: "Failed to create or update cleaner" }, 500);
    }

    // Update profile role to 'cleaner'
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ role: "cleaner", is_active: true })
      .eq("id", userId);

    if (profileError) {
      console.error("Error updating profile role:", profileError);
      return jsonResponse({ error: "Failed to update user role to cleaner" }, 500);
    }

    return jsonResponse({ success: true, cleaner }, 200);
  } catch (error) {
    console.error("Unexpected error in assign-cleaner-role:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

