/**
 * Edge Function to apply deleted_at migration
 * This function can be called once to add the deleted_at column to properties table
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    // Note: This function returns SQL for manual execution
    // Migration uses IF NOT EXISTS so it's safe to run multiple times

    // Apply migration using raw SQL
    const migrationSQL = `
      -- Add deleted_at column to properties table for soft delete
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;

      -- Add index for efficient filtering of non-deleted properties
      CREATE INDEX IF NOT EXISTS idx_properties_deleted_at 
      ON properties(deleted_at) 
      WHERE deleted_at IS NULL;

      -- Add comment for documentation
      COMMENT ON COLUMN properties.deleted_at IS 'Timestamp when property was soft-deleted. NULL means property is active.';
    `;

    // Use Supabase PostgREST to execute SQL (if available)
    // Note: This requires the pg_net extension or direct database access
    // For now, we'll return the SQL to be executed manually
    
    return new Response(
      JSON.stringify({
        success: true,
        message: "Migration SQL ready. Please execute in Supabase Dashboard → SQL Editor",
        sql: migrationSQL,
        instructions: [
          "1. Go to Supabase Dashboard → SQL Editor",
          "2. Copy and paste the SQL from the 'sql' field",
          "3. Click 'Run' to execute",
          "4. Verify the column was added by running: SELECT column_name FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'deleted_at';"
        ]
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
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

