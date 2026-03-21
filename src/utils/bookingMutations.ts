import { supabase } from '@/lib/supabase';

/**
 * Returns true for Postgres/PostgREST errors caused by unknown columns (schema mismatch).
 * Used to retry insert/update stripping unsupported fields one group at a time.
 */
function isColumnError(e: unknown): boolean {
  const err = e as { code?: string; status?: number; message?: string };
  return (
    err?.code === 'PGRST204' ||
    err?.status === 400 ||
    err?.message?.includes('400') ||
    err?.message?.includes('Could not find the') ||
    err?.message?.includes('created_by') ||
    err?.message?.includes('updated_by') ||
    err?.message?.includes('deposit_received') ||
    err?.message?.includes('deposit_returned') ||
    err?.message?.includes('deposit_amount') ||
    err?.message?.includes('guest_id') ||
    err?.message?.includes('extra_services')
  );
}

type Payload = Record<string, unknown>;
type SupabaseResult<T> = { data: T | null; error: unknown };

async function retryStripping<T>(
  fn: (payload: Payload) => Promise<SupabaseResult<T>>,
  payload: Payload,
  stripGroups: string[][]
): Promise<{ result: SupabaseResult<T>; finalPayload: Payload }> {
  const p = { ...payload };
  let result = await fn(p);

  for (const group of stripGroups) {
    if (result.error && isColumnError(result.error)) {
      group.forEach(k => { delete p[k]; });
      result = await fn(p);
    }
  }

  return { result, finalPayload: p };
}

const STRIP_GROUPS_INSERT = [
  ['created_by', 'updated_by'],
  ['deposit_received', 'deposit_returned'],
  ['deposit_amount'],
  ['guest_id', 'extra_services_amount'],
];

const STRIP_GROUPS_UPDATE = [
  ['updated_by'],
  ['deposit_received', 'deposit_returned'],
  ['deposit_amount'],
  ['guest_id', 'extra_services_amount'],
];

export async function insertBookingWithRetry(payload: Payload) {
  return retryStripping(
    (p) => supabase.from('bookings').insert([p]).select() as Promise<SupabaseResult<unknown[]>>,
    payload,
    STRIP_GROUPS_INSERT
  );
}

export async function updateBookingWithRetry(id: string, payload: Payload) {
  return retryStripping(
    (p) => supabase.from('bookings').update(p).eq('id', id) as Promise<SupabaseResult<null>>,
    payload,
    STRIP_GROUPS_UPDATE
  );
}
