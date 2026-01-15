export default function middleware(request: Request) {
  const hostname = request.headers.get('host') || '';
  const url = new URL(request.url);
  const pathname = url.pathname;

  // For app.roomi.pro - forward to app (allow rewrites to work)
  // This ensures /auth/avito-callback and other app routes work correctly
  if (hostname.startsWith('app.')) {
    return fetch(request);
  }

  // For roomi.pro (main domain) - serve landing page
  // Rewrite root path to /landing/index.html via vercel.json
  // Static files are served directly, so we just forward the request
  if (hostname === 'roomi.pro' || (hostname.endsWith('.roomi.pro') && !hostname.startsWith('app.'))) {
    // Allow all paths to pass through - vercel.json rewrites will handle routing
    // Root (/) will be rewritten to /landing/index.html
    // Static files (/landing/assets/*) will be served directly
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
