/**
 * Import Bookings Edge Function
 * Handles bulk import of bookings from Excel with fuzzy property matching and overlap validation
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ParsedBooking {
  property_name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  guest_name: string;
  guest_phone: string | null;
  amount: number;
  channel: string;
  notes: string;
  guests_count: number;
  rowIndex: number;
}

interface ImportError {
  row: number;
  message: string;
  property_name?: string;
}

interface ImportResult {
  imported: number;
  created_properties: number;
  errors: ImportError[];
}

// Levenshtein distance calculation (simple implementation)
function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const matrix: number[][] = [];
  
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[s2.length][s1.length];
}

function calculateSimilarity(str1: string, str2: string): number {
  const normalized1 = str1.trim().toLowerCase();
  const normalized2 = str2.trim().toLowerCase();

  if (normalized1 === normalized2) {
    return 100;
  }

  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);

  if (maxLength === 0) {
    return 100;
  }

  const similarity = ((maxLength - distance) / maxLength) * 100;
  return Math.round(similarity * 100) / 100;
}

function findBestMatch(
  propertyName: string,
  existingProperties: Array<{ id: string; name: string }>,
  threshold: number = 90
): { propertyId: string | null; similarity: number; matchedName: string | null } {
  if (!propertyName || !propertyName.trim() || existingProperties.length === 0) {
    return { propertyId: null, similarity: 0, matchedName: null };
  }

  let bestMatch = { propertyId: null as string | null, similarity: 0, matchedName: null as string | null };

  for (const property of existingProperties) {
    const similarity = calculateSimilarity(propertyName, property.name);

    if (similarity > bestMatch.similarity) {
      bestMatch = {
        propertyId: property.id,
        similarity,
        matchedName: property.name,
      };
    }
  }

  if (bestMatch.similarity < threshold) {
    return { propertyId: null, similarity: bestMatch.similarity, matchedName: null };
  }

  return bestMatch;
}

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

    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { bookings } = requestBody as { bookings: ParsedBooking[] };

    if (!bookings || !Array.isArray(bookings) || bookings.length === 0) {
      return new Response(
        JSON.stringify({ error: "Bookings array is required and must not be empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Importing ${bookings.length} bookings for user ${user.id}`);

    // Step 1: Get all existing properties for the user
    const { data: existingProperties, error: propertiesError } = await supabase
      .from("properties")
      .select("id, name")
      .eq("owner_id", user.id);

    if (propertiesError) {
      console.error("Error fetching properties:", propertiesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch properties" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const properties = existingProperties || [];

    // Step 2: Collect unique property names from import
    const uniquePropertyNames = Array.from(new Set(bookings.map(b => b.property_name)));

    // Step 3: Fuzzy match properties
    const propertyMapping = new Map<string, string | null>();
    const propertiesToCreate: string[] = [];

    for (const propertyName of uniquePropertyNames) {
      const match = findBestMatch(propertyName, properties, 90);
      if (match.propertyId) {
        propertyMapping.set(propertyName, match.propertyId);
        console.log(`Matched "${propertyName}" to existing property "${match.matchedName}" (${match.similarity}% similarity)`);
      } else {
        propertyMapping.set(propertyName, null);
        propertiesToCreate.push(propertyName);
      }
    }

    // Step 4: Create new properties
    const newPropertyIds = new Map<string, string>();
    if (propertiesToCreate.length > 0) {
      const propertiesToInsert = propertiesToCreate.map(name => ({
        owner_id: user.id,
        name,
        type: "APARTMENT",
        address: name, // Use property name as address if not provided
        description: null,
        max_guests: 4,
        bedrooms: 1,
        base_price: 0,
        currency: "RUB",
        status: "active",
        minimum_booking_days: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { data: insertedProperties, error: insertError } = await supabase
        .from("properties")
        .insert(propertiesToInsert)
        .select("id, name");

      if (insertError) {
        console.error("Error creating properties:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to create properties" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (insertedProperties) {
        for (const prop of insertedProperties) {
          newPropertyIds.set(prop.name, prop.id);
          propertyMapping.set(prop.name, prop.id);
        }
      }
    }

    // Step 5: Check for overlaps and prepare bookings for insert
    const errors: ImportError[] = [];
    const bookingsToInsert: Array<{
      property_id: string;
      guest_name: string;
      guest_email: string | null;
      guest_phone: string | null;
      check_in: string;
      check_out: string;
      guests_count: number;
      total_price: number;
      currency: string;
      status: string;
      source: string;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }> = [];

    for (const booking of bookings) {
      const propertyId = propertyMapping.get(booking.property_name);
      
      if (!propertyId) {
        errors.push({
          row: booking.rowIndex,
          message: `Не удалось сопоставить объект "${booking.property_name}"`,
          property_name: booking.property_name,
        });
        continue;
      }

      // Check for overlaps
      // Query all bookings for this property and filter in code
      const { data: allPropertyBookings, error: overlapError } = await supabase
        .from("bookings")
        .select("id, guest_name, check_in, check_out")
        .eq("property_id", propertyId);

      if (overlapError) {
        console.error("Error checking overlaps:", overlapError);
        errors.push({
          row: booking.rowIndex,
          message: `Ошибка при проверке пересечений: ${overlapError.message}`,
          property_name: booking.property_name,
        });
        continue;
      }

      // Filter for overlaps in code
      const newStart = new Date(booking.start_date);
      const newEnd = new Date(booking.end_date);
      
      const overlaps = (allPropertyBookings || []).filter((existing) => {
        const existingStart = new Date(existing.check_in);
        const existingEnd = new Date(existing.check_out);
        
        // Check if periods overlap (they overlap if one starts before the other ends)
        return newStart < existingEnd && newEnd > existingStart;
      });

      if (overlaps.length > 0) {
        const conflictInfo = overlaps
          .map(b => `${b.guest_name} (${b.check_in} - ${b.check_out})`)
          .join(", ");
        errors.push({
          row: booking.rowIndex,
          message: `Пересечение с существующими бронями: ${conflictInfo}`,
          property_name: booking.property_name,
        });
        continue;
      }

      // Prepare booking for insert
      bookingsToInsert.push({
        property_id: propertyId,
        guest_name: booking.guest_name,
        guest_email: null,
        guest_phone: booking.guest_phone,
        check_in: booking.start_date,
        check_out: booking.end_date,
        guests_count: booking.guests_count,
        total_price: booking.amount,
        currency: "RUB",
        status: "confirmed",
        source: "excel_import",
        external_id: null, // Excel imports don't have external IDs
        notes: booking.notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Step 6: If there are errors, return them (block import)
    if (errors.length > 0) {
      return new Response(
        JSON.stringify({
          imported: 0,
          created_properties: newPropertyIds.size,
          errors,
        } as ImportResult),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 7: Bulk insert bookings
    if (bookingsToInsert.length > 0) {
      // Insert in batches of 100 to avoid payload size issues
      const batchSize = 100;
      for (let i = 0; i < bookingsToInsert.length; i += batchSize) {
        const batch = bookingsToInsert.slice(i, i + batchSize);
        console.log(`Inserting batch ${Math.floor(i / batchSize) + 1}, ${batch.length} bookings`);
        
        const { data: insertedData, error: insertError } = await supabase
          .from("bookings")
          .insert(batch)
          .select("id");

        if (insertError) {
          console.error("Error inserting bookings:", {
            error: insertError,
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
            code: insertError.code,
            batchSize: batch.length,
            firstBooking: batch[0],
          });
          return new Response(
            JSON.stringify({ 
              error: `Failed to insert bookings: ${insertError.message}`,
              details: insertError.details,
              hint: insertError.hint,
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        console.log(`Successfully inserted ${insertedData?.length || 0} bookings in batch`);
      }
    }

    const result: ImportResult = {
      imported: bookingsToInsert.length,
      created_properties: newPropertyIds.size,
      errors: [],
    };

    console.log(`Import completed: ${result.imported} bookings, ${result.created_properties} new properties`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", {
      error,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : undefined,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
