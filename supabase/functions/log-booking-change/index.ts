// Edge Function to log booking changes
// Called automatically via database triggers or manually from client/other functions

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight — 200 OK so gateway/proxies treat as success
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user token (for user_id)
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { booking_id, property_id, action, changes, source } = body;

    // Validate required fields
    if (!booking_id || !property_id || !action) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: booking_id, property_id, action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to this property
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('owner_id')
      .eq('id', property_id)
      .single();

    if (propertyError || !property) {
      return new Response(
        JSON.stringify({ error: 'Property not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (property.owner_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: You do not own this property' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For 'deleted', booking_id may no longer exist in bookings; insert with null to avoid FK violation
    const logBookingId = action === 'deleted' ? null : booking_id;
    const logChanges =
      action === 'deleted'
        ? { ...(changes || {}), deleted_booking_id: booking_id }
        : (changes || null);

    // Insert log entry
    const { data: logEntry, error: logError } = await supabase
      .from('booking_logs')
      .insert({
        booking_id: logBookingId,
        property_id,
        user_id: user.id,
        action,
        changes_json: logChanges,
        source: source || 'manual',
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) {
      console.error('Error creating booking log:', logError);
      return new Response(
        JSON.stringify({ error: 'Failed to create log entry', details: logError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, log: logEntry }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in log-booking-change function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
