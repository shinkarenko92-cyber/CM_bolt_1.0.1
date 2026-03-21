/**
 * Generic retry helper for Supabase queries.
 * Retries on network errors ("Failed to fetch") with exponential backoff.
 */

export type QueryResult<T> = {
  data: T | null;
  error: { message: string; details?: string; hint?: string; code?: string } | null;
};

export async function retryQuery<T>(
  queryFn: () => Promise<QueryResult<T>>,
  retries = 3,
  delay = 1000
): Promise<QueryResult<T>> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await queryFn();
      if (!result.error || !result.error.message.includes('Failed to fetch')) {
        return result;
      }
      if (attempt === retries) {
        console.error(`Query failed after ${retries} attempts:`, result.error);
        return result;
      }
      await new Promise(r => setTimeout(r, delay * attempt));
    } catch (error: unknown) {
      if (attempt === retries) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Query failed after ${retries} attempts:`, msg);
        return {
          data: null,
          error: { message: msg, details: error instanceof Error ? error.stack : undefined },
        };
      }
      await new Promise(r => setTimeout(r, delay * attempt));
    }
  }
  return { data: null, error: { message: 'Max retries exceeded' } };
}
