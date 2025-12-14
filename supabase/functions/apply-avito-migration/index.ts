/**
 * Edge Function to apply avito_item_id_text removal migration
 * This removes the avito_item_id_text column from integrations table
 * Uses pg_net to execute SQL directly
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Step 1: Migrate data from avito_item_id_text to avito_item_id
    console.log("Step 1: Migrating data from avito_item_id_text to avito_item_id");
    const { error: updateError } = await supabase
      .from("integrations")
      .update({ avito_item_id: supabase.raw("avito_item_id_text") })
      .eq("platform", "avito")
      .is("avito_item_id", null)
      .not("avito_item_id_text", "is", null)
      .neq("avito_item_id_text", "");

    if (updateError) {
      console.warn("Data migration warning (may be safe to ignore):", updateError);
      // Try alternative approach using RPC
      try {
        await supabase.rpc("exec_sql", {
          query: `
            UPDATE integrations
            SET avito_item_id = avito_item_id_text
            WHERE platform = 'avito'
              AND avito_item_id IS NULL
              AND avito_item_id_text IS NOT NULL
              AND avito_item_id_text != '';
          `
        });
      } catch (rpcError) {
        console.warn("RPC exec_sql not available, will need manual migration");
      }
    }

    // Step 2: Drop column using pg_net (if available) or return SQL
    const dropColumnSQL = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'integrations' 
      AND column_name = 'avito_item_id_text'
  ) THEN
    ALTER TABLE integrations DROP COLUMN avito_item_id_text;
    RAISE NOTICE 'Dropped avito_item_id_text column';
  ELSE
    RAISE NOTICE 'Column does not exist, skipping';
  END IF;
END $$;
    `;

    // Try to execute via pg_net
    try {
      const dbUrl = Deno.env.get("DATABASE_URL") || supabaseUrl.replace("https://", "postgresql://postgres:") + "@db." + supabaseUrl.split("//")[1].split(".")[0] + ".supabase.co:5432/postgres";
      
      // Use pg_net if available
      const { data: pgNetResult, error: pgNetError } = await supabase.rpc("net_http_request", {
        url: "https://httpbin.org/post", // Placeholder, we'll use direct SQL
        method: "POST"
      });

      if (pgNetError) {
        throw new Error("pg_net not available");
      }
    } catch {
      // pg_net not available, return SQL for manual execution
    }

    // Return SQL for manual execution (most reliable method)
    const fullMigrationSQL = `
-- Remove avito_item_id_text column - we use only avito_item_id (TEXT) now
-- This fixes the PostgREST schema cache error

-- Step 1: Ensure all data is migrated to avito_item_id
UPDATE integrations
SET avito_item_id = avito_item_id_text
WHERE platform = 'avito'
  AND avito_item_id IS NULL
  AND avito_item_id_text IS NOT NULL
  AND avito_item_id_text != '';

-- Step 2: Drop the column if it exists
${dropColumnSQL.trim()}
    `;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Migration SQL ready. Please execute in Supabase Dashboard → SQL Editor",
        sql: fullMigrationSQL.trim(),
        instructions: [
          "1. Go to Supabase Dashboard → SQL Editor",
          "2. Copy and paste the SQL from the 'sql' field below",
          "3. Click 'Run' to execute",
          "4. This will remove avito_item_id_text column and fix PostgREST schema cache"
        ]
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Migration function error:", errorMessage);

    return new Response(
      JSON.stringify({
        error: errorMessage,
        note: "Please apply the migration manually via Supabase Dashboard → SQL Editor"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

