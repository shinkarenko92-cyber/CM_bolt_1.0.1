import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const properties = [
      {
        owner_id: userId,
        name: "Double Room 1",
        type: "DOUBLE ROOM",
        address: "Main Street 123",
        max_guests: 2,
        bedrooms: 1,
        base_price: 100,
        currency: "EUR",
        status: "active",
      },
      {
        owner_id: userId,
        name: "Double Room 2",
        type: "DOUBLE ROOM",
        address: "Main Street 124",
        max_guests: 2,
        bedrooms: 1,
        base_price: 100,
        currency: "EUR",
        status: "active",
      },
      {
        owner_id: userId,
        name: "One Bedroom Apt 1",
        type: "ONE BEDROOM",
        address: "Park Avenue 45",
        max_guests: 3,
        bedrooms: 1,
        base_price: 90,
        currency: "EUR",
        status: "active",
      },
      {
        owner_id: userId,
        name: "One Bedroom Apt 2",
        type: "ONE BEDROOM",
        address: "Park Avenue 46",
        max_guests: 3,
        bedrooms: 1,
        base_price: 90,
        currency: "EUR",
        status: "active",
      },
    ];

    const { data: insertedProperties, error: propError } = await supabase
      .from("properties")
      .insert(properties)
      .select();

    if (propError || !insertedProperties) {
      throw new Error(`Error inserting properties: ${propError?.message}`);
    }

    const today = new Date();
    const bookings = [
      {
        property_id: insertedProperties[0].id,
        guest_name: "Kenna T.",
        guest_email: "kenna@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3)
          .toISOString()
          .split("T")[0],
        guests_count: 2,
        total_price: 500,
        currency: "EUR",
        status: "confirmed",
        source: "manual",
      },
      {
        property_id: insertedProperties[0].id,
        guest_name: "Mercedes Nott",
        guest_email: "mercedes@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6)
          .toISOString()
          .split("T")[0],
        guests_count: 2,
        total_price: 600,
        currency: "EUR",
        status: "confirmed",
        source: "booking",
      },
      {
        property_id: insertedProperties[0].id,
        guest_name: "Yuko Tricarico",
        guest_email: "yuko@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 20)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 24)
          .toISOString()
          .split("T")[0],
        guests_count: 1,
        total_price: 400,
        currency: "EUR",
        status: "confirmed",
        source: "airbnb",
      },
      {
        property_id: insertedProperties[1].id,
        guest_name: "Scot Febus",
        guest_email: "scot@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4)
          .toISOString()
          .split("T")[0],
        guests_count: 2,
        total_price: 540,
        currency: "EUR",
        status: "confirmed",
        source: "manual",
      },
      {
        property_id: insertedProperties[1].id,
        guest_name: "Grover Terizzi",
        guest_email: "grover@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 9)
          .toISOString()
          .split("T")[0],
        guests_count: 2,
        total_price: 720,
        currency: "EUR",
        status: "confirmed",
        source: "booking",
      },
      {
        property_id: insertedProperties[1].id,
        guest_name: "Eboni Deluca",
        guest_email: "eboni@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15)
          .toISOString()
          .split("T")[0],
        guests_count: 2,
        total_price: 540,
        currency: "EUR",
        status: "confirmed",
        source: "airbnb",
      },
      {
        property_id: insertedProperties[1].id,
        guest_name: "Kurtis Barranco",
        guest_email: "kurtis@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 18)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 22)
          .toISOString()
          .split("T")[0],
        guests_count: 2,
        total_price: 300,
        currency: "EUR",
        status: "confirmed",
        source: "manual",
      },
      {
        property_id: insertedProperties[2].id,
        guest_name: "Lucienne Trembley",
        guest_email: "lucienne@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)
          .toISOString()
          .split("T")[0],
        guests_count: 3,
        total_price: 400,
        currency: "EUR",
        status: "confirmed",
        source: "booking",
      },
      {
        property_id: insertedProperties[2].id,
        guest_name: "Tamatha Leffew",
        guest_email: "tamatha@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15)
          .toISOString()
          .split("T")[0],
        guests_count: 2,
        total_price: 790,
        currency: "EUR",
        status: "confirmed",
        source: "airbnb",
      },
      {
        property_id: insertedProperties[2].id,
        guest_name: "Keely Asmussen",
        guest_email: "keely@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 17)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 22)
          .toISOString()
          .split("T")[0],
        guests_count: 2,
        total_price: 390,
        currency: "EUR",
        status: "confirmed",
        source: "manual",
      },
      {
        property_id: insertedProperties[3].id,
        guest_name: "Arlena Taormina",
        guest_email: "arlena@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5)
          .toISOString()
          .split("T")[0],
        guests_count: 2,
        total_price: 304,
        currency: "EUR",
        status: "confirmed",
        source: "booking",
      },
      {
        property_id: insertedProperties[3].id,
        guest_name: "Ping Wnuk",
        guest_email: "ping@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 8)
          .toISOString()
          .split("T")[0],
        guests_count: 2,
        total_price: 280,
        currency: "EUR",
        status: "confirmed",
        source: "manual",
      },
      {
        property_id: insertedProperties[3].id,
        guest_name: "Jimmie Pecinovsky",
        guest_email: "jimmie@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 8)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15)
          .toISOString()
          .split("T")[0],
        guests_count: 3,
        total_price: 610,
        currency: "EUR",
        status: "confirmed",
        source: "airbnb",
      },
      {
        property_id: insertedProperties[3].id,
        guest_name: "Lavonda Mohamed",
        guest_email: "lavonda@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 16)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 20)
          .toISOString()
          .split("T")[0],
        guests_count: 2,
        total_price: 300,
        currency: "EUR",
        status: "confirmed",
        source: "booking",
      },
      {
        property_id: insertedProperties[3].id,
        guest_name: "Stephany Zamor",
        guest_email: "stephany@example.com",
        check_in: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 22)
          .toISOString()
          .split("T")[0],
        check_out: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 28)
          .toISOString()
          .split("T")[0],
        guests_count: 2,
        total_price: 350,
        currency: "EUR",
        status: "confirmed",
        source: "manual",
      },
    ];

    const { error: bookError } = await supabase
      .from("bookings")
      .insert(bookings);

    if (bookError) {
      throw new Error(`Error inserting bookings: ${bookError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        propertiesCount: insertedProperties.length,
        bookingsCount: bookings.length,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
