export type IcalUrlResult = {
  url: string;
  isLocalhost: boolean;
};

function isLocalhostHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

/**
 * Generates iCal URL for a property.
 *
 * Primary (recommended for Avito): `${VITE_SUPABASE_URL}/functions/v1/ical/${propertyId}.ics`
 * Fallback: `${window.location.origin}/functions/v1/ical/${propertyId}.ics`
 *
 * Note: Avito can't pull localhost urls; callers may show a warning when isLocalhost = true.
 */
export function getIcalUrl(propertyId: string): IcalUrlResult {
  const hasWindow = typeof window !== "undefined";
  const origin = hasWindow ? window.location.origin : "";

  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ?? undefined;

  // Prefer direct Supabase Functions URL for maximum compatibility with Avito importers.
  // (Some importers can be picky about proxies/rewrites.)
  const url = supabaseUrl
    ? `${supabaseUrl}/functions/v1/ical/${propertyId}.ics`
    : origin
      ? `${origin}/functions/v1/ical/${propertyId}.ics`
      : `/functions/v1/ical/${propertyId}.ics`;

  if (import.meta.env.DEV) console.log("iCal URL generated: " + url);

  // Compute localhost based on the generated URL host (not the app host),
  // so local dev doesn't show warnings if the URL is actually reachable.
  let isLocalhost = false;
  try {
    const u = new URL(url, origin || "http://localhost");
    isLocalhost = isLocalhostHostname(u.hostname);
  } catch {
    // Best-effort
    isLocalhost = false;
  }

  return {
    url,
    isLocalhost,
  };
}


