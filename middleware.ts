export default function middleware(request: Request) {
  const hostname = request.headers.get('host') || '';
  const url = new URL(request.url);
  const pathname = url.pathname;

  // CRITICAL: For app.roomi.pro - forward to app (allow rewrites to work)
  // This ensures /auth/avito-callback and other app routes work correctly
  if (hostname.startsWith('app.')) {
    return fetch(request);
  }

  // For roomi.pro (main domain) - serve landing page
  if (hostname === 'roomi.pro' || (hostname.endsWith('.roomi.pro') && !hostname.startsWith('app.'))) {
    // Allow special paths to pass through (they'll be handled by vercel.json rewrites)
    if (pathname.startsWith('/auth/') || pathname.startsWith('/functions/')) {
      return fetch(request);
    }
    
    // For root path on roomi.pro, use fetch with modified URL to /landing/
    // This allows rewrites to work without visible redirect, and static files load correctly
    if (pathname === '/' || pathname === '') {
      const landingUrl = new URL(request.url);
      landingUrl.pathname = '/landing/';
      return fetch(new Request(landingUrl, request));
    }
    
    // For other paths on roomi.pro, allow rewrites to handle them
    return fetch(request);
  }

  // Default: allow request to proceed
  return new Response(null, { status: 200 });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files
     * IMPORTANT: Middleware will skip app.roomi.pro subdomain to allow vercel.json rewrites to work
     * Vercel Edge Middleware doesn't support regex capturing groups
     */
    '/',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)).*)',
  ],
};
