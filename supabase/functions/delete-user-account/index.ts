/**
 * Delete User Account Edge Function
 * Deletes auth user and all associated data.
 * Requires POST with Content-Type: application/json and a body.
 * Modes: self-delete (body {} or no userId) or admin delete (body { userId }, caller must be admin when target !== caller).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function deleteUserData(adminClient: ReturnType<typeof createClient>, userId: string): Promise<void> {
  const { data: userProperties } = await adminClient
    .from("properties")
    .select("id")
    .eq("owner_id", userId);

  const propertyIds = userProperties?.map((p) => p.id) ?? [];
  if (propertyIds.length > 0) {
    await adminClient.from("bookings").delete().in("property_id", propertyIds);
    await adminClient.from("property_rates").delete().in("property_id", propertyIds);
    await adminClient.from("integrations").delete().in("property_id", propertyIds);
    await adminClient.from("avito_items").delete().in("property_id", propertyIds);
    await adminClient.from("avito_sync_queue").delete().in("property_id", propertyIds);
  }

  await adminClient.from("properties").delete().eq("owner_id", userId);
  await adminClient.from("guests").delete().eq("owner_id", userId);
  await adminClient.from("chats").delete().eq("owner_id", userId);
  await adminClient.from("deletion_requests").delete().eq("user_id", userId);
  await adminClient.from("profiles").delete().eq("id", userId);
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
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);

    if (callerError || !caller) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const contentType = req.headers.get("Content-Type") || "";
    if (
      req.method !== "POST" ||
      !req.body ||
      !contentType.includes("application/json")
    ) {
      return jsonResponse(
        { error: "Content-Type: application/json and request body required" },
        400
      );
    }

    let body: { userId?: string };
    try {
      body = (await req.json()) as { userId?: string };
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const userIdFromBody = body?.userId;
    const hasValidTarget =
      typeof userIdFromBody === "string" && UUID_REGEX.test(userIdFromBody);

    let targetUserId: string;
    if (hasValidTarget) {
      targetUserId = userIdFromBody;
      if (targetUserId !== caller.id) {
        const { data: profile } = await adminClient
          .from("profiles")
          .select("role, is_active")
          .eq("id", caller.id)
          .single();
        if (profile?.role !== "admin" || profile?.is_active !== true) {
          return jsonResponse({ error: "Forbidden: admin role required" }, 403);
        }
      }
    } else {
      targetUserId = caller.id;
    }

    console.log(`Deleting account for user ${targetUserId} (caller: ${caller.id})`);

    await deleteUserData(adminClient, targetUserId);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      console.error("Error deleting auth user:", deleteError);
      return jsonResponse(
        { error: `Failed to delete auth user: ${deleteError.message}` },
        500
      );
    }

    console.log(`Account deleted successfully for user ${targetUserId}`);
    return jsonResponse({ success: true, message: "Account deleted successfully" }, 200);
  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
