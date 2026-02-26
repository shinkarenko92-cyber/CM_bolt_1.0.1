/**
 * Avito Poller Edge Function
 * Cron job: processes avito_sync_queue in batches with 10s deadline, retry with backoff, metrics.
 * Passes booking_limit/booking_offset to avito_sync for paginated Avito API calls.
 * Токены Avito не кэшируются здесь — запрос и кэш токенов выполняются в avito_sync.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOG_PREFIX = "[avito-poller]";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** Лимит выполнения (мс). Останавливаем обработку до истечения 10s. */
const DEADLINE_MS = 9_500;
/** Размер страницы очереди за один запуск */
const QUEUE_PAGE_SIZE = 10;
/** Лимит бронирований за один запрос к Avito в avito_sync (пагинация) */
const BOOKING_PAGE_LIMIT = 100;
/** Максимум повторов вызова avito_sync при ошибке */
const MAX_SYNC_RETRIES = 3;
/** Базовая задержка (мс) для exponential backoff */
const BACKOFF_BASE_MS = 1_000;

interface QueueItem {
  id: string;
  integration_id: string;
  integrations?: {
    sync_interval_seconds?: number;
  } | null;
}

interface PollerMetrics {
  duration_ms: number;
  processed: number;
  success: number;
  failed: number;
  deadline_hit: boolean;
  errors: string[];
}

/**
 * Вызывает avito_sync с exponential backoff при ошибке.
 * @param supabase - клиент Supabase
 * @param integrationId - id интеграции
 * @param bookingLimit - лимит бронирований для пагинации (передаётся в avito_sync)
 * @param bookingOffset - смещение для пагинации
 * @returns результат invoke или бросает ошибку после всех повторов
 */
async function invokeAvitoSyncWithRetry(
  supabase: ReturnType<typeof createClient>,
  integrationId: string,
  bookingLimit: number,
  bookingOffset: number
): Promise<{ data: unknown; error: Error | null }> {
  const body = {
    action: "sync" as const,
    integration_id: integrationId,
    booking_limit: bookingLimit,
    booking_offset: bookingOffset,
  };
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_SYNC_RETRIES; attempt++) {
    const { data, error: syncError } = await supabase.functions.invoke("avito_sync", { body });
    if (!syncError) {
      const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
      if (payload?.hasError === true || payload?.success === false) {
        lastError = new Error(
          typeof payload.errorMessage === "string" ? payload.errorMessage : "Sync returned error state"
        );
      } else {
        return { data, error: null };
      }
    } else {
      lastError = syncError instanceof Error ? syncError : new Error(String(syncError));
    }
    if (attempt < MAX_SYNC_RETRIES - 1) {
      const waitMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
      console.log(`${LOG_PREFIX} Retry in ${waitMs}ms (attempt ${attempt + 1}/${MAX_SYNC_RETRIES}) integration_id=${integrationId}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  return { data: null, error: lastError };
}

/**
 * Обрабатывает одну страницу очереди с учётом дедлайна 10s, возвращает метрики и тело ответа.
 * @param supabase - клиент Supabase
 * @param useStreaming - если true, возвращает stream для ответа (один chunk с JSON)
 */
async function runPoller(
  supabase: ReturnType<typeof createClient>,
  useStreaming: boolean
): Promise<{ body: Record<string, unknown>; stream?: ReadableStream<Uint8Array> }> {
  const startTime = Date.now();
  const errors: string[] = [];
  let successCount = 0;
  let failCount = 0;
  let deadlineHit = false;

  const { data: queueItems, error: queueError } = await supabase
    .from("avito_sync_queue")
    .select("id, integration_id, integrations(sync_interval_seconds)")
    .eq("status", "pending")
    .lte("next_sync_at", new Date().toISOString())
    .limit(QUEUE_PAGE_SIZE)
    .order("next_sync_at", { ascending: true });

  if (queueError) {
    console.log(`${LOG_PREFIX} Queue fetch error:`, queueError.message);
    throw queueError;
  }

  const items = (queueItems ?? []) as QueueItem[];
  if (items.length === 0) {
    const duration_ms = Date.now() - startTime;
    const body = { processed: 0, message: "No items to sync", duration_ms, success: 0, failed: 0 };
    console.log(`${LOG_PREFIX} metrics`, { ...body, deadline_hit: false, errors: [] });
    return { body };
  }

  let processed = 0;
  for (const item of items) {
    if (Date.now() - startTime >= DEADLINE_MS) {
      deadlineHit = true;
      console.log(`${LOG_PREFIX} Deadline reached, stopping after ${processed} items`);
      break;
    }

    const intervalSeconds =
      typeof item.integrations?.sync_interval_seconds === "number" && item.integrations.sync_interval_seconds > 0
        ? item.integrations.sync_interval_seconds
        : 10;
    const nextSyncAt = new Date(Date.now() + intervalSeconds * 1000).toISOString();
    const nextRetryAt = new Date(Date.now() + Math.max(intervalSeconds, 60) * 1000).toISOString();

    const { error: syncErr } = await invokeAvitoSyncWithRetry(
      supabase,
      item.integration_id,
      BOOKING_PAGE_LIMIT,
      0
    );

    if (syncErr) {
      errors.push(`${item.integration_id}: ${syncErr.message}`);
      await supabase
        .from("avito_sync_queue")
        .update({ status: "pending", next_sync_at: nextRetryAt })
        .eq("id", item.id);
      failCount++;
      console.error(`${LOG_PREFIX} Sync failed integration_id=${item.integration_id}`, syncErr.message);
    } else {
      await supabase
        .from("avito_sync_queue")
        .update({ status: "pending", next_sync_at: nextSyncAt })
        .eq("id", item.id);
      successCount++;
    }
    processed++;
  }

  const duration_ms = Date.now() - startTime;
  const metrics: PollerMetrics = {
    duration_ms,
    processed,
    success: successCount,
    failed: failCount,
    deadline_hit: deadlineHit,
    errors,
  };
  console.log(`${LOG_PREFIX} metrics`, metrics);

  const body: Record<string, unknown> = {
    processed,
    success: successCount,
    failed: failCount,
    duration_ms,
    deadline_hit: deadlineHit,
  };
  if (errors.length > 0) body.errors = errors;

  if (!useStreaming) {
    return { body };
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(JSON.stringify(body) + "\n"));
      controller.close();
    },
  });
  return { body, stream };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.log(`${LOG_PREFIX} Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const useStreaming = new URL(req.url).searchParams.get("stream") === "1";
    const result = await runPoller(supabase, useStreaming);

    if (result.stream) {
      return new Response(result.stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    return new Response(JSON.stringify(result.body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} Fatal:`, message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
