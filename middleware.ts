export default function middleware(request: Request) {
  const hostname = request.headers.get('host') || '';
  const pathname = new URL(request.url).pathname;

  // For app.roomi.pro - serve SPA application
  // All routing is handled by vercel.json rewrites to /index.html
  if (hostname.startsWith('app.')) {
    // Skip middleware for static files - they're served directly
    if (pathname.startsWith('/assets/') || pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)$/)) {
      return new Response(null, { status: 200 });
    }

    // Let vercel.json rewrites handle all routing (everything goes to /index.html)
    return fetch(request);
  }

  // For other domains, allow request to proceed
  return new Response(null, { status: 200 });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files
     * Vercel Edge Middleware doesn't support regex capturing groups
     */
    '/',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)).*)',
  ],
};
