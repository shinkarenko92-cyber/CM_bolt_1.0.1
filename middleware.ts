export default function middleware(request: Request) {
  const hostname = request.headers.get('host') || '';
  const url = new URL(request.url);
  const pathname = url.pathname;

  // For app.roomi.pro - serve application from dist/app/
  // All paths (except static files) should serve app/index.html for SPA routing
  if (hostname.startsWith('app.')) {
    // Skip middleware for static files - they're served directly
    if (pathname.startsWith('/app/assets/') || pathname.startsWith('/assets/') || pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)$/)) {
      return new Response(null, { status: 200 });
    }

    // For app.roomi.pro, rewrite all paths to /app/index.html (SPA fallback)
    // This includes /auth/avito-callback and all other routes
    const appUrl = new URL(request.url);
    appUrl.pathname = '/app/index.html';
    return fetch(new Request(appUrl, request));
  }

  // For roomi.pro (main domain) - serve landing page from dist/landing/
  if (hostname === 'roomi.pro' || (hostname.endsWith('.roomi.pro') && !hostname.startsWith('app.'))) {
    // Skip middleware for static files - they're served directly
    if (pathname.startsWith('/landing/assets/') || pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)$/)) {
      return new Response(null, { status: 200 });
    }

    // For root path, serve landing page
    if (pathname === '/' || pathname === '') {
      const landingUrl = new URL(request.url);
      landingUrl.pathname = '/landing/index.html';
      return fetch(new Request(landingUrl, request));
    }

    // For /landing paths, allow direct access
    if (pathname.startsWith('/landing/')) {
      return fetch(request);
    }

    // For any other path on roomi.pro, also serve landing (or 404)
    // This allows landing routes to work if needed
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
