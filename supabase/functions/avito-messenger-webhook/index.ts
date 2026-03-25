/**
 * Avito Messenger Webhook Handler
 * Handles webhook notifications from Avito Messenger API
 * Documentation: https://developers.avito.ru/api-catalog/messenger/documentation
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/** Avito may send timestamps as Unix seconds (number or string). Convert to ISO for Postgres. */
function toIsoDate(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const ms = n <= 9999999999 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

interface AvitoMessengerWebhookPayload {
  event: string; // e.g., "message.new", "chat.new", "chat.updated"
  chat_id?: string;
  message_id?: string;
  user_id?: string;
  item_id?: string;
  account_id?: string;
  chat?: {
    id: string;
    item_id?: string;
    created: string;
    updated: string;
    unread_count?: number;
    users?: Array<{
      user_id: string;
      name: string;
      avatar?: {
        url: string;
      };
    }>;
  };
  message?: {
    id: string;
    chat_id: string;
    created?: string | number;
    content?: {
      text?: string;
      attachments?: Array<{ type: string; url: string; name?: string }>;
    };
    author?: { user_id: string; name: string };
    author_id?: number;
  };
  timestamp?: string;
}

type WebhookMessage = NonNullable<AvitoMessengerWebhookPayload["message"]>;

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

    const rawBody = await req.text();

    // Verify webhook signature (HMAC-SHA256)
    const webhookSecret = Deno.env.get("AVITO_WEBHOOK_SECRET");
    if (webhookSecret) {
      const signature = req.headers.get("X-Avito-Signature");
      if (!signature) {
        console.error("Signature verification failed: X-Avito-Signature header is missing");
        return new Response(JSON.stringify({ error: "Missing signature" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw",
          encoder.encode(webhookSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
        const expected = Array.from(new Uint8Array(sig))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (signature !== expected) {
          console.error("Invalid webhook signature", { received: signature, expected });
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } else {
      console.warn("AVITO_WEBHOOK_SECRET is not set. Webhook signature verification is skipped.");
    }

    const payload: AvitoMessengerWebhookPayload = JSON.parse(rawBody);

    console.log("Avito Messenger webhook received", {
      event: payload.event,
      chat_id: payload.chat_id || payload.chat?.id,
      message_id: payload.message_id || payload.message?.id,
      user_id: payload.user_id,
      item_id: payload.item_id || payload.chat?.item_id,
    });

    // Handle different event types
    switch (payload.event) {
      case "message.new": {
        await handleNewMessage(payload, supabase);
        break;
      }
      case "chat.new": {
        await handleNewChat(payload, supabase);
        break;
      }
      case "chat.updated": {
        await handleChatUpdate(payload, supabase);
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
    console.error("Error processing webhook:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Handle new message event
 */
async function handleNewMessage(
  payload: AvitoMessengerWebhookPayload,
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  if (!payload.message || !payload.chat_id) {
    console.error("Missing message or chat_id in payload");
    return;
  }

  const message = payload.message;
  const chatId = payload.chat_id || payload.chat?.id;

  if (!chatId) {
    console.error("Missing chatId in message.new payload");
    return;
  }

  // Find chat by avito_chat_id
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("id, owner_id, avito_user_id")
    .eq("avito_chat_id", chatId)
    .maybeSingle();

  if (chatError) {
    console.error("Database error looking up chat", { chatId, error: chatError });
    return;
  }

  if (!chat) {
    console.warn("Chat not found, attempting to create from message payload", { chatId });
    // Try to create chat if it doesn't exist
    if (payload.chat || payload.user_id || payload.account_id) {
      await handleNewChat(payload, supabase);
      // Retry finding chat
      const { data: retryChat } = await supabase
        .from("chats")
        .select("id")
        .eq("avito_chat_id", chatId)
        .single();
      
      if (retryChat) {
        await saveMessage(retryChat.id, message, supabase);
      }
    }
    return;
  }

  await saveMessage(chat.id, message, supabase);
}

/**
 * Save message to database
 */
async function saveMessage(
  chatId: string,
  message: WebhookMessage,
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  // Check if message already exists
  const { data: existing } = await supabase
    .from("messages")
    .select("id")
    .eq("avito_message_id", message.id)
    .eq("chat_id", chatId)
    .maybeSingle();

  if (existing) {
    console.log("Message already exists", { messageId: message.id });
    return;
  }

  // Determine sender type (user or contact)
  // If author.user_id matches avito_user_id from chat, it's from the owner (user)
  // Otherwise, it's from the contact
  const { data: chat } = await supabase
    .from("chats")
    .select("avito_user_id")
    .eq("id", chatId)
    .single();

  const ownerAvitoId = chat?.avito_user_id != null ? String(chat.avito_user_id) : "";
  const authorId = message.author_id != null ? String(message.author_id) : message.author?.user_id ?? "";
  const senderType = authorId && ownerAvitoId && authorId === ownerAvitoId ? "user" : "contact";
  const senderName = message.author?.name ?? (senderType === "user" ? "You" : "Contact");
  const content = message.content ?? {};
  const createdAt = toIsoDate(message.created);

  const { error } = await supabase.from("messages").insert({
    chat_id: chatId,
    avito_message_id: message.id,
    sender_type: senderType,
    sender_name: senderName,
    text: content.text ?? null,
    attachments: content.attachments ?? [],
    created_at: createdAt ?? new Date().toISOString(),
    is_read: senderType === "user",
  });

  if (error) {
    console.error("Error saving message:", error);
    throw error;
  }

  console.log("Message saved", { messageId: message.id, chatId });

  // Send Web Push if message is from contact (not the owner)
  if (senderType === "contact") {
    // Find owner_id for this chat
    const { data: chatOwner } = await supabase
      .from("chats")
      .select("owner_id, contact_name")
      .eq("id", chatId)
      .single();

    if (chatOwner?.owner_id) {
      console.log("Invoking send-push for user", chatOwner.owner_id, "for chat", chatId);
      // Fire-and-forget — don't block webhook response
      supabase.functions
        .invoke("send-push", {
          body: {
            user_id: chatOwner.owner_id,
            title: chatOwner.contact_name ?? "Новое сообщение от Avito",
            body: content.text ?? "📷 Фото",
            tag: `avito-msg-${chatId}`,
            url: `/?view=messages&chatId=${chatId}`,
          },
        })
        .then((res) => {
          console.log("send-push response:", res.data);
          if (res.error) console.error("send-push error:", res.error);
        })
        .catch((e: unknown) => console.error("send-push invoke failed:", e));
    } else {
      console.warn("Could not find owner_id for chat to send push notification", { chatId });
    }
  }
}

/**
 * Handle new chat event
 */
async function handleNewChat(
  payload: AvitoMessengerWebhookPayload,
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  const chat = payload.chat;
  const avitoUserId = String(payload.user_id || payload.account_id);

  if (!chat && !payload.chat_id) {
    console.error("Missing chat data in payload for handleNewChat");
    return;
  }

  if (!avitoUserId || avitoUserId === "undefined" || avitoUserId === "null") {
    console.error("Missing valid user_id/account_id in payload for handleNewChat", { avitoUserId });
    return;
  }

  const itemId = payload.item_id || chat?.item_id;

  // Find integration by avito_user_id; when item_id is present, filter by avito_item_id for correct property
  // We use BIGINT in DB, so we pass as string to avoid precision issues in JSON/JS if large.
  let query = supabase
    .from("integrations")
    .select("id, property_id, avito_user_id")
    .or(`avito_user_id.eq.${avitoUserId},avito_account_id.eq.${avitoUserId}`)
    .eq("platform", "avito")
    .eq("is_active", true);

  // Avito item IDs can be stored as numbers in some places and strings in others, but BIGINT in DB.
  if (itemId != null && itemId !== "" && itemId !== "0") {
    query = query.eq("avito_item_id", String(itemId));
  }
  const { data: integration, error: integrationError } = await query.maybeSingle();

  if (integrationError || !integration) {
    console.error("Integration not found for handleNewChat", {
      avitoUserId,
      itemId,
      error: integrationError,
    });
    return;
  }

  // Get property owner_id
  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("owner_id")
    .eq("id", integration.property_id)
    .single();

  if (propertyError || !property) {
    console.error("Property not found", { error: propertyError });
    return;
  }

  // Find contact user (not the owner)
  const contactUser = chat?.users?.find((u) => String(u.user_id) !== avitoUserId);
  const avitoChatId = chat?.id || payload.chat_id;

  // Check if chat already exists
  const { data: existingChat } = await supabase
    .from("chats")
    .select("id")
    .eq("avito_chat_id", avitoChatId)
    .eq("owner_id", property.owner_id)
    .maybeSingle();

  if (existingChat) {
    console.log("Chat already exists", { chatId: avitoChatId });
    return;
  }

  // Insert chat
  const { error } = await supabase.from("chats").insert({
    owner_id: property.owner_id,
    property_id: integration.property_id,
    avito_chat_id: avitoChatId,
    avito_user_id: avitoUserId,
    avito_item_id: itemId ? String(itemId) : null,
    integration_id: integration.id,
    contact_name: contactUser?.name || null,
    contact_avatar_url: contactUser?.avatar?.url || null,
    status: "new",
    unread_count: 0,
    last_message_at: toIsoDate(chat?.updated ?? chat?.created),
  });

  if (error) {
    console.error("Error saving chat:", error);
    throw error;
  }

  console.log("Chat saved", { chatId: avitoChatId, ownerId: property.owner_id });
}

/**
 * Handle chat update event
 */
async function handleChatUpdate(
  payload: AvitoMessengerWebhookPayload,
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  if (!payload.chat || !payload.chat_id) {
    console.error("Missing chat or chat_id in payload");
    return;
  }

  const chat = payload.chat;

  // Find chat by avito_chat_id
  const { data: existingChat, error: chatError } = await supabase
    .from("chats")
    .select("id")
    .eq("avito_chat_id", chat.id)
    .single();

  if (chatError || !existingChat) {
    console.error("Chat not found for update", { chatId: chat.id, error: chatError });
    return;
  }

  // Update chat
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const lastMessageAt = toIsoDate(chat.updated ?? chat.created);
  if (lastMessageAt) {
    updateData.last_message_at = lastMessageAt;
  }

  if (chat.unread_count !== undefined) {
    updateData.unread_count = chat.unread_count;
  }

  const { error } = await supabase
    .from("chats")
    .update(updateData)
    .eq("id", existingChat.id);

  if (error) {
    console.error("Error updating chat:", error);
    throw error;
  }

  console.log("Chat updated", { chatId: chat.id });
}
