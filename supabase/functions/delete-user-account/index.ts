/**
 * Delete User Account Edge Function
 * Deletes auth user and all associated data
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase configuration");
    }

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify user session
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Deleting account for user ${user.id}`);

    // Create service role client for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Get all properties for the user
    const { data: userProperties } = await adminClient
      .from("properties")
      .select("id")
      .eq("owner_id", user.id);

    if (userProperties && userProperties.length > 0) {
      const propertyIds = userProperties.map(p => p.id);
      
      // 2. Delete bookings for all user properties
      await adminClient
        .from("bookings")
        .delete()
        .in("property_id", propertyIds);

      // 3. Delete property_rates for all properties
      await adminClient
        .from("property_rates")
        .delete()
        .in("property_id", propertyIds);

      // 4. Delete integrations for all properties
      await adminClient
        .from("integrations")
        .delete()
        .in("property_id", propertyIds);
      
      // 5. Delete avito_items for all properties
      await adminClient
        .from("avito_items")
        .delete()
        .in("property_id", propertyIds);
      
      // 6. Delete avito_sync_queue for all properties
      await adminClient
        .from("avito_sync_queue")
        .delete()
        .in("property_id", propertyIds);
    }

      // 7. Delete all properties
      await adminClient
        .from("properties")
        .delete()
        .eq("owner_id", user.id);

      // 8. Delete profile
      await adminClient
        .from("profiles")
        .delete()
        .eq("id", user.id);

      // 9. Delete auth user (requires admin client)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("Error deleting auth user:", deleteError);
      return new Response(
        JSON.stringify({ error: `Failed to delete auth user: ${deleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Account deleted successfully for user ${user.id}`);

    return new Response(
      JSON.stringify({ success: true, message: "Account deleted successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
