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
    created: string;
    content: {
      text?: string;
      attachments?: Array<{
        type: string;
        url: string;
        name?: string;
      }>;
    };
    author: {
      user_id: string;
      name: string;
    };
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
    const signature = req.headers.get("X-Avito-Signature");
    if (signature) {
      // TODO: Implement signature verification when Avito provides documentation
      console.log("Webhook signature received", { signature });
    }

    // Parse webhook payload
    const payload: AvitoMessengerWebhookPayload = await req.json();

    console.log("Avito Messenger webhook received", {
      event: payload.event,
      chat_id: payload.chat_id,
      message_id: payload.message_id,
      user_id: payload.user_id,
      item_id: payload.item_id,
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
  const chatId = payload.chat_id;

  // Find chat by avito_chat_id
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("id, owner_id, avito_user_id")
    .eq("avito_chat_id", chatId)
    .single();

  if (chatError || !chat) {
    console.error("Chat not found", { chatId, error: chatError });
    // Try to create chat if it doesn't exist
    if (payload.chat && payload.user_id) {
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
  message: AvitoMessengerWebhookPayload["message"]!,
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

  const senderType = chat?.avito_user_id === message.author.user_id ? "user" : "contact";

  // Insert message
  const { error } = await supabase.from("messages").insert({
    chat_id: chatId,
    avito_message_id: message.id,
    sender_type: senderType,
    sender_name: message.author.name,
    text: message.content.text || null,
    attachments: message.content.attachments || [],
    is_read: senderType === "user", // Messages from user are read by default
  });

  if (error) {
    console.error("Error saving message:", error);
    throw error;
  }

  console.log("Message saved", { messageId: message.id, chatId });
}

/**
 * Handle new chat event
 */
async function handleNewChat(
  payload: AvitoMessengerWebhookPayload,
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  if (!payload.chat || !payload.user_id) {
    console.error("Missing chat or user_id in payload");
    return;
  }

  const chat = payload.chat;
  const avitoUserId = String(payload.user_id);

  // Find integration by avito_user_id; when item_id is present, filter by avito_item_id for correct property
  let query = supabase
    .from("integrations")
    .select("id, property_id, avito_user_id")
    .eq("avito_user_id", avitoUserId)
    .eq("platform", "avito")
    .eq("is_active", true);
  if (payload.item_id != null && payload.item_id !== "") {
    query = query.eq("avito_item_id", String(payload.item_id));
  }
  const { data: integration, error: integrationError } = await query.maybeSingle();

  if (integrationError || !integration) {
    console.error("Integration not found", {
      avitoUserId,
      itemId: payload.item_id,
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
  const contactUser = chat.users?.find((u) => u.user_id !== avitoUserId);

  // Check if chat already exists
  const { data: existingChat } = await supabase
    .from("chats")
    .select("id")
    .eq("avito_chat_id", chat.id)
    .eq("owner_id", property.owner_id)
    .maybeSingle();

  if (existingChat) {
    console.log("Chat already exists", { chatId: chat.id });
    return;
  }

  // Insert chat
  const { error } = await supabase.from("chats").insert({
    owner_id: property.owner_id,
    property_id: integration.property_id,
    avito_chat_id: chat.id,
    avito_user_id: avitoUserId,
    avito_item_id: payload.item_id ? String(payload.item_id) : null,
    integration_id: integration.id,
    contact_name: contactUser?.name || null,
    contact_avatar_url: contactUser?.avatar?.url || null,
    status: "new",
    unread_count: 0,
    last_message_at: chat.updated || chat.created,
  });

  if (error) {
    console.error("Error saving chat:", error);
    throw error;
  }

  console.log("Chat saved", { chatId: chat.id, ownerId: property.owner_id });
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

  if (chat.updated) {
    updateData.last_message_at = chat.updated;
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
