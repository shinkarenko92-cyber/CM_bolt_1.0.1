export default function middleware(request: Request) {
  const hostname = request.headers.get('host') || '';
  const url = new URL(request.url);
  const pathname = url.pathname;

  // For app.roomi.pro - serve application
  // All paths go to /index.html (app)
  if (hostname.startsWith('app.')) {
    // Special paths like /auth/avito-callback are handled by vercel.json rewrites
    return fetch(request);
  }

  // For roomi.pro (main domain) - serve landing page
  if (hostname === 'roomi.pro' || (hostname.endsWith('.roomi.pro') && !hostname.startsWith('app.'))) {
    // Skip middleware for static files (they're served directly by Vercel)
    if (pathname.startsWith('/landing/assets/') || pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)$/)) {
      return new Response(null, { status: 200 });
    }

    // For root path, serve landing page
    if (pathname === '/' || pathname === '') {
      const landingUrl = new URL(request.url);
      landingUrl.pathname = '/landing/index.html';
      return fetch(new Request(landingUrl, request));
    }

    // For other paths on roomi.pro, also try landing first
    // This handles any landing routes that might exist
    if (pathname.startsWith('/landing/')) {
      return fetch(request);
    }

    // For any other path, forward to allow vercel.json to handle
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
