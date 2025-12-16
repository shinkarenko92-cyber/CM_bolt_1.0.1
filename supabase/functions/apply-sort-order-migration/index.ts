/**
 * Edge Function to apply sort_order column migration
 * This function ensures the sort_order column exists in properties table
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

    // Migration SQL
    const migrationSQL = `
-- Ensure sort_order column exists in properties table
-- This migration is idempotent and safe to run multiple times

-- Check if sort_order column exists, if not add it
DO $$
BEGIN
  -- Check if column exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'properties' 
    AND column_name = 'sort_order'
  ) THEN
    -- Add sort_order column if it doesn't exist
    ALTER TABLE properties 
    ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
    
    -- Create index for efficient queries
    CREATE INDEX IF NOT EXISTS idx_properties_sort_order 
    ON properties(group_id, sort_order) 
    WHERE group_id IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_properties_ungrouped_sort_order 
    ON properties(owner_id, sort_order) 
    WHERE group_id IS NULL;
    
    -- Update existing records to have sort_order based on created_at
    -- This ensures existing properties have a valid sort_order
    WITH numbered_properties AS (
      SELECT 
        id,
        ROW_NUMBER() OVER (PARTITION BY COALESCE(group_id::text, 'ungrouped') ORDER BY created_at) - 1 as row_num
      FROM properties
    )
    UPDATE properties p
    SET sort_order = np.row_num
    FROM numbered_properties np
    WHERE p.id = np.id;
    
    RAISE NOTICE 'sort_order column added to properties table';
  ELSE
    RAISE NOTICE 'sort_order column already exists in properties table';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN properties.sort_order IS 'Order of property within its group (or ungrouped properties)';
    `;

    // Try to execute via pg_net (if available)
    try {
      const { data: pgNetData, error: pgNetError } = await supabase.rpc('exec_sql', {
        sql: migrationSQL,
      });

      if (!pgNetError && pgNetData) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Migration applied successfully via pg_net",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch {
      // pg_net not available, return SQL for manual execution
    }

    // Return SQL for manual execution (most reliable method)
    return new Response(
      JSON.stringify({
        success: true,
        message: "Migration SQL ready. Please execute in Supabase Dashboard → SQL Editor",
        sql: migrationSQL.trim(),
        instructions: [
          "1. Go to Supabase Dashboard → SQL Editor",
          "2. Copy and paste the SQL from the 'sql' field below",
          "3. Click 'Run' to execute",
          "4. This will add sort_order column to properties table if it doesn't exist"
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

