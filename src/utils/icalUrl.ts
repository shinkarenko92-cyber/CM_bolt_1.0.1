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
 * Primary: `${window.location.origin}/functions/v1/ical/${propertyId}.ics`
 * Fallback: if window is not available, tries `import.meta.env.VITE_SUPABASE_URL`.
 *
 * Note: Avito can't pull localhost urls; callers may show a warning when isLocalhost = true.
 */
export function getIcalUrl(propertyId: string): IcalUrlResult {
  const hasWindow = typeof window !== "undefined";
  const origin = hasWindow ? window.location.origin : "";
  const hostname = hasWindow ? window.location.hostname : "";

  const supabaseUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL as string | undefined;

  // Prefer current origin for any environment (prod/staging/localhost).
  let url =
    origin
      ? `${origin}/functions/v1/ical/${propertyId}.ics`
      : supabaseUrl
        ? `${supabaseUrl}/functions/v1/ical/${propertyId}.ics`
        : `/functions/v1/ical/${propertyId}.ics`;

  // If some legacy path produced a supabase.co proxy URL, fallback to current origin.
  if (origin && /\/\/.*\.supabase\.co\/functions\/v1\/ical\//.test(url)) {
    url = `${origin}/functions/v1/ical/${propertyId}.ics`;
  }

  console.log("iCal URL generated: " + url);

  return {
    url,
    isLocalhost: isLocalhostHostname(hostname),
  };
}


