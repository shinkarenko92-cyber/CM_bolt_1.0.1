export default function middleware(request: Request) {
  const hostname = request.headers.get('host') || '';
  
  // This middleware is ONLY for app.roomi.pro deployment
  // Landing is deployed as a separate Vercel project
  if (!hostname.startsWith('app.')) {
    // For non-app domains, skip middleware (landing handles its own routing)
    return new Response(null, { status: 200 });
  }

  // For app.roomi.pro - skip middleware for static files
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/assets/') || pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)$/)) {
    return new Response(null, { status: 200 });
  }

  // Let vercel.json rewrites handle all SPA routing
  return fetch(request);
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
