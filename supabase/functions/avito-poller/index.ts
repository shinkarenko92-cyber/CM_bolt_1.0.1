/**
 * Avito Poller Edge Function
 * Cron job that runs every 10 seconds to process sync queue
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Query sync queue for items ready to sync
    const { data: queueItems, error: queueError } = await supabase
      .from("avito_sync_queue")
      .select("*, integrations(*)")
      .eq("status", "pending")
      .lte("next_sync_at", new Date().toISOString())
      .limit(10); // Process 10 at a time to avoid rate limits

    if (queueError) throw queueError;

    if (!queueItems || queueItems.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No items to sync" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let successCount = 0;
    let failCount = 0;

    // Process each integration
    for (const item of queueItems) {
      try {
        // Call avito_sync function
        const { error: syncError } = await supabase.functions.invoke("avito_sync", {
          body: {
            action: "sync",
            integration_id: item.integration_id,
          },
        });

        if (syncError) {
          throw syncError;
        }

        // Update queue - mark as success and schedule next sync (10 seconds)
        await supabase
          .from("avito_sync_queue")
          .update({
            status: "success",
            next_sync_at: new Date(Date.now() + 10000).toISOString(), // +10 seconds
          })
          .eq("id", item.id);

        successCount++;
      } catch (error) {
        // Mark as failed, will retry on next run
        await supabase
          .from("avito_sync_queue")
          .update({ status: "failed" })
          .eq("id", item.id);

        failCount++;
        console.error(`Sync failed for integration ${item.integration_id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        processed: queueItems.length,
        success: successCount,
        failed: failCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

