/**
 * iCal Endpoint for Avito Calendar Sync
 * Generates iCal file with bookings as BUSY events
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Helper to format date for iCal (YYYYMMDDTHHMMSSZ)
function formatICalDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

// Generate iCal content
function generateICal(bookings: Array<{ check_in: string; check_out: string; guest_name?: string | null }>): string {
  const now = new Date();
  const nowStr = formatICalDate(now);
  
  let ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Roomi.pro//Channel Manager//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Roomi - Занятость',
    `X-WR-TIMEZONE:Europe/Moscow`,
  ].join('\r\n') + '\r\n';

  for (const booking of bookings) {
    const checkIn = new Date(booking.check_in);
    const checkOut = new Date(booking.check_out);
    
    // Set time to start of day for check-in (00:00:00)
    checkIn.setUTCHours(0, 0, 0, 0);
    // Set time to end of day for check-out (23:59:59)
    checkOut.setUTCHours(23, 59, 59, 999);
    
    const dtStart = formatICalDate(checkIn);
    const dtEnd = formatICalDate(checkOut);
    const summary = `Занято (Roomi)${booking.guest_name ? ` - ${booking.guest_name}` : ''}`;
    
    ical += [
      'BEGIN:VEVENT',
      `UID:${booking.check_in}-${booking.check_out}-${Math.random().toString(36).substring(7)}@roomi.pro`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE', // BUSY
      'END:VEVENT',
    ].join('\r\n') + '\r\n';
  }

  ical += 'END:VCALENDAR\r\n';
  return ical;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Parse property_id from URL: /ical/{property_id}.ics
    const url = new URL(req.url);
    const pathMatch = url.pathname.match(/^\/ical\/([^/]+)\.ics$/);
    
    if (!pathMatch) {
      return new Response(
        JSON.stringify({ error: "Invalid URL format. Expected: /ical/{property_id}.ics" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const propertyId = pathMatch[1];

    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get property
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, name")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      return new Response(
        JSON.stringify({ error: "Property not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get future bookings for this property (only BUSY events)
    // Only bookings with check_out >= today (future bookings)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("check_in, check_out, guest_name")
      .eq("property_id", propertyId)
      .gte("check_out", todayStr) // Only future bookings (check_out >= today) - BUSY events
      .order("check_in", { ascending: true });

    console.log("iCal: Fetched bookings for calendar", {
      property_id: propertyId,
      bookings_count: bookings?.length || 0,
      today: todayStr,
      bookings: bookings?.map(b => ({
        check_in: b.check_in,
        check_out: b.check_out,
        guest_name: b.guest_name,
      })),
    });

    if (bookingsError) {
      console.error("Error fetching bookings:", bookingsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch bookings" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate iCal
    const icalContent = generateICal(bookings || []);

    return new Response(icalContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="roomi-${propertyId}.ics"`,
      },
    });
  } catch (error) {
    console.error("Error generating iCal:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

