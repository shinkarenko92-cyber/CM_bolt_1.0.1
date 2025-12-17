/**
 * iCal Endpoint for Avito Calendar Sync
 * Generates iCal file with bookings as BUSY events
 * URL: /functions/v1/ical/{property_id}.ics
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Helper to format date-time for iCal (YYYYMMDDTHHMMSSZ)
function formatICalDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

// Helper to format a YYYY-MM-DD date into iCal DATE (YYYYMMDD)
function formatICalDateOnly(dateStr: string): string {
  // Accept both YYYY-MM-DD and full ISO strings
  const d = dateStr.split("T")[0];
  return d.replaceAll("-", "");
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
    // Avito import is typically strict: use all-day DATE events below, timezone becomes irrelevant.
    'X-WR-TIMEZONE:UTC',
    'X-PUBLISHED-TTL:PT5M', // Refresh every 5 minutes
    'REFRESH-INTERVAL;VALUE=DURATION:PT1M', // Refresh interval: 1 minute (if supported)
  ].join('\r\n') + '\r\n';

  // Add VEVENT for each booking (BUSY)
  for (const booking of bookings) {
    // Avito works best with all-day events:
    // DTSTART;VALUE=DATE = check-in date
    // DTEND;VALUE=DATE = check-out date (exclusive)
    const dtStartDate = formatICalDateOnly(booking.check_in);
    const dtEndDate = formatICalDateOnly(booking.check_out);
    const summary = 'Занято'; // keep short & compatible

    // Stable UID helps Avito detect updates
    const uid = `${dtStartDate}-${dtEndDate}@roomi.pro`;
    
    ical += [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowStr}`,
      `DTSTART;VALUE=DATE:${dtStartDate}`,
      `DTEND;VALUE=DATE:${dtEndDate}`,
      `SUMMARY:${summary}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE', // BUSY
      'CLASS:PRIVATE',
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
    // Parse property_id from URL
    // Supabase Edge Functions receive full path: /functions/v1/ical/{property_id}.ics
    const url = new URL(req.url);
    console.log("iCal: Request URL", { url: req.url, pathname: url.pathname });
    
    // Try different path formats (Avito may append params or trailing slash)
    let propertyId: string | null = null;
    
    const normalizedPath = url.pathname.replace(/\/+$/, "");

    // Format 1/2: .../ical/{property_id}.ics or .../functions/v1/ical/{property_id}.ics
    const pathMatch = normalizedPath.match(/\/ical\/([^/]+?)(?:\.ics)?$/);
    if (pathMatch?.[1]) {
      propertyId = pathMatch[1];
    }
    
    // Format 3: Query parameter as fallback
    if (!propertyId) {
      const urlParams = new URLSearchParams(url.search);
      propertyId = urlParams.get('property_id');
    }
    
    if (!propertyId) {
      console.error("iCal: Invalid URL format", { pathname: url.pathname, url: req.url });
      return new Response(
        JSON.stringify({ error: "Invalid URL format. Expected: /functions/v1/ical/{property_id}.ics" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("iCal: Processing request", { property_id: propertyId, url: req.url });

    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("iCal: Missing Supabase environment variables");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get property
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, name")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      console.error("iCal: Property not found", { property_id: propertyId, error: propertyError });
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
    // Exclude cancelled bookings - they should not block dates
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("check_in, check_out, guest_name, source")
      .eq("property_id", propertyId)
      .gte("check_out", todayStr) // Only future bookings (check_out >= today) - BUSY events
      .neq("status", "cancelled") // Exclude cancelled bookings - they don't block dates
      .order("check_in", { ascending: true });

    if (bookingsError) {
      console.error("iCal: Error fetching bookings", { property_id: propertyId, error: bookingsError });
      return new Response(
        JSON.stringify({ error: "Failed to fetch bookings" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const fetchedCount = bookings?.length || 0;

    // Avito should not receive its own bookings back via iCal; we only export blocks from other sources.
    const exportedBookings =
      (bookings || []).filter((b: { source?: string | null }) => (b.source ?? "").toLowerCase() !== "avito");

    console.log("iCal generated for property_id:", propertyId, "fetched:", fetchedCount, "exported_events:", exportedBookings.length);

    // Generate iCal (even if no bookings - return empty calendar)
    const icalContent = generateICal(exportedBookings);

    return new Response(icalContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        // Inline works better for some importers (Avito will fetch it server-side anyway)
        "Content-Disposition": `inline; filename="roomi-${propertyId}.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate", // Prevent caching for faster updates
        "Pragma": "no-cache",
        "Expires": "0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("iCal: Error generating iCal", { error: error instanceof Error ? error.message : String(error) });
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
