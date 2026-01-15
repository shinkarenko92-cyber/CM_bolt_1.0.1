export default function middleware(request: Request) {
  const hostname = request.headers.get('host') || '';
  const url = new URL(request.url);
  const pathname = url.pathname;

  // For app.roomi.pro - serve application
  // All paths go to /index.html (app) via vercel.json rewrites
  if (hostname.startsWith('app.')) {
    return fetch(request);
  }

  // For roomi.pro (main domain) - serve landing page
  // Root (/) is rewritten to /landing/index.html by vercel.json
  // Static files are served directly by Vercel
  if (hostname === 'roomi.pro' || (hostname.endsWith('.roomi.pro') && !hostname.startsWith('app.'))) {
    // Skip middleware for static files - they're served directly
    if (pathname.startsWith('/landing/assets/') || pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)$/)) {
      return new Response(null, { status: 200 });
    }

    // For root path, let vercel.json rewrite handle it (/) -> /landing/index.html
    // For other paths, forward to allow rewrites to work
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
