import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotifyCleanerPayload = {
  task_id: string;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Telegram API error:", res.status, body);
    throw new Error(`Telegram API error: ${res.status}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Missing Supabase configuration" }, 500);
    }

    if (!telegramToken) {
      console.warn("TELEGRAM_BOT_TOKEN is not set; notify-cleaner will be a no-op.");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const client = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const contentType = req.headers.get("Content-Type") || "";
    if (req.method !== "POST" || !req.body || !contentType.includes("application/json")) {
      return jsonResponse(
        { error: "Content-Type: application/json and request body required" },
        400,
      );
    }

    let payload: NotifyCleanerPayload;
    try {
      payload = (await req.json()) as NotifyCleanerPayload;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    if (!payload.task_id) {
      return jsonResponse({ error: "task_id is required" }, 400);
    }

    // Load task with property and cleaner
    const { data: taskRow, error: taskError } = await client
      .from("cleaning_tasks")
      .select(
        `
          id,
          scheduled_date,
          scheduled_time,
          door_code,
          address,
          property:properties (
            name,
            address
          ),
          cleaner:cleaners (
            telegram_chat_id,
            full_name
          )
        `,
      )
      .eq("id", payload.task_id)
      .single();

    if (taskError || !taskRow) {
      console.error("Failed to load cleaning task:", taskError);
      return jsonResponse({ error: "Failed to load cleaning task" }, 500);
    }

    const cleaner = taskRow.cleaner as { telegram_chat_id?: string | null; full_name?: string | null } | null;
    const property = taskRow.property as { name?: string | null; address?: string | null } | null;

    if (!telegramToken || !cleaner?.telegram_chat_id) {
      // No bot token or no chat id: do not fail the request; just log
      console.warn("Missing TELEGRAM_BOT_TOKEN or cleaner.telegram_chat_id; skipping Telegram notification");
      return jsonResponse({ success: true, skipped: true }, 200);
    }

    const date = taskRow.scheduled_date as string;
    const time = taskRow.scheduled_time as string;
    const address = (taskRow.address as string | null) ?? property?.address ?? "";

    const lines: string[] = [];
    lines.push("🧹 <b>Новая уборка</b>");
    if (cleaner?.full_name) {
      lines.push(`Исполнитель: ${cleaner.full_name}`);
    }
    if (property?.name) {
      lines.push(`Объект: ${property.name}`);
    }
    if (address) {
      lines.push(`Адрес: ${address}`);
    }
    lines.push(`Дата: ${date}`);
    lines.push(`Время: ${time}`);
    if (taskRow.door_code) {
      lines.push(`Код двери: <code>${taskRow.door_code}</code>`);
    }

    const text = lines.join("\n");

    await sendTelegramMessage(telegramToken, cleaner.telegram_chat_id, text);

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    console.error("Unexpected error in notify-cleaner:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

