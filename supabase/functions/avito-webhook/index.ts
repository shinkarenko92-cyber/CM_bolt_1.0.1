/**
 * Avito Webhook Handler
 * Handles webhook notifications from Avito API for booking events
 * 
 * Note: This webhook handler is prepared for future use when Avito provides webhook support.
 * Currently, Avito API may not support webhooks, but this handler is ready if they add it.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AvitoWebhookPayload {
  event: string; // e.g., "booking.created", "booking.updated", "booking.cancelled"
  booking_id: string | number;
  item_id: string | number;
  account_id?: string | number;
  user_id?: string | number;
  booking?: {
    avito_booking_id?: number;
    id?: string | number;
    check_in: string;
    check_out: string;
    contact?: {
      name?: string;
      email?: string;
      phone?: string;
    };
    customer?: {
      name?: string;
      email?: string;
      phone?: string;
    };
    guest?: {
      name?: string;
      email?: string;
      phone?: string;
    };
    status?: string;
    base_price?: number;
    total_price?: number;
    currency?: string;
  };
  timestamp?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify webhook signature if Avito provides it
    // This is a placeholder - actual signature verification depends on Avito's implementation
    const signature = req.headers.get("X-Avito-Signature");
    if (signature) {
      // TODO: Implement signature verification when Avito provides documentation
      console.log("Webhook signature received", { signature });
    }

    // Parse webhook payload
    const payload: AvitoWebhookPayload = await req.json();

    console.log("Avito webhook received", {
      event: payload.event,
      booking_id: payload.booking_id,
      item_id: payload.item_id,
      has_booking: !!payload.booking,
    });

    // Handle different event types
    switch (payload.event) {
      case "booking.created":
      case "booking.updated": {
        await handleBookingEvent(payload, supabase);
        break;
      }
      case "booking.cancelled": {
        await handleBookingCancellation(payload, supabase);
        break;
      }
      default: {
        console.warn("Unknown webhook event type", { event: payload.event });
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Webhook processed" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing Avito webhook", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

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

/**
 * Handle booking creation or update event
 */
async function handleBookingEvent(
  payload: AvitoWebhookPayload,
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  if (!payload.booking) {
    console.warn("Booking data missing in webhook payload");
    return;
  }

  const booking = payload.booking;
  const bookingId = booking.avito_booking_id || booking.id;
  const itemId = payload.item_id;

  if (!bookingId || !itemId || !booking.check_in || !booking.check_out) {
    console.warn("Invalid booking data in webhook", {
      booking_id: bookingId,
      item_id: itemId,
      has_check_in: !!booking.check_in,
      has_check_out: !!booking.check_out,
    });
    return;
  }

  // Find integration by item_id
  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("*")
    .eq("platform", "avito")
    .eq("avito_item_id", String(itemId))
    .eq("is_active", true)
    .maybeSingle();

  if (integrationError || !integration) {
    console.warn("Integration not found for webhook booking", {
      item_id: itemId,
      error: integrationError?.message,
    });
    return;
  }

  // Extract guest contact data
  const guestName =
    booking.customer?.name ||
    booking.contact?.name ||
    booking.guest?.name ||
    "Гость Avito";
  const guestEmail =
    booking.customer?.email ||
    booking.contact?.email ||
    booking.guest?.email ||
    null;
  const guestPhone =
    booking.customer?.phone ||
    booking.contact?.phone ||
    booking.guest?.phone ||
    null;

  // Normalize phone number
  const normalizePhone = (phone: string | null | undefined): string | null => {
    if (!phone) return null;
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) return `+7${cleaned}`;
    if (cleaned.length === 11 && cleaned.startsWith("7"))
      return `+${cleaned}`;
    if (cleaned.length === 11 && cleaned.startsWith("8"))
      return `+7${cleaned.slice(1)}`;
    return phone.startsWith("+") ? phone : `+${phone}`;
  };

  const normalizedPhone = normalizePhone(guestPhone);

  // Determine booking status
  const bookingStatus = booking.status === "paid" ? "confirmed" : "pending";

  // Prepare booking data
  const bookingData = {
    property_id: integration.property_id,
    avito_booking_id: typeof bookingId === "number" ? bookingId : parseInt(String(bookingId), 10),
    guest_name: guestName,
    guest_email: guestEmail,
    guest_phone: normalizedPhone,
    check_in: booking.check_in,
    check_out: booking.check_out,
    total_price: booking.base_price || booking.total_price || null,
    currency: booking.currency || "RUB",
    status: bookingStatus,
    source: "avito",
    external_id: String(bookingId),
  };

  // Check if booking exists
  const { data: existing } = await supabase
    .from("bookings")
    .select("id")
    .eq("avito_booking_id", bookingData.avito_booking_id)
    .maybeSingle();

  if (existing) {
    // Update existing booking
    const { error: updateError } = await supabase
      .from("bookings")
      .update(bookingData)
      .eq("id", existing.id);

    if (updateError) {
      console.error("Failed to update booking from webhook", {
        booking_id: bookingId,
        error: updateError,
      });
    } else {
      console.log("Updated booking from webhook", {
        booking_id: bookingId,
        guest_name: guestName,
        has_phone: !!normalizedPhone,
        has_email: !!guestEmail,
      });
    }
  } else {
    // Insert new booking
    const { error: insertError } = await supabase
      .from("bookings")
      .insert(bookingData);

    if (insertError) {
      console.error("Failed to create booking from webhook", {
        booking_id: bookingId,
        error: insertError,
      });
    } else {
      console.log("Created booking from webhook", {
        booking_id: bookingId,
        guest_name: guestName,
        has_phone: !!normalizedPhone,
        has_email: !!guestEmail,
      });
    }
  }
}

/**
 * Handle booking cancellation event
 */
async function handleBookingCancellation(
  payload: AvitoWebhookPayload,
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  const bookingId = payload.booking_id;
  const itemId = payload.item_id;

  if (!bookingId || !itemId) {
    console.warn("Invalid cancellation data in webhook", {
      booking_id: bookingId,
      item_id: itemId,
    });
    return;
  }

  // Find integration by item_id
  const { data: integration } = await supabase
    .from("integrations")
    .select("property_id")
    .eq("platform", "avito")
    .eq("avito_item_id", String(itemId))
    .eq("is_active", true)
    .maybeSingle();

  if (!integration) {
    console.warn("Integration not found for webhook cancellation", {
      item_id: itemId,
    });
    return;
  }

  // Delete or mark booking as cancelled
  const bookingIdNum =
    typeof bookingId === "number"
      ? bookingId
      : parseInt(String(bookingId), 10);

  const { error: deleteError } = await supabase
    .from("bookings")
    .delete()
    .eq("avito_booking_id", bookingIdNum)
    .eq("property_id", integration.property_id);

  if (deleteError) {
    console.error("Failed to delete booking from webhook", {
      booking_id: bookingId,
      error: deleteError,
    });
  } else {
    console.log("Deleted booking from webhook", {
      booking_id: bookingId,
    });
  }
}

