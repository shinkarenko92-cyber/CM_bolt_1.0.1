/**
 * Avito Messenger Proxy - server-side proxy to avoid CORS when calling Avito API from browser.
 * Actions: getChats, getMessages, sendMessage.
 * Documentation: https://developers.avito.ru/api-catalog/messenger/documentation
 *
 * Deploy: supabase functions deploy avito-messenger
 * If you get 403, ensure verify_jwt = false in supabase/config.toml for this function (JWT is validated inside).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const AVITO_API_BASE = "https://api.avito.ru";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Action = "getChats" | "getMessages" | "sendMessage";

interface BodyGetChats {
  action: "getChats";
  integration_id: string;
  item_id?: string;
  limit?: number;
  offset?: number;
}

interface BodyGetMessages {
  action: "getMessages";
  integration_id: string;
  chat_id: string;
  limit?: number;
  offset?: number;
}

interface BodySendMessage {
  action: "sendMessage";
  integration_id: string;
  chat_id: string;
  text: string;
  attachments?: Array<{ type: string; url: string; name?: string }>;
}

type Body = BodyGetChats | BodyGetMessages | BodySendMessage;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", details: userError?.message }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!body?.action || !body?.integration_id) {
    return new Response(
      JSON.stringify({ error: "Missing action or integration_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("id, property_id, avito_user_id, avito_account_id, access_token_encrypted")
    .eq("id", body.integration_id)
    .eq("platform", "avito")
    .eq("is_active", true)
    .single();

  if (integrationError || !integration) {
    return new Response(
      JSON.stringify({ error: "Integration not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("owner_id")
    .eq("id", integration.property_id)
    .single();

  if (propertyError || !property || property.owner_id !== user.id) {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let accessToken = integration.access_token_encrypted;
  try {
    const { data: decrypted } = await supabase.rpc("decrypt_avito_token", {
      encrypted_token: accessToken,
    });
    if (decrypted) accessToken = decrypted;
  } catch {
    // RPC may not exist or token not encrypted
  }

  const userId = String(integration.avito_user_id ?? integration.avito_account_id ?? "");
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Integration missing avito_user_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  try {
    if (body.action === "getChats") {
      const b = body as BodyGetChats;
      let url = `${AVITO_API_BASE}/messenger/v2/accounts/${userId}/chats`;
      const params = new URLSearchParams();
      if (b.item_id) params.append("item_id", b.item_id);
      if (b.limit != null) params.append("limit", String(b.limit));
      if (b.offset != null) params.append("offset", String(b.offset));
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: "Avito API error", status: res.status, data }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "getMessages") {
      const b = body as BodyGetMessages;
      if (!b.chat_id) {
        return new Response(
          JSON.stringify({ error: "Missing chat_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      let url = `${AVITO_API_BASE}/messenger/v2/accounts/${userId}/chats/${b.chat_id}/messages`;
      const params = new URLSearchParams();
      if (b.limit != null) params.append("limit", String(b.limit));
      if (b.offset != null) params.append("offset", String(b.offset));
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: "Avito API error", status: res.status, data }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "sendMessage") {
      const b = body as BodySendMessage;
      if (!b.chat_id) {
        return new Response(
          JSON.stringify({ error: "Missing chat_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const postBody: { text?: string; attachments?: typeof b.attachments } = {};
      if (b.text) postBody.text = b.text;
      if (b.attachments?.length) postBody.attachments = b.attachments;

      const res = await fetch(
        `${AVITO_API_BASE}/messenger/v2/accounts/${userId}/chats/${b.chat_id}/messages`,
        { method: "POST", headers, body: JSON.stringify(postBody) }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: "Avito API error", status: res.status, data }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("avito-messenger proxy error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
