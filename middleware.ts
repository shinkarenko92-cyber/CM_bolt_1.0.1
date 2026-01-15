export default function middleware(request: Request) {
  const url = new URL(request.url);
  const hostname = request.headers.get('host') || '';

  // CRITICAL: For app.roomi.pro and roomi.pro, we must NOT block vercel.json rewrites
  // Problem: In Vercel Edge Middleware, returning ANY Response blocks rewrites
  // Solution: Use fetch() to forward the request internally
  // This bypasses the middleware blocking and allows rewrites to process
  
  // For app.roomi.pro - forward to app
  if (hostname.startsWith('app.')) {
    return fetch(request);
  }

  // For roomi.pro (main domain) - forward to allow rewrites to handle landing page
  // Root (/) will be rewritten to /landing/index.html by vercel.json
  // This allows landing to be served at root without /landing in URL
  if (hostname === 'roomi.pro' || hostname.endsWith('.roomi.pro')) {
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
