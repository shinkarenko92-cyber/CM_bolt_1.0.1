/**
 * avito-message-poller — server-side cron that checks Avito for new messages
 * and fires Web Push notifications when the app is closed.
 *
 * Flow:
 * 1. Fetch all active integrations with messenger:read scope
 * 2. For each integration, call Avito chats API to get unread counts
 * 3. Compare with stored `last_notified_unread` on the chat row
 * 4. If Avito reports more unread messages → call send-push for the owner
 * 5. Update the chat's unread_count in DB
 *
 * Deploy:  supabase functions deploy avito-message-poller --no-verify-jwt
 * Cron:    Set up via Supabase Dashboard -> Database -> Cron Jobs
 *          Schedule: every 2 minutes, Edge Function: avito-message-poller
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOG = "[avito-message-poller]";
const AVITO_API_BASE = "https://api.avito.ru";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface Integration {
  id: string;
  property_id: string;
  avito_user_id: string | number;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  scope: string | null;
}

interface AvitoChat {
  id: string;
  unread_count: number;
  last_message?: {
    content?: { text?: string };
    direction?: "in" | "out";
    created?: string | number;
  };
  users?: Array<{ user_id?: string; id?: number; name: string }>;
  context?: { value?: { title?: string } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Get all active integrations with messenger:read scope
    const { data: integrations, error: intErr } = await supabase
      .from("integrations")
      .select("id, property_id, avito_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, scope")
      .eq("platform", "avito")
      .eq("is_active", true)
      .like("scope", "%messenger:read%");

    if (intErr || !integrations?.length) {
      console.log(`${LOG} No messenger integrations found`, intErr?.message);
      return new Response(JSON.stringify({ checked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let pushesSent = 0;
    let chatsChecked = 0;

    for (const integration of integrations as Integration[]) {
      const avitoUserId = Number(integration.avito_user_id);
      if (!Number.isFinite(avitoUserId) || avitoUserId <= 0) continue;

      // Get access token
      const accessToken = await getAccessToken(supabase, integration);
      if (!accessToken) {
        console.error(`${LOG} No token for integration ${integration.id}`);
        continue;
      }

      // Get property owner
      const { data: property } = await supabase
        .from("properties")
        .select("owner_id")
        .eq("id", integration.property_id)
        .single();
      if (!property?.owner_id) continue;

      // 2. Call Avito chats API
      let avitoChats: AvitoChat[];
      try {
        const res = await fetch(
          `${AVITO_API_BASE}/messenger/v2/accounts/${avitoUserId}/chats?limit=50`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) {
          console.error(`${LOG} Avito chats API ${res.status} for integration ${integration.id}`);
          continue;
        }
        const data = await res.json();
        avitoChats = data.chats ?? [];
      } catch (err) {
        console.error(`${LOG} Avito fetch error:`, err);
        continue;
      }

      // 3. Get existing chats from DB for this owner
      const { data: dbChats } = await supabase
        .from("chats")
        .select("id, avito_chat_id, unread_count, last_push_unread")
        .eq("owner_id", property.owner_id)
        .eq("integration_id", integration.id);

      const dbChatMap = new Map(
        (dbChats ?? []).map((c: { avito_chat_id: string; unread_count: number; last_push_unread?: number; id: string }) => [
          c.avito_chat_id,
          c,
        ])
      );

      // 4. Check for new unread messages
      for (const avitoChat of avitoChats) {
        chatsChecked++;
        if (avitoChat.unread_count <= 0) continue;

        const dbChat = dbChatMap.get(avitoChat.id);
        const lastPushUnread = (dbChat as { last_push_unread?: number } | undefined)?.last_push_unread ?? 0;

        // Only notify if unread count increased since last push
        if (avitoChat.unread_count <= lastPushUnread) continue;

        // Determine contact name
        const ownerIdStr = String(avitoUserId);
        const contact = avitoChat.users?.find(
          (u) => String(u.user_id ?? u.id ?? "") !== ownerIdStr
        );
        const contactName = contact?.name ?? "Avito";
        const listingTitle = avitoChat.context?.value?.title ?? null;

        const lastMsg = avitoChat.last_message;
        const msgBody =
          lastMsg?.direction === "in"
            ? lastMsg?.content?.text ?? "Новое сообщение"
            : "Новое сообщение";

        const title = listingTitle
          ? `${contactName} · ${listingTitle}`
          : contactName;

        // 5. Fire send-push
        const { error: pushErr } = await supabase.functions.invoke("send-push", {
          body: {
            user_id: property.owner_id,
            title,
            body: msgBody,
            tag: `avito-msg-${avitoChat.id}`,
            url: "/?view=messages",
          },
        });

        if (pushErr) {
          console.error(`${LOG} send-push error:`, pushErr);
        } else {
          pushesSent++;
          console.log(`${LOG} push sent for chat ${avitoChat.id} to user ${property.owner_id}`);
        }

        // Update last_push_unread so we don't re-notify
        if (dbChat) {
          await supabase
            .from("chats")
            .update({
              unread_count: avitoChat.unread_count,
              last_push_unread: avitoChat.unread_count,
            })
            .eq("id", (dbChat as { id: string }).id);
        }
      }
    }

    const result = {
      integrations: integrations.length,
      chats_checked: chatsChecked,
      pushes_sent: pushesSent,
    };
    console.log(`${LOG} done`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`${LOG} fatal:`, error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Decrypts and optionally refreshes the Avito access token for an integration.
 */
async function getAccessToken(
  supabase: ReturnType<typeof createClient>,
  integration: Integration
): Promise<string | null> {
  // Check if token needs refresh
  let tokenExpires = integration.token_expires_at;
  if (tokenExpires && typeof tokenExpires === "string" && !tokenExpires.includes("Z")) {
    tokenExpires += "Z";
  }
  const expiresMs = tokenExpires ? new Date(tokenExpires).getTime() : 0;
  const needsRefresh = !tokenExpires || Number.isNaN(expiresMs) || expiresMs < Date.now() + 5 * 60 * 1000;

  if (needsRefresh && integration.refresh_token_encrypted) {
    // Refresh token
    try {
      const { data: refreshToken } = await supabase.rpc("decrypt_avito_token", {
        encrypted_token: integration.refresh_token_encrypted,
      });
      if (!refreshToken) return null;

      const clientId = Deno.env.get("AVITO_CLIENT_ID") ?? "";
      const clientSecret = Deno.env.get("AVITO_CLIENT_SECRET") ?? "";

      const res = await fetch(`${AVITO_API_BASE}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!res.ok) {
        console.error(`${LOG} token refresh failed: ${res.status}`);
        // Try using existing token anyway
      } else {
        const data = await res.json();
        if (data.access_token) {
          const newExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();

          // Encrypt and save new tokens
          const { data: encAccess } = await supabase.rpc("encrypt_avito_token", { token: data.access_token });
          const { data: encRefresh } = await supabase.rpc("encrypt_avito_token", {
            token: data.refresh_token ?? refreshToken,
          });

          await supabase
            .from("integrations")
            .update({
              access_token_encrypted: encAccess ?? data.access_token,
              refresh_token_encrypted: encRefresh ?? integration.refresh_token_encrypted,
              token_expires_at: newExpiresAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", integration.id);

          return data.access_token;
        }
      }
    } catch (err) {
      console.error(`${LOG} refresh error:`, err);
    }
  }

  // Decrypt existing token
  try {
    const { data: decrypted } = await supabase.rpc("decrypt_avito_token", {
      encrypted_token: integration.access_token_encrypted,
    });
    return decrypted ?? null;
  } catch {
    return null;
  }
}
